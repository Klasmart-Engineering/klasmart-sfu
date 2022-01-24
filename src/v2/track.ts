import { ClientId, ClientV2 } from "./client";
import { Consumer } from "./consumer";
import {
    types as MediaSoup
} from "mediasoup";
import { nanoid } from "nanoid";
import { NewType } from "./newType";
import { EventEmitter } from "eventemitter3";

export type ProducerId = NewType<string, "ProducerId">
export function newProducerId(id = nanoid()) { return id as ProducerId; }

export class Track {
    public static async create(router: MediaSoup.Router, owner: ClientId, transport: MediaSoup.WebRtcTransport, kind: MediaSoup.MediaKind, rtpParameters: MediaSoup.RtpParameters): Promise<Track> {
        const id = newProducerId();
        const producer = await transport.produce({
            id,
            kind,
            rtpParameters,
        });
        producer.on("transportclose", () => { producer.close(); });
        return new Track(owner, producer, router);
    }

    private readonly consumers = new Map<ClientId, Consumer>();
    private _pausedByAdmin = false;
    private _pausedByOwner = false;

    public get producerId() { return this.producer.id as ProducerId; }
    public get numConsumers() { return this.consumers.size; }

    private readonly emitter = new EventEmitter<TrackEventMap>();
    public readonly on: TrackEventEmitter["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: TrackEventEmitter["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: TrackEventEmitter["once"] = (event, listener) => this.emitter.once(event, listener);

    private constructor(
        public readonly owner: ClientId,
        private readonly producer: MediaSoup.Producer,
        private readonly router: MediaSoup.Router,
    ) {
        this.producer.on("close", () => this.emitter.emit("closed"));
    }

    public async consume(clientId: ClientId, transport: MediaSoup.WebRtcTransport, rtpCapabilities: MediaSoup.RtpCapabilities) {
        if(clientId === this.owner) { throw new Error("Owner can not consume a track that it produces"); }
        if (this.consumers.get(clientId)) { throw new Error("Already consuming track"); }
        const producerId = this.producerId;
        if (!this.router.canConsume({rtpCapabilities, producerId})) { throw new Error("Client is not capable of consuming this producer"); }

        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);
        consumer.on("closed", () => {
            this.consumers.delete(clientId);
        });
        this.consumers.set(clientId, consumer);
        return consumer;
    }

    public end() {
        this.producer.close();
        this.emitter.emit("closed");
    }

    public async pauseClient(client: ClientV2, paused: boolean) {
        if (this.owner === client.id) {
            await this.setPausedByOwner(paused);
        } else {
            const consumer = this.consumers.get(client.id);
            if (!consumer) { throw new Error("Consumer not found"); }
            await consumer.setSinkPaused(paused);
        }
    }

    public get pausedByAdmin() { return this._pausedByAdmin; }
    public async setPausedByAdmin(paused: boolean) {
        if(this._pausedByAdmin === paused) { return; }
        this._pausedByAdmin = paused;
        await this.updateProducerPauseState();
        this.emitter.emit("pausedByAdmin", paused);
    }

    public get pausedByOwner() { return this._pausedByOwner; }
    private async setPausedByOwner(paused: boolean) {
        if(this._pausedByOwner === paused) { return; }
        this._pausedByOwner = paused;
        await this.updateProducerPauseState();
        this.emitter.emit("pausedByOwner", paused);
    }

    private async updateProducerPauseState() {
        const producerShouldBePaused = this._pausedByOwner || this._pausedByAdmin;
        if(producerShouldBePaused === this.producer.paused) { return; }
        if(this.producer.paused) {
            await this.producer.resume();
        } else {
            await this.producer.pause();
        }
    }
}

export type TrackEventEmitter = Track["emitter"];

export type TrackEventMap = {
    pausedByOwner: (paused: boolean) => void,
    pausedByAdmin: (paused: boolean) => void,
    closed: () => void
}
