import { NewType } from "./newType";
import { nanoid } from "nanoid";
import {
    types as MediaSoup
} from "mediasoup";
import { EventEmitter } from "eventemitter3";
import { TrackId } from "./track";

export type ProducerParams = {
    id: TrackId;
    kind: MediaSoup.MediaKind;
    rtpParameters: MediaSoup.RtpParameters;
}

export type ProducerEvents = {
    "paused": (paused: boolean) => void;
    "closed": () => void;
}

export class Producer {
    private _locallyPaused: boolean;
    private _globallyPaused = false;
    private readonly emitter = new EventEmitter<ProducerEvents>();
    private constructor(
        private readonly producer: MediaSoup.Producer
    ) {
        this._locallyPaused = producer.paused;

        this.producer.on("transportclose", () => {
            this.close();
        });
    }

    public static async create(transport: MediaSoup.WebRtcTransport, { id, kind, rtpParameters }: ProducerParams) {
        const producer = await transport.produce({
            id,
            kind,
            rtpParameters,
            paused: true
        });

        return new Producer(producer);
    }

    public close() {
        if (!this.producer.closed) {
            this.producer.close();
            this.emitter.emit("closed");
        }
    }

    public get id() { return newProducerId(this.producer.id); }

    public get locallyPaused() { return this._locallyPaused; }
    private set locallyPaused(paused: boolean) { this._locallyPaused = paused;}

    public async setLocallyPaused(paused: boolean) {
        this.locallyPaused = paused;
        await this.updatePauseState();
    }

    public get globallyPaused() { return this._globallyPaused; }
    private set globallyPaused(paused: boolean) { this._globallyPaused = paused; }

    public async setGloballyPaused(paused: boolean) {
        this.globallyPaused = paused;
        await this.updatePauseState();
    }

    private async pause() {
        if (!this.producer.paused) {
            await this.producer.pause();
            this.emitter.emit("paused", true);
        }
    }

    private async resume() {
        if (this.producer.paused) {
            await this.producer.resume();
            this.emitter.emit("paused", false);
        }
    }

    private async updatePauseState() {
        const producerShouldBePaused = this.locallyPaused || this.globallyPaused;
        if (producerShouldBePaused) {
            await this.pause();
        } else {
            await this.resume();
        }
    }

    public on(event: keyof ProducerEvents, listener: (...args: any[]) => void) {
        return this.emitter.on(event, listener);
    }

    public once(event: keyof ProducerEvents, listener: (...args: any[]) => void) {
        return this.emitter.once(event, listener);
    }
}

export type ProducerId = NewType<string, "ProducerId">
export function newProducerId(id = nanoid()) { return id as ProducerId; }
