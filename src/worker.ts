import {
    types as MediaSoup,
} from "mediasoup"
import {v4 as uuid} from "uuid"
import {Client, Stream} from "./client"
import {Logger} from "./entry"
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
    public readonly workerType: WorkerType
    public readonly emitter = new EventEmitter()

    private readonly worker: MediaSoup.Worker
    private readonly router: MediaSoup.Router
    public clients: Map<string, Client> = new Map<string, Client>()

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

    public async rtpCapabilitiesMessage(sessionId: string, rtpCapabilities: string) {
        Logger.info(`rtpCapabilitiesMessage from ${sessionId}`)
        const client = this.getClient(sessionId);
        return client.rtpCapabilitiesMessage(rtpCapabilities)
    }

    private getClient(sessionId: string) {
        const client = this.clients.get(sessionId)
        if (!client) {
            throw new Error(`SessionId: ${sessionId} has not yet been registered as a client on worker ${this.id}!`)
        }
        return client;
    }

    public async transportMessage(sessionId: string, producer: boolean, params: string) {
        Logger.info(`transportMessage(${producer}) from ${sessionId}`)
        const client = this.getClient(sessionId)
        return await client.transportMessage(producer, params)
    }

    public async producerMessage(sessionId: string, params: string) {
        Logger.info(`producerMessage from ${sessionId}`)
        const client = this.getClient(sessionId)
        return await client.producerMessage(params)
    }

    public consumerMessage(sessionId: string, id: string, pause?: boolean) {
        Logger.info(`consumerMessage from ${sessionId}`)
        const client = this.getClient(sessionId)
        return client.consumerMessage(id, pause)
    }

    public streamMessage(sessionId: string, id: string, producerIds: string[]) {
        Logger.info(`streamMessage from ${sessionId}`)
        const client = this.getClient(sessionId)
        return client.streamMessage(id, producerIds)
    }

    public async closeMessage(sessionId: string, id: string) {
        Logger.info(`closeMessage from ${sessionId}`)
        const client = this.getClient(sessionId)
        return await client.closeMessage(id)
    }

    public async muteMessage(sourceSessionId: string, muteNotification: MuteNotification): Promise<boolean> {
        Logger.info(`muteMessage from ${sourceSessionId}`)
        let {roomId, sessionId, producerId, consumerId, audio, video} = muteNotification

        const sourceClient = this.getClient(sourceSessionId)
        const targetClient = this.getClient(sessionId)
        if (!targetClient) {
            throw new Error("Target client ")
        }

        let self = sessionId === sourceSessionId
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

    public async newStream(stream: Stream, roomId: string) {
        Logger.info(`New Stream(${stream.sessionId}_${stream.id})`)
        const forwardPromises = []
        for (const [id, client] of this.clients) {
            if (id === stream.sessionId) {
                continue
            }
            const forwardPromise = client.forwardStream(stream, roomId)
            forwardPromise.then(() => {
                Logger.info(`Forwarding new Stream(${stream.sessionId}_${stream.id}) to Client(${id})`)
            })
            forwardPromises.push(forwardPromise)
        }
        await Promise.all(forwardPromises)
    }

    public async subscribe(client: Client) {
        return client.subscribe()
    }

    public getRouter(): MediaSoup.Router {
        return this.router
    }
}