import {
    types as MediaSoup
} from "mediasoup";
import {EventEmitter} from "eventemitter3";
import {NewType} from "./newType";
import {Logger} from "../logger";
import { ProducerId } from "./track";
export class Consumer {
    public _locallyPaused: boolean;
    private readonly emitter = new EventEmitter<ConsumerEventMap>();
    public readonly on = this.emitter.on.bind(this);
    public readonly once = this.emitter.once.bind(this);

    private constructor(
        private readonly consumer: MediaSoup.Consumer
    ) {
        this._locallyPaused = consumer.paused;

        consumer.on("transportclose", () => this.close());
        consumer.on("producerclose", () => this.close());
        consumer.on("producerpause", () => this.updatePauseStatus());
        consumer.on("producerresume", async () => this.updatePauseStatus());
        consumer.on("layerschange", (layers) => Logger.info(`consumerLayerChange(${this.id}): ${JSON.stringify(layers)}`));
    }

    public get id() {
        return newConsumerId(this.consumer.id);
    }

    public static async create(consumerTransport: MediaSoup.WebRtcTransport, producerId: ProducerId, rtpCapabilities: MediaSoup.RtpCapabilities) {
        const consumer = await consumerTransport.consume({
            rtpCapabilities,
            producerId,
            paused: true,
        });

        return new Consumer(consumer);
    }

    public close() {
        if (!this.consumer.closed) {
            this.consumer.close();
            this.emitter.emit("closed");
        }
    }

    public get locallyPaused() { return this._locallyPaused; }

    public async setLocallyPaused(paused: boolean) {
        this._locallyPaused = paused;
        await this.updatePauseStatus();
    }

    private async updatePauseStatus() {
        const consumerShouldBePaused = this.consumer.producerPaused || this.locallyPaused;
        if (consumerShouldBePaused && !this.consumer.paused) {
            await this.consumer.pause();
        } else if (!consumerShouldBePaused && this.consumer.paused) {
            await this.consumer.resume();
        }
        this.emitter.emit("paused", this.locallyPaused, this.consumer.producerPaused);
    }

    public parameters(): ConsumerParameters {
        return {
            id: this.id,
            producerId: this.consumer.producerId as ProducerId,
            kind: this.consumer.kind,
            rtpParameters: this.consumer.rtpParameters,
            paused: this.consumer.paused,
        };
    }
}

export type ConsumerEventMap = {
    paused: (local: boolean, global: boolean) => unknown;
    closed: () => unknown;
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
