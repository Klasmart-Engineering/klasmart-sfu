import {createLogger, format, transports} from "winston"
import {ApolloServer} from "apollo-server";
import {SFU} from "./sfu"
import {MuteNotification, schema} from "./schema";
import {checkToken, JWT} from "./auth";
import {getNetworkInterfaceInfo} from "./networkInterfaces";
import {NetworkInterfaceInfo} from "os";
import fetch from "node-fetch"
import EC2 from "aws-sdk/clients/ec2"
import ECS from "aws-sdk/clients/ecs"
// @ts-ignore
import checkIp = require("check-ip")
import {setDockerId, setAvailable, setGraphQLConnections, setClusterId, reportConferenceStats} from "./reporting";

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
    try {
        const port = process.env.PORT || 8000 + Math.floor(128 * Math.random());
        const ip = (await getECSTaskENIPublicIP()) || getIPAddress()
        if (!ip) {
            Logger.error("No network interface found");
            process.exit(-4)
        }
        Logger.info(`ip address ${ip}`)
        const uri = `${ip}:${port}/graphql`
        const sfu = await SFU.create(ip, uri)
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
                onDisconnect: (websocket, connectionData) => {
                    if (!(connectionData as any).counted) {
                        return
                    }
                    connectionCount--
                    setGraphQLConnections(connectionCount)
                    if (connectionCount <= 0) {
                        startServerTimeout(sfu)
                    }
                    const {sessionId} = connectionData as any
                    Logger.info(`Disconnection(${connectionCount}) from ${sessionId}`)
                    sfu.disconnect(sessionId)
                }
            },
            resolvers: {
                Query: {
                    ready: () => true,
                },
                Mutation: {
                    rtpCapabilities: (_parent, {rtpCapabilities}, context: Context) => sfu.rtpCapabilitiesMessage(context, rtpCapabilities),
                    transport: (_parent, {producer, params}, context: Context) => sfu.transportMessage(context, producer, params),
                    producer: (_parent, {params}, context: Context) => sfu.producerMessage(context, params),
                    consumer: (_parent, {id, pause}, context: Context) => sfu.consumerMessage(context, id, pause),
                    stream: (_parent, {id, producerIds}, context: Context) => sfu.streamMessage(context, id, producerIds),
                    close: (_parent, {id}, context: Context) => sfu.closeMessage(context, id),
                    mute: (_parent, muteNotification: MuteNotification, context: Context) => sfu.muteMessage(context, muteNotification)
                },
                Subscription: {
                    media: {
                        subscribe: (_parent, {}, context: Context) => sfu.subscribe(context)
                    },
                }
            },
            context: async ({req, connection}) => {
                if (connection) {
                    return connection.context;
                }
                const token = await checkToken(req.headers.authorization)
                return {token: req.headers.authorization}
            }
        });
        server.listen({port}, () => {
            Logger.info(`🌎 Server available at \n${
                    [
                        {address: ip, family: "IPv4"},
                        ...getNetworkInterfaceInfo(),
                    ].map((info) => `\thttp://${
                        info.family === "IPv6"
                            ? `[${info.address}]`
                            : info.address
                    }:${port}${server.graphqlPath}`)
                        .join("\n")
                }`
            );
            setAvailable(true)
        })
    } catch (e) {
        Logger.error(e)
        process.exit(-1)
    }
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
        sfu.shutdown()
    }, 1000 * 60 * serverTimeout)
}

function stopServerTimeout() {
    if (timeout) {
        clearTimeout(timeout)
        timeout = undefined
    }
}

main()