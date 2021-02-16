import {
    types as MediaSoup,
} from "mediasoup"
import {v4 as uuid} from "uuid"
import {Client, Stream} from "./client"
import {Context, Logger} from "./entry"
import {JWT} from "./auth"
import {MuteNotification} from "./schema"
import {EventEmitter} from "events"

export enum WorkerType {
    PRODUCER, // Worker only has producers, no user consumers
    CONSUMER, // Worker only has consumers from users
    MIXED, // Worker deals with both producers and consumers
}

export class Worker {
    public readonly id: string
    public numProducers: number = 0
    public numConsumers: number = 0
    public workerType: WorkerType
    public emitter = new EventEmitter()

    private worker: MediaSoup.Worker
    private router: MediaSoup.Router
    private clients: Map<string, Client> = new Map<string, Client>()

    constructor(worker: MediaSoup.Worker, workerType: WorkerType, router: MediaSoup.Router) {
        this.id = uuid()
        this.worker = worker
        this.workerType = workerType
        this.router = router
    }

    public connect(sessionId: string) {
        const client = this.clients.get(sessionId)
        if (!client) {
            return
        }
        client.connect()
    }

    public disconnect(sessionId: string) {
        const client = this.clients.get(sessionId)
        if (!client) {
            return
        }
        client.disconnect()
    }

    public async rtpCapabilitiesMessage(context: Context, rtpCapabilities: string) {
        Logger.info(`rtpCapabilitiesMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.rtpCapabilitiesMessage(rtpCapabilities)
    }

    public async transportMessage(context: Context, producer: boolean, params: string) {
        Logger.info(`transportMessage(${producer}) from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.transportMessage(producer, params)
    }

    public async producerMessage(context: Context, params: string) {
        Logger.info(`producerMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.producerMessage(params)
    }

    public async consumerMessage(context: Context, id: string, pause?: boolean) {
        Logger.info(`consumerMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.consumerMessage(id, pause)
    }

    public async streamMessage(context: Context, id: string, producerIds: string[]) {
        Logger.info(`streamMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.streamMessage(id, producerIds)
    }

    public async closeMessage(context: Context, id: string) {
        Logger.info(`closeMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.closeMessage(id)
    }

    public async muteMessage(context: Context, muteNotification: MuteNotification): Promise<boolean> {
        Logger.info(`muteMessage from ${context.sessionId}`)
        let {roomId, sessionId, producerId, consumerId, audio, video} = muteNotification
        if (!context.sessionId) {
            Logger.warn("No sessionId in context")
            return false
        }
        const sourceClient = await this.getOrCreateClient(context.sessionId)
        const targetClient = await this.getOrCreateClient(sessionId)
        let self = sessionId === context.sessionId
        let teacher = sourceClient.jwt.teacher
        let clientMessages: Promise<boolean>[] = []
        if (teacher && !self) {
            // Find the producer id the teacher is trying to mute
            for (const client of this.clients.values()) {
                if (audio !== undefined) {
                    producerId = Array.from(targetClient.producers.values()).find((p) => p.kind === "audio")?.id
                } else if (video !== undefined) {
                    producerId = Array.from(targetClient.producers.values()).find((p) => p.kind === "video")?.id
                }
                if (producerId) {
                    return client.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher)
                }
            }
        } else if (self) {
            if ((!targetClient.teacherAudioMuted && audio !== undefined) ||
                (!targetClient.teacherVideoMuted && video !== undefined)) {
                for (const client of this.clients.values()) {
                    clientMessages.push(client.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher))
                }
            } else {
                return sourceClient.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher)
            }
        } else {
            return sourceClient.muteMessage(roomId, sessionId, producerId, consumerId, audio, video)
        }

        return (await Promise.all(clientMessages)).reduce((p, c) => c && p)
    }

    private async newStream(stream: Stream) {
        Logger.info(`New Stream(${stream.sessionId}_${stream.id})`)
        const forwardPromises = []
        for (const [id, client] of this.clients) {
            if (id === stream.sessionId) {
                continue
            }
            const forwardPromise = client.forwardStream(stream, this.roomId!)
            forwardPromise.then(() => {
                Logger.info(`Forwarding new Stream(${stream.sessionId}_${stream.id}) to Client(${id})`)
            })
            forwardPromises.push(forwardPromise)
        }
        await Promise.all(forwardPromises)
    }

    public async subscribe({sessionId, token}: Context) {
        if (!sessionId) {
            Logger.error("Can not initiate subscription without sessionId");
            return
        }
        if (!token) {
            Logger.error("Can not initiate subscription without token");
            return
        }
        Logger.info(`Subscription from ${sessionId}`)
        const client = await this.getOrCreateClient(sessionId, token)
        if (!this.roomStatusMap.get(token.roomid)) {
            this.roomStatusMap.set(token.roomid, true)
        }
        return client.subscribe()
    }

    public async endClassMessage(context: Context, roomId?: string): Promise<boolean> {
        Logger.info(`endClassMessage from: ${context.sessionId}`)
        if (!context.sessionId) {
            Logger.warn("No sessionId in context")
            return false
        }
        const sourceClient = await this.getOrCreateClient(context.sessionId)
        let teacher = sourceClient.jwt.teacher

        if (!teacher) {
            Logger.warn(`SessionId: ${context.sessionId} attempted to end the class!`)
            return false
        }

        for (const client of this.clients.values()) {
            await client.endClassMessage(roomId)
        }

        return true
    }

    private async getOrCreateClient(id: string, token?: JWT): Promise<Client> {
        let client = this.clients.get(id)
        if (!client) {
            if (!token) {
                Logger.error("Token must be supplied to create a client")
                throw new Error("Token must be supplied to create a client")
            }

            // TODO: Select a worker to assign the client to


            client = await Client.create(
                id,

                this.listenIps,
                () => {
                    this.clients.delete(id)
                },
                token
            )
            Logger.info(`New Client(${id})`)
            for (const [otherId, otherClient] of this.clients) {
                for (const stream of otherClient.getStreams()) {
                    client.forwardStream(stream, this.roomId!).then(() => {
                        Logger.info(`Forwarding Stream(${stream.sessionId}_${stream.id}) from Client(${otherId}) to Client(${id})`)
                    })
                }
            }
            this.clients.set(id, client)
            client.emitter.on("stream", (s: Stream) => this.newStream(s))
        }
        return client
    }
}