import {
    types as MediaSoup
} from "mediasoup";
import {EventEmitter} from "eventemitter3";
import {NewType} from "./newType";
import {Logger} from "../logger";
import {ProducerId} from "./producer";

export type ConsumerParams = {
    producerId: ProducerId;
    rtpCapabilities: MediaSoup.RtpCapabilities;
}

export type ConsumerEvents = {
    "paused": (paused: boolean) => unknown;
    "closed": () => unknown;
    "layerschange": (layers?: MediaSoup.ConsumerLayers) => unknown;
}

export class Consumer {
    public _locallyPaused: boolean;
    public readonly emitter = new EventEmitter<ConsumerEvents>();
    private constructor(
        private readonly consumer: MediaSoup.Consumer
    ) {
        this._locallyPaused = consumer.paused;

        consumer.on("transportclose", () => {
            this.close();
        });

        consumer.on("producerclose", () => {
            this.close();
        });

        consumer.on("producerpause", async () => {
            await this.pause();
        });

        consumer.on("producerresume", async () => {
            await this.resume();
        });

        consumer.on("layerschange", (layers?: MediaSoup.ConsumerLayers) => {
            Logger.info(`consumerLayerChange(${this.id}): ${JSON.stringify(layers)}`);
            this.emitter.emit("layerschange", layers);
        });
    }

    public get id() {
        return newConsumerId(this.consumer.id);
    }

    public static async create(consumerTransport: MediaSoup.WebRtcTransport, {rtpCapabilities, producerId}: ConsumerParams) {
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
    private set locallyPaused(paused: boolean) { this._locallyPaused = paused; }

    public async setLocallyPaused(paused: boolean) {
        this.locallyPaused = paused;
        if (this.locallyPaused) {
            await this.pause();
        } else {
            await this.resume();
        }
    }

    private async pause() {
        if (!this.consumer.paused) {
            await this.consumer.pause();
            this.emitter.emit("paused", true);
        }
    }

    private async resume() {
        const shouldBePaused = this.consumer.producerPaused || this.locallyPaused;
        if (this.consumer.paused && !shouldBePaused) {
            await this.consumer.resume();
            this.emitter.emit("paused", false);
        }
    }

    public parameters() {
        return {
            id: this.id,
            producerId: this.consumer.producerId,
            kind: this.consumer.kind,
            rtpParameters: this.consumer.rtpParameters,
        };
    }
}

export type ConsumerId = NewType<string, "ConsumerId">
export function newConsumerId(id: string) { return id as ConsumerId; }
