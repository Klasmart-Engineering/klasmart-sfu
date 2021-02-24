import {
    types as MediaSoup,
} from "mediasoup"
import {v4 as uuid} from "uuid"
import {Client, Stream} from "./client"
import {Logger} from "./entry"
import {EventEmitter} from "events"

export enum WorkerType {
    PRODUCER, // Worker only has producers, no user consumers
    CONSUMER, // Worker only has consumers from users
    MIXED, // Worker deals with both producers and consumers
}

export class Worker {
    public readonly id: string
    public readonly workerType: WorkerType
    public readonly emitter = new EventEmitter()

    private readonly worker: MediaSoup.Worker
    private readonly router: MediaSoup.Router
    public clients: Map<string, Client> = new Map()
    public consumers: Map<string, MediaSoup.Consumer> = new Map()
    public producers: Map<string, MediaSoup.Producer> = new Map()

    constructor(worker: MediaSoup.Worker, workerType: WorkerType, router: MediaSoup.Router) {
        this.id = uuid()
        this.worker = worker
        this.workerType = workerType
        this.router = router
    }

    public numProducers(): number {
        return this.producers.size
    }

    public numConsumers(): number {
        return this.consumers.size
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

    private getClient(sessionId: string) {
        const client = this.clients.get(sessionId)
        if (!client) {
            throw new Error(`SessionId: ${sessionId} has not yet been registered as a client on worker ${this.id}!`)
        }
        return client;
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