import { NewType } from "./newType";
import { nanoid } from "nanoid";
import { ClientId } from "./client";
import { Producer } from "./producer";
import { Consumer } from "./consumer";

export type TrackId = NewType<string, "TrackId">
export function newTrackId(id = nanoid()) { return id as TrackId; }

export class Track {
    constructor(
        public readonly owner: ClientId,
        private readonly producer: Producer,
    ) {}
    private readonly consumers = new Map<ClientId, Consumer>();

    public get producerId() { return this.producer.id; }
    public get numConsumers() { return this.consumers.size; }

    public addConsumer(clientId: ClientId, consumer: Consumer) {
        if(clientId === this.owner) { throw new Error("Owner can not consume a track that it produces"); }
        this.consumers.set(clientId, consumer);
        consumer.emitter.on("closed", () => this.consumers.delete(clientId));
    }

    public consumer(clientId: ClientId) {
        if (clientId === this.owner) { return; }
        return this.consumers.get(clientId);
    }

    public end() {
        this.producer.close();
    }

    public async globalPause(paused: boolean) {
        await this.producer.setGloballyPaused(paused);
    }

    public async localPause(clientId: ClientId, paused: boolean) {
        if (this.owner === clientId) {
            await this.producer.setLocallyPaused(paused);
        } else {
            const consumer = this.consumer(clientId);
            if (!consumer) { throw new Error("Consumer not found"); }
            await consumer.setLocallyPaused(paused);
        }
    }
}

