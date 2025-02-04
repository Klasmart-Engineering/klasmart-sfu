import { EventEmitter } from "eventemitter3";
import { nanoid } from "nanoid";
import { types as MediaSoup } from "mediasoup";

import { ClientId, ClientV2 } from "./client";
import { Consumer } from "./consumer";
import { NewType } from "./newType";
import {Logger} from "../logger";

export type ProducerId = NewType<string, "ProducerId">
export function newProducerId(id: string) { return id as ProducerId; }

export class Track {
    public static async create(
        router: MediaSoup.Router,
        owner: ClientId,
        transport: MediaSoup.WebRtcTransport,
        kind: MediaSoup.MediaKind,
        rtpParameters: MediaSoup.RtpParameters,
        name?: string,
        sessionId?: string,
    ): Promise<Track> {
        const id = newProducerId(nanoid());
        const producer = await transport.produce({id, kind, rtpParameters, keyFrameRequestDelay: 1000});
        return new Track(owner, producer, router, name, sessionId);
    }

    private constructor(
        public readonly owner: ClientId,
        private readonly receiver: MediaSoup.Producer,
        private readonly router: MediaSoup.Router,
        public readonly name?: string,
        public readonly sessionId?: string,
        private _pausedByProducingUser = false,
        private _pausedGlobally = false,
    ) {
        this.receiver.on("transportclose", () => {
            Logger.info(`Producer(${this.receiver.id}) owned by Client(${this.owner}) closed`);
            this.onClose();
        });
    }

    private readonly consumers = new Map<ClientId, Consumer>();

    public get producerId() { return this.receiver.id as ProducerId; }
    public get numConsumers() { return Array.from(this.consumers.values()).filter(c => !c.closed).length; }

    private readonly emitter = new EventEmitter<TrackEventMap>();
    public readonly on: Track["emitter"]["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: Track["emitter"]["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: Track["emitter"]["once"] = (event, listener) => this.emitter.once(event, listener);

    public get closed() { return this.receiver.closed; }

    public get pausedByProducingUser() { return this._pausedByProducingUser; }
    public get pausedGlobally() { return this._pausedGlobally; }

    public async consume(clientId: ClientId, transport: MediaSoup.WebRtcTransport, rtpCapabilities: MediaSoup.RtpCapabilities) {
        if(clientId === this.owner) { throw new Error("Owner can not consume a track that it produces"); }
        if (this.consumers.get(clientId)) { throw new Error("Already consuming track"); }
        const producerId = this.producerId;
        if (!this.router.canConsume({rtpCapabilities, producerId})) { throw new Error("Client is not capable of consuming this producer"); }

        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);
        Logger.info(`Consumer created for Track(${this.producerId}).Client(${clientId})`);
        this.consumers.set(clientId, consumer);
        consumer.on("closed", () => this.consumers.delete(clientId));
        return consumer;
    }

    public async setPausedForUser(client: ClientV2, paused: boolean) {
        if (this.owner === client.id) {
            await this.setPausedByProducingUser(paused);
        } else {
            await this.setPausedByConsumingUser(client.id, paused);
        }
    }
    /* A user (teacher) has paused this for everyone */
    public async setPausedGlobally(paused: boolean) {
        if(this._pausedGlobally === paused) { return; }
        this._pausedGlobally = paused;
        paused ? await this.receiver.pause() : await this.receiver.resume();
        this.emitter.emit("pausedGlobally", paused);
    }

    /* The owner of this track has stopped/started sending it */
    private async setPausedByProducingUser(paused: boolean) {
        if(this._pausedByProducingUser === paused) { return; }
        this._pausedByProducingUser = paused;
        paused ? await this.receiver.pause() : await this.receiver.resume();
        this.emitter.emit("pausedByProducingUser", paused);
    }

    /* A user receiving this track has paused it for themselves */
    private async setPausedByConsumingUser(id: ClientId, pausedByUser: boolean) {
        const consumer = this.consumers.get(id);
        if (!consumer) { throw new Error(`Consumer not found in Track(${this.producerId}) for Client(${id})`); }
        await consumer.setPausedByUser({
            pausedUpstream: this._pausedByProducingUser || this._pausedGlobally,
            pausedByUser,
        });
    }

    private onClose() {
        Logger.info(`Track(${this.receiver.id}) owned by Client(${this.owner}) closed`);
        this.emitter.emit("closed");
    }
}

export type TrackEventMap = {
    pausedByProducingUser: (paused: boolean) => void,
    pausedGlobally: (paused: boolean) => void,
    closed: () => void
}
