import {hostname} from "os" 
import {createLogger, format, transports} from "winston"
import { createServer } from "http"
import express from "express"
import {ApolloServer} from "apollo-server-express"
import {SFU} from "./sfu"
import {schema} from "./schema"
import {checkToken, JWT} from "./auth"
import {getNetworkInterfaceInfo} from "./networkInterfaces"
import {NetworkInterfaceInfo} from "os"
import fetch from "node-fetch"
import EC2 from "aws-sdk/clients/ec2"
import ECS from "aws-sdk/clients/ecs"
// @ts-ignore
import checkIp = require("check-ip")
import {setDockerId, setGraphQLConnections, setClusterId, reportConferenceStats} from "./reporting"
import { register, collectDefaultMetrics, Gauge } from "prom-client"
import { GlobalMuteNotification, MuteNotification } from "./interfaces"

collectDefaultMetrics({})

const logFormat = format.printf(({level, message, label, timestamp}) => {
    return `${timestamp} [${level}]: ${message} service: ${label}`
})

export const Logger = createLogger(
    {
        level: 'info',
        format: format.combine(
            format.colorize(),
            format.timestamp(),
            format.label({label: 'default'}),
            logFormat
        ),
        defaultMeta: {service: 'default'},
        transports: [
            new transports.Console(
                {
                    level: 'info',
                }
            ),
            new transports.File(
                {
                    level: 'info',
                    filename: `logs/sfu_${
                        new Date().toLocaleDateString("en", {
                            year: "numeric",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit"
                        })
                            .replace(/,/g, "")
                            .replace(/\//g, "-")
                            .replace(/ /g, "_")
                    }.log`
                }
            )
        ]
    }
)

export interface Context {
    roomId?: string,
    sessionId?: string,
    token?: JWT
}

const ECSClient = new ECS()
const EC2Client = new EC2()

async function getECSTaskENIPublicIP() {
    const ecsMetadataURI = process.env.ECS_CONTAINER_METADATA_URI_V4 || process.env.ECS_CONTAINER_METADATA_URI
    if (!ecsMetadataURI) {
        return
    }
    Logger.info(ecsMetadataURI)
    const response = await fetch(`${ecsMetadataURI}`)
    const ecsMetadata = await response.json()
    setDockerId(ecsMetadata.DockerId)
    const clusterARN = ecsMetadata.Labels && ecsMetadata.Labels["com.amazonaws.ecs.cluster"] as string
    setClusterId(clusterARN)
    const taskARN = ecsMetadata.Labels && ecsMetadata.Labels["com.amazonaws.ecs.task-arn"] as string
    if (!taskARN) {
        return
    }
    const tasks = await ECSClient.describeTasks({cluster: clusterARN, tasks: [taskARN]}).promise()
    if (!tasks.tasks) {
        return
    }
    for (const task of tasks.tasks) {
        if (!task.attachments) {
            continue
        }
        for (const attachment of task.attachments) {
            if (attachment.type !== "ElasticNetworkInterface") {
                continue
            }
            if (attachment.status === "DELETED") {
                continue
            }
            if (!attachment.details) {
                continue
            }
            for (const detail of attachment.details) {
                if (detail.name !== "networkInterfaceId") {
                    continue
                }
                if (!detail.value) {
                    continue
                }
                const enis = await EC2Client.describeNetworkInterfaces({NetworkInterfaceIds: [detail.value]}).promise()
                if (!enis.NetworkInterfaces) {
                    continue
                }
                for (const eni of enis.NetworkInterfaces) {
                    if (!eni.Association) {
                        continue
                    }
                    if (!eni.Association.PublicIp) {
                        continue
                    }
                    return eni.Association.PublicIp
                }
            }
        }
    }
}

function getIPAddress() {
    //Sort network interfaces to prioritize external and IPv4 addresses
    function scoreInterface(info: NetworkInterfaceInfo) {
        const check: any = checkIp(info.address)
        let score = 0
        if (check.isPublic) {
            score += 4
        }
        if (!info.internal) {
            score += 2
        }
        if (info.family === "IPv4") {
            score += 1
        }
        return score
    }

    const interfaces = getNetworkInterfaceInfo()
    interfaces.sort((a, b) => scoreInterface(b) - scoreInterface(a))
    Logger.info(JSON.stringify(interfaces))
    if (interfaces.length <= 0) {
        return
    }
    return interfaces[0].address
}

export const connectionCount = new Map<string, number>()

async function main() {
    const ip = (await getECSTaskENIPublicIP()) || getIPAddress()
    if (!ip) {
        Logger.error("No network interface found");
        process.exit(-4)
    }
    Logger.info(`ip address ${ip}`)
    const sfu = await SFU.create(ip)
    setTimeout(() => {
        reportConferenceStats(sfu)
    }, 10000)
    let connectionCount = 0

    const server = new ApolloServer({
        typeDefs: schema,
        subscriptions: {
            keepAlive: 1000,
            onConnect: async ({roomId, sessionId, authToken}: any, _webSocket, connectionData: any) => {
                const token = await checkToken(authToken);
                connectionCount++
                setGraphQLConnections(connectionCount)
                stopServerTimeout()
                Logger.info(`Connection(${connectionCount}) from ${sessionId}`)
                connectionData.counted = true
                connectionData.sessionId = sessionId;
                connectionData.roomId = roomId;
                return {roomId, sessionId, token} as Context;
            },
            onDisconnect: async (websocket, connectionData) => {
                if (!(connectionData as any).counted) {
                    return
                }
                connectionCount--
                setGraphQLConnections(connectionCount)
                if (connectionCount <= 0) {
                    startServerTimeout(sfu)
                }
                const {sessionId} = connectionData as any
                const context: Context = await connectionData.initPromise;
                Logger.info(`Disconnection(${connectionCount}) from ${sessionId}`)
                sfu.disconnect(context, sessionId).catch(e => Logger.error(e))
            }
        },
        resolvers: {
            Query: {
                ready: () => true,
                retrieveGlobalMute: (_parent, {roomId}, context: Context) => sfu.globalMuteQuery(context, roomId).catch(e => Logger.error(e)),
            },
            Mutation: {
                rtpCapabilities: (_parent, {rtpCapabilities}, context: Context) => sfu.rtpCapabilitiesMessage(context, rtpCapabilities).catch(e => Logger.error(e)),
                transport: (_parent, {producer, params}, context: Context) => sfu.transportMessage(context, producer, params).catch(e => Logger.error(e)),
                producer: (_parent, {params}, context: Context) => sfu.producerMessage(context, params).catch(e => Logger.error(e)),
                consumer: (_parent, {id, pause}, context: Context) => sfu.consumerMessage(context, id, pause).catch(e => Logger.error(e)),
                stream: (_parent, {id, producerIds}, context: Context) => sfu.streamMessage(context, id, producerIds).catch(e => Logger.error(e)),
                close: (_parent, {id}, context: Context) => sfu.closeMessage(context, id).catch(e => Logger.error(e)),
                mute: (_parent, muteNotification: MuteNotification, context: Context) => sfu.muteMessage(context, muteNotification).catch(e => Logger.error(e)),
                updateGlobalMute: (_parent, globalMuteNotification: GlobalMuteNotification, context: Context) => sfu.globalMuteMutation(context, globalMuteNotification).catch(e => Logger.error(e)),
                endClass: (_parent, {roomId}, context: Context) => sfu.endClassMessage(context, roomId).catch(e => Logger.error(e))
            },
            Subscription: {
                media: {
                    subscribe: (_parent, {}, context: Context) => sfu.subscribe(context).catch(e => Logger.error(e))
                },
            }
        },
        context: async ({req, connection}) => {
            if (connection) {
                return connection.context;
            }
            const token = await checkToken(req.headers.authorization)
            return {}
        }
    });

    new Gauge({
        name: 'sfuCount',
        help: 'Number of SFUs currently connected to the same redis db (shard?)',
        labelNames: ["type"],
        async collect() {
            try {
                const {
                    availableCount,
                    otherCount,
                } = await sfu.sfuStats()
                this.labels("available").set(availableCount);
                this.labels("unavailable").set(otherCount);
                this.labels("total").set(availableCount+otherCount);
            } catch(e) {
                this.labels("available").set(-1);
                this.labels("unavailable").set(-1);
                this.labels("total").set(-1);
                console.log(e)
            }
        },
    });

    const app = express();
    app.get('/metrics', async (_req, res) => {
        try {
            res.set('Content-Type', register.contentType);
            const metrics = await register.metrics()
            res.end(metrics);
        } catch (ex) {
            console.error(ex)
            res.status(500).end(ex.toString());
        }
    });
    server.applyMiddleware({app})
    const httpServer = createServer(app)
    server.installSubscriptionHandlers(httpServer)

    httpServer.listen({port: process.env.PORT}, () => { Logger.info(`🌎 Server available`); })
    const address = httpServer.address()
    if(!address || typeof address === "string") { throw new Error("Unexpected address format") }

    const host = process.env.USE_IP ? ip : (process.env.HOSTNAME_OVERRIDE || hostname())
    const uri = `${host}:${address.port}${server.subscriptionsPath}`
    console.log(`Announcing address for webRTC signaling: ${uri}`)
    await sfu.claimRoom(uri)
}

let timeout: NodeJS.Timeout | undefined

export function startServerTimeout(sfu: SFU) {
    if (timeout) {
        clearTimeout(timeout)
    }
    let serverTimeoutEnvVar = parseInt(process.env.SERVER_TIMEOUT !== undefined ? process.env.SERVER_TIMEOUT : '')
    let serverTimeout = !isNaN(serverTimeoutEnvVar) ? serverTimeoutEnvVar : 5
    timeout = setTimeout(() => {
        Logger.error(`There have been no new connections after ${serverTimeout} minutes, shutting down`)
        sfu.shutdown().catch(e => Logger.error(e))
    }, 1000 * 60 * serverTimeout)
}

function stopServerTimeout() {
    if (timeout) {
        clearTimeout(timeout)
        timeout = undefined
    }
}

main().catch(e => {
    Logger.error(e)
    process.exit(-1)
})