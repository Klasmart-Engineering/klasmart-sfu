import {ApolloServer, AuthenticationError, ForbiddenError} from "apollo-server-express";
import {schema} from "../schema";
import {checkAuthorizationToken} from "../auth";
import cookie from "cookie";
import {checkToken} from "kidsloop-token-validation";
import {setGraphQLConnections} from "../reporting";
import {Logger} from "../logger";
import {Context, GlobalMuteNotification, MuteNotification} from "../types";
import {withTransaction} from "../withTransaction";
// custom implementation awaiting official support https://github.com/newrelic/newrelic-node-apollo-server-plugin/issues/71
import newRelicApolloServerPlugin from "@newrelic/apollo-server-plugin";
import {SFU} from "../sfu";
import {HttpServer} from "./httpServer";
import {execute, subscribe} from "graphql";
import {SubscriptionServer} from "subscriptions-transport-ws";
import {makeExecutableSchema} from "@graphql-tools/schema";
import {WebSocket} from "ws";

export class ApolloNetworkInterface {
    private timeout?: NodeJS.Timeout;
    public server: ApolloServer;

    public constructor(private sfu: SFU, private httpServer: HttpServer, private connectionCount = 0) {
        this.httpServer.initializeServer();
        const apolloSchema = makeExecutableSchema({
            typeDefs: schema,
            resolvers: {
                Query: {
                    ready: () => withTransaction("ready", () => true),
                    retrieveGlobalMute: (_parent, {roomId}) => this.sfu.globalMuteQuery(roomId).catch(e => Logger.error(e)),
                    retrieveMuteStatuses: (_parent, _args, context: Context) => this.sfu.muteStatusQuery(context).catch(e => Logger.error(e)),
                },
                Mutation: {
                    rtpCapabilities: (_parent, {rtpCapabilities}, context: Context) => this.sfu.rtpCapabilitiesMessage(context, rtpCapabilities).catch(e => Logger.error(e)),
                    transport: (_parent, {
                        producer,
                        params
                    }, context: Context) => this.sfu.transportMessage(context, producer, params).catch(e => Logger.error(e)),
                    producer: (_parent, {params}, context: Context) => this.sfu.producerMessage(context, params).catch(e => Logger.error(e)),
                    consumer: (_parent, {
                        id,
                        pause
                    }, context: Context) => this.sfu.consumerMessage(context, id, pause).catch(e => Logger.error(e)),
                    stream: (_parent, {
                        id,
                        producerIds
                    }, context: Context) => this.sfu.streamMessage(context, id, producerIds).catch(e => Logger.error(e)),
                    close: (_parent, {id}, context: Context) => this.sfu.closeMessage(context, id).catch(e => Logger.error(e)),
                    mute: (_parent, muteNotification: MuteNotification, context: Context) => this.sfu.muteMessage(context, muteNotification).catch(e => Logger.error(e)),
                    updateGlobalMute: (_parent, globalMuteNotification: GlobalMuteNotification, context: Context) => this.sfu.globalMuteMutation(context, globalMuteNotification).catch(e => Logger.error(e)),
                    endClass: (_parent, {roomId}, context: Context) => this.sfu.endClassMessage(context, roomId).catch(e => Logger.error(e))
                },
                Subscription: {
                    media: {
                        // eslint-disable-next-line no-empty-pattern
                        subscribe: (_parent, {}, context: Context) => this.sfu.subscribe(context).catch(e => Logger.error(e))
                    },
                }
            },
        });

        const subscriptionServer = SubscriptionServer.create({
            schema: apolloSchema,
            execute,
            subscribe,
            onConnect: async ({sessionId, authToken}: never, _webSocket: WebSocket, connectionData: any) => {
                const token = await checkAuthorizationToken(authToken).catch((e) => {
                    throw new ForbiddenError(e);
                });
                const roomId = String(token.roomid);
                if (!sfu.roomId || sfu.roomId !== roomId) {
                    throw new Error(`Room(${token.roomid}) unavailable`);
                }
                if (!process.env.DISABLE_AUTH) {
                    const rawCookies = connectionData.request.headers.cookie;
                    const cookies = rawCookies ? cookie.parse(rawCookies) : undefined;
                    const authenticationToken = await (checkToken(cookies?.access).catch((e) => {
                        if (e.name === "TokenExpiredError") {
                            throw new AuthenticationError("AuthenticationExpired");
                        }
                        throw new AuthenticationError("AuthenticationInvalid");
                    }));
                    if (!authenticationToken.id || authenticationToken.id !== token.userid) {
                        throw new ForbiddenError("The authorization token does not match your session token");
                    }
                } else {
                    Logger.warn("skipping AUTHENTICATION");
                }
                this.connectionCount++;
                setGraphQLConnections(this.connectionCount);
                this.stopServerTimeout();
                Logger.info(`Connection(${this.connectionCount}) from ${sessionId}`);
                connectionData.counted = true;
                connectionData.sessionId = sessionId;
                connectionData.roomId = roomId;
                return {roomId, sessionId, token} as Context;
            },
            onDisconnect: async (_websocket: unknown, connectionData: any) => {
                Logger.warn(`SubscriptionServer.onDisconnect: ${connectionData.sessionId}`);
                if (!connectionData.counted) {
                    return;
                }
                this.connectionCount--;
                setGraphQLConnections(this.connectionCount);
                if (this.connectionCount <= 0) {
                    this.startServerTimeout();
                }
                const context: Context = await connectionData.initPromise;
                Logger.info(`Disconnection(${this.connectionCount}) from ${context.sessionId}`);
                await this.sfu.resetGlobalMute(context);
                this.sfu.disconnect(context).catch(e => Logger.error(e));
            }
        }, {server: this.httpServer.server, path: "/graphql"});

        this.server = new ApolloServer({
            schema: apolloSchema,
            context: async ({req}) => {
                Logger.info(`context ${req}`);
                const authHeader = req.headers.authorization;
                const rawAuthorizationToken = authHeader?.substr(0, 7).toLowerCase() === "bearer" ? authHeader.substr(7) : authHeader;
                const token = await checkAuthorizationToken(rawAuthorizationToken).catch((e) => {
                    throw new ForbiddenError(e);
                });
                if (!this.sfu.roomId || token.roomid !== this.sfu.roomId) {
                    throw new Error(`Room(${token.roomid}) unavailable`);
                }

                if (!process.env.DISABLE_AUTH) {
                    const rawCookies = req.headers.cookie;
                    const cookies = rawCookies ? cookie.parse(rawCookies) : undefined;
                    const authenticationToken = await checkToken(cookies?.access).catch((e) => {
                        throw new AuthenticationError(e);
                    });
                    if (!authenticationToken.id || authenticationToken.id !== token.userid) {
                        throw new ForbiddenError("The authorization token does not match your session token");
                    }
                } else {
                    Logger.warn("skipping AUTHENTICATION");
                }
                return {token};
            },
            plugins: [
                {
                    async serverWillStart() {
                        return {
                            async drainServer() {
                                subscriptionServer.close();
                            }
                        };
                    }
                },
                // Note - Apollo server plugin should be the last plugin in the list
                newRelicApolloServerPlugin
            ]
        });
    }

    public async start(ip: string) {
        await this.server.start();
        this.server.applyMiddleware({app: this.httpServer.app});
        this.httpServer.startServer(ip, this.server.graphqlPath);
    }

    private startServerTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        const serverTimeoutEnvVar = parseInt(process.env.SERVER_TIMEOUT as string);
        const serverTimeout = !isNaN(serverTimeoutEnvVar) ? serverTimeoutEnvVar : 5;
        this.timeout = setTimeout(() => {
            Logger.error(`There have been no new connections after ${serverTimeout} minutes, shutting down`);
            this.sfu.shutdown().catch(e => Logger.error(e));
        }, 1000 * 60 * serverTimeout);
    }

    private stopServerTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }
}
