import {
    types as MediaSoup
} from "mediasoup";
import {EventEmitter} from "eventemitter3";
import {NewType} from "./newType";
import {Logger} from "../logger";
import { newProducerId, ProducerId } from "./track";
export class Consumer {
    private readonly emitter = new EventEmitter<ConsumerEventMap>();
    public readonly on: ConsumerEventEmitter["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: ConsumerEventEmitter["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: ConsumerEventEmitter["once"] = (event, listener) => this.emitter.once(event, listener);

    private constructor(
        private readonly sender: MediaSoup.Consumer,
        private pausedByUser = false
    ) {
        this.sender.on("transportclose", () => this.onClose());
        this.sender.on("producerclose", () => this.onClose());
        this.sender.on("layerschange", (layers) => Logger.info(`consumerLayerChange(${this.id}): ${JSON.stringify(layers)}`));
    }

    public get id() { return newConsumerId(this.sender.id); }

    public static async create(consumerTransport: MediaSoup.WebRtcTransport, producerId: ProducerId, rtpCapabilities: MediaSoup.RtpCapabilities) {
        const consumer = await consumerTransport.consume({
            rtpCapabilities,
            producerId,
            paused: true,
        });

        return new Consumer(consumer);
    }

    public async setPausedByUser({ pausedUpstream, pausedByUser}: PauseState) {
        this.pausedByUser = pausedByUser;
        await this.updateSenderPauseState(pausedUpstream);
    }

    public async updateSenderPauseState(pausedUpstream: boolean) {
        const shouldPauseSender = pausedUpstream || this.pausedByUser;
        if(this.sender.paused === shouldPauseSender) {
            Logger.info(`setPauseState Consumer(${this.id})  - no change`);
            return;
        }
        if(shouldPauseSender) {
            Logger.info(`setPauseState Consumer(${this.id}) - pause`);
            await this.sender.pause();
        } else {
            Logger.info(`setPauseState Consumer(${this.id}) - resume`);
            await this.sender.resume();
        }
        this.emitter.emit("senderPaused", this.sender.paused);
    }

    public parameters(): ConsumerParameters {
        return {
            id: this.id,
            kind: this.sender.kind,
            paused: this.sender.paused,
            rtpParameters: this.sender.rtpParameters,
            producerId: newProducerId(this.sender.producerId),
        };
    }

    private onClose() {
        console.log(`Consumer(${this.sender.id}) closed`);
        this.emitter.emit("closed");
    }
}

export type PauseState = {
    pausedUpstream: boolean,
    pausedByUser: boolean, 
}

export type ConsumerEventEmitter = Consumer["emitter"]

export type ConsumerEventMap = {
    closed: () => unknown;
    senderPaused: (paused: boolean) => unknown;
}

export type ConsumerParameters = {
    id: ConsumerId;
    producerId: ProducerId;
    kind: MediaSoup.MediaKind;
    rtpParameters: MediaSoup.RtpParameters;
    paused: boolean;
}

export type ConsumerId = NewType<string, "ConsumerId">
export function newConsumerId(id: string) { return id as ConsumerId; }
