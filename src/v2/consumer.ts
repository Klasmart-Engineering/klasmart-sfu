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
        private _sinkIsPaused = sender.paused,
    ) {
        sender.on("transportclose", () => this.close());
        sender.on("producerclose", () => this.close());
        sender.on("producerpause", () => this.updatePauseStatus());
        sender.on("producerresume", () => this.updatePauseStatus());
        sender.on("layerschange", (layers) => this.layersChange(layers));
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

    private layersChange(layers: unknown) {
        Logger.info(`consumerLayerChange(${this.id}): ${JSON.stringify(layers)}`);
        this.emitter.emit("layerschange", layers);
    }

    public close() {
        if (this.sender.closed) { return; }
        this.sender.close();
        this.emitter.emit("closed");
    }

    public get sinkIsPaused() { return this._sinkIsPaused; }
    public async setSinkPaused(paused: boolean) {
        if(this._sinkIsPaused === paused) { return; }
        this._sinkIsPaused = paused;
        await this.updatePauseStatus();
    }

    private async updatePauseStatus() {
        const shouldBePaused = this.sender.producerPaused || this._sinkIsPaused;
        if(shouldBePaused === this.sender.paused) {
            this.emitter.emit("paused", shouldBePaused);
            return;
        }
        if(shouldBePaused) {
            this.emitter.emit("paused", shouldBePaused);
            await this.sender.pause();
        } else {
            this.emitter.emit("paused", shouldBePaused);
            await this.sender.resume();
        }
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
}

export type ConsumerEventEmitter = Consumer["emitter"]

export type ConsumerEventMap = {
    closed: () => unknown;
    paused: (paused: boolean) => unknown;
    layerschange: (layers: unknown) => unknown;
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
