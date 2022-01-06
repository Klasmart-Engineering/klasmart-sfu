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
    private _broadcastIsPaused = false;
    private _sourceIsPaused = false;

    public get producerId() { return this.broadcast.id as ProducerId; }
    public get numConsumers() { return this.consumers.size; }
    
    private readonly emitter = new EventEmitter<TrackEventMap>();
    public readonly on: TrackEventEmitter["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: TrackEventEmitter["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: TrackEventEmitter["once"] = (event, listener) => this.emitter.once(event, listener);

    private constructor(
        public readonly owner: ClientId,
        private readonly broadcast: MediaSoup.Producer,
        private readonly router: MediaSoup.Router,
    ) {
        this.broadcast.on("close", () => this.emitter.emit("closed"));
    }

    public async consume(clientId: ClientId, transport: MediaSoup.WebRtcTransport, rtpCapabilities: MediaSoup.RtpCapabilities) {
        if(clientId === this.owner) { throw new Error("Owner can not consume a track that it produces"); }
        if (this.consumers.get(clientId)) { throw new Error("Already consuming track"); }
        const producerId = this.producerId;
        if (!this.router.canConsume({rtpCapabilities, producerId})) { throw new Error("Client is not capable of consuming this producer"); }

        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);
        this.consumers.set(clientId, consumer);
        return consumer;
    }

    public end() { return this.broadcast.close(); }

    public async pauseClient(client: ClientV2, paused: boolean) {
        if (this.owner === client.id) {
            await this.setSourcePaused(paused);
        } else {
            const consumer = this.consumers.get(client.id);
            if (!consumer) { throw new Error("Consumer not found"); }
            await consumer.setSinkPaused(paused);
        }
    }

    public get broadcastIsPaused() { return this._broadcastIsPaused; }
    public async setBroadcastPaused(paused: boolean) {
        if(this._broadcastIsPaused !== paused) { return; }
        this._broadcastIsPaused = paused;
        await this.updateBroadcastPauseState();
        this.emitter.emit("broadcastPaused", paused);
    }

    public get sourceIsPaused() { return this._sourceIsPaused; }
    private async setSourcePaused(paused: boolean) {
        if(this._sourceIsPaused !== paused) { return; }
        this._sourceIsPaused = paused;
        await this.updateBroadcastPauseState();
        this.emitter.emit("sourcePaused", paused);
    }

    private async updateBroadcastPauseState() {
        const broadcastShouldBePaused = this._sourceIsPaused || this._broadcastIsPaused;
        if(broadcastShouldBePaused === this.broadcast.paused) { return; }
        if(this.broadcast.paused) {
            await this.broadcast.resume();
        } else {
            await this.broadcast.pause();
        }
    }
}

export type TrackEventEmitter = Track["emitter"];

export type TrackEventMap = {
    sourcePaused: (paused: boolean) => void,
    broadcastPaused: (paused: boolean) => void,
    closed: () => void
}