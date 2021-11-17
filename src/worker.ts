import {
    types as MediaSoup,
} from "mediasoup"
import {v4 as uuid} from "uuid"
import {Client} from "./client"
import {EventEmitter} from "events"

export enum WorkerType {
    PRODUCER, // Worker only has producers, no user consumers
    CONSUMER, // Worker only has consumers from users
    MIXED, // Worker deals with both producers and consumers
}

export class Worker {
    public readonly id = uuid()
    public readonly emitter = new EventEmitter()

    public clients: Map<string, Client> = new Map()
    public consumers: Map<string, MediaSoup.Consumer> = new Map()
    public producers: Map<string, MediaSoup.Producer> = new Map()

    constructor(
        public readonly workerType: WorkerType,
        private readonly router: MediaSoup.Router,
        public readonly audioLevelObserver: MediaSoup.AudioLevelObserver,
    ) { }

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

    // private getClient(sessionId: string) {
    //     const client = this.clients.get(sessionId)
    //     if (!client) {
    //         throw new Error(`SessionId: ${sessionId} has not yet been registered as a client on worker ${this.id}!`)
    //     }
    //     return client;
    // }

    public async subscribe(client: Client) {
        return client.subscribe()
    }

    public getRouter(): MediaSoup.Router {
        return this.router
    }
}