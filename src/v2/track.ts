import { ClientId } from "./client";
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
            paused: true
        });
        producer.on("transportclose", () => { producer.close(); });
        return new Track(owner, producer, router);
    }

    private readonly consumers = new Map<ClientId, Consumer>();
    private _globallyPaused = false;
    private _locallyPaused: boolean;

    public get globallyPaused() { return this._globallyPaused; }
    public get locallyPaused() { return this._locallyPaused; }
    public get producerId() { return this.producer.id as ProducerId; }
    public get numConsumers() { return this.consumers.size; }
    
    public readonly emitter = new EventEmitter<TrackEventMap>();
    public readonly on = this.emitter.on.bind(this);
    public readonly once = this.emitter.once.bind(this);
    
    private constructor(
        public readonly owner: ClientId,
        private readonly producer: MediaSoup.Producer,
        private readonly router: MediaSoup.Router,
    ) {
        this._locallyPaused = producer.paused;
        this.producer.on("close", () => this.emitter.emit("closed"));
    }


    public async consume(clientId: ClientId, transport: MediaSoup.WebRtcTransport, rtpCapabilities: MediaSoup.RtpCapabilities) {
        if(clientId === this.owner) { throw new Error("Owner can not consume a track that it produces"); }
        if (this.consumers.get(clientId)) { throw new Error("Already consuming track"); }
        const producerId = this.producerId;

        if (!this.router.canConsume({rtpCapabilities, producerId})) {
            throw new Error("Client is not capable of consuming this producer");
        }

        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);
        this.consumers.set(clientId, consumer);
        return consumer;
    }

    public end() {
        this.producer.close();
    }

    public async globalPause(paused: boolean) {
        this._globallyPaused = paused;
        await this.updateProducerPauseState();
    }

    public async localPause(clientId: ClientId, paused: boolean) {
        if (this.owner === clientId) {
            this._locallyPaused = paused;
            await this.updateProducerPauseState();
        } else {
            const consumer = this.consumers.get(clientId);
            if (!consumer) { throw new Error("Consumer not found"); }
            await consumer.setLocallyPaused(paused);
        }
    }

    private async updateProducerPauseState() {
        const producerShouldBePaused = this.locallyPaused || this.globallyPaused;
        if (producerShouldBePaused && !this.producer.paused) {
            await this.producer.pause();
        } else if (!producerShouldBePaused && this.producer.paused) {
            await this.producer.resume();
        }
        this.emitter.emit("paused", this.locallyPaused, this.globallyPaused);
    }
}

export type TrackEventMap = {
    paused: (local: boolean, global: boolean) => void,
    closed: () => void
}