import { nanoid } from "nanoid";
import {
    types as MediaSoup
} from "mediasoup";
import WebSocket from "ws";
import { Logger } from "../logger";
import { Room } from "./room";
import { newTrackId, Track, TrackId } from "./track";
import { NewType } from "./newType";
import { Producer } from "./producer";
import { Consumer } from "./consumer";

type WsMessage = {
    rtpCapabilities?: MediaSoup.RtpCapabilities;
    producerTransport?: string;
    producerTransportConnect?: { dtlsParameters: MediaSoup.DtlsParameters };
    createTrack?: { kind: MediaSoup.MediaKind, rtpParameters: MediaSoup.RtpParameters };
    consumerTransport?: string;
    consumerTransportConnect?: { dtlsParameters: MediaSoup.DtlsParameters };
    createConsumer?: { producerId: TrackId };
    locallyPause?: { paused: boolean, trackId: TrackId };
    globallyPause?: { paused: boolean, trackId: TrackId };
    end?: { end: boolean };
}

export class ClientV2 {
    public readonly id = newClientId();
    private _rtpCapabilities?: MediaSoup.RtpCapabilities;
    private _producerTransport?: MediaSoup.WebRtcTransport;
    private _consumerTransport?: MediaSoup.WebRtcTransport;

    constructor(
        private readonly ws: WebSocket,
        private readonly listenIps: MediaSoup.TransportListenIp[],
        public readonly room: Room,
        public readonly isTeacher: boolean
    ) {
        this.ws.on("message", e => this.onMessage(e));
        this.ws.on("close", () => this.onClose());
    }

    private async onMessage(data: WebSocket.RawData) {
        try {
            const message: WsMessage = JSON.parse(data.toString());
            const response = await this.handleMessage(message);

            if (!response) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Unknown message");
            }

            this.ws.send(JSON.stringify(response));

        } catch (error: unknown) {
            Logger.warn(`Error handling message from client(${this.id}): ${error}`);
            this.ws.send(JSON.stringify({
                type: "error",
                message: `Error handling message: ${data.toString()}`,
            }));
        }
    }

    private async handleMessage(message: WsMessage) {
        const {
            rtpCapabilities,
            producerTransport,
            producerTransportConnect,
            createTrack,
            consumerTransport,
            consumerTransportConnect,
            createConsumer,
            locallyPause,
            globallyPause,
            end
        } = message;

        if (rtpCapabilities) {
            Logger.info(`rtpCapabilities: ${rtpCapabilities}`);
            return await this.rtpCapabilitiesMessage(rtpCapabilities);
        } else if (producerTransport) {
            Logger.info(`producerTransport: ${producerTransport}`);
            return await this.createProducerTransportMessage();
        } else if (producerTransportConnect) {
            Logger.info(`producerTransportConnect: ${producerTransportConnect}`);
            const {dtlsParameters} = producerTransportConnect;
            return await this.connectProducerTransportMessage(dtlsParameters);
        } else if (consumerTransport) {
            Logger.info(`consumerTransport: ${consumerTransport}`);
            return await this.createConsumerTransportMessage();
        } else if (consumerTransportConnect) {
            Logger.info(`consumerTransportConnect: ${consumerTransportConnect}`);
            const {dtlsParameters} = consumerTransportConnect;
            return await this.connectConsumerTransportMessage(dtlsParameters);
        } else if (createTrack) {
            Logger.info(`createTrack: ${createTrack}`);
            const {kind, rtpParameters} = createTrack;
            return await this.createTrackMessage(kind, rtpParameters);
        } else if (createConsumer) {
            Logger.info(`createConsumer: ${createConsumer}`);
            const {producerId} = createConsumer;
            return await this.createConsumerMessage(producerId);
        } else if (locallyPause) {
            Logger.info(`locallyPause: ${locallyPause}`);
            return await this.locallyPauseMessage(locallyPause);
        } else if (globallyPause) {
            Logger.info(`globallyPause: ${globallyPause}`);
            return await this.globallyPauseMessage(globallyPause);
        } else if (end) {
            Logger.info(`end: ${end}`);
            return await this.endMessage(end);
        }

        return;
    }

    private onClose() {
        this._producerTransport?.close();
        this._consumerTransport?.close();
    }

    // Network messages
    private async rtpCapabilitiesMessage(rtpCapabilities: MediaSoup.RtpCapabilities) {
        this.rtpCapabilities = rtpCapabilities;
        return true;
    }

    private async createProducerTransportMessage() {
        this.producerTransport = await this.createTransport(this.listenIps);
        this.producerTransport.on("routerclose", () => this.ws.send({producerTransportClosed: {}}));
        return serializeTransport("producerTransport", this.producerTransport);
    }

    private async connectProducerTransportMessage(dtlsParameters: MediaSoup.DtlsParameters) {
        await this.producerTransport.connect({ dtlsParameters });
        return true;
    }

    private async createTrackMessage(kind: MediaSoup.MediaKind, rtpParameters: MediaSoup.RtpParameters) {
        const id = newTrackId();
        const producer = await Producer.create(this.producerTransport, { id, kind, rtpParameters });
        const track = new Track(this.id, producer);
        this.room.addTrack(id, track);

        producer.emitter.on("paused", (paused) => {
            this.ws.send(JSON.stringify({producerPaused: { id, paused }}));
        });
        producer.emitter.on("closed", () => {
            this.ws.send(JSON.stringify({producerClosed: { id }}));
            this.room.removeTrack(id);
        });

        return true;
    }

    private async createConsumerTransportMessage() {
        this.consumerTransport = await this.createTransport(this.listenIps);
        this.consumerTransport.on("routerclose", () => this.ws.send({consumerTransportClosed: {}}));
        return serializeTransport("consumerTransport", this.consumerTransport);
    }

    private async connectConsumerTransportMessage(dtlsParameters: MediaSoup.DtlsParameters) {
        await this.consumerTransport.connect({ dtlsParameters });
        return true;
    }

    private async createConsumerMessage(trackId: TrackId) {
        const rtpCapabilities = this.rtpCapabilities;
        const track = this.room.track(trackId);

        if (track.consumer(this.id)) { throw new Error("Already consuming track"); }

        const producerId = track.producerId;

        if (!this.room.router.canConsume({rtpCapabilities, producerId})) {
            throw new Error("Client is not capable of consuming this producer");
        }

        const consumer = await Consumer.create(this.consumerTransport, {producerId, rtpCapabilities});
        track.addConsumer(this.id, consumer);
        this.ws.send(JSON.stringify({ consumerCreated: consumer.parameters() }));

        consumer.emitter.on("paused", (paused) => {
            this.ws.send(JSON.stringify({ consumerPaused: { trackId, paused } }));
        });
        consumer.emitter.on("closed", () => {
            this.ws.send(JSON.stringify({ consumerClosed: { trackId } }));
        });

        return true;
    }

    private async createTransport(listenIps: MediaSoup.TransportListenIp[]) {
        const transport = await this.room.router.createWebRtcTransport({
            listenIps,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });

        transport.on("routerclose", () => {
            transport.close();
        });

        return transport;
    }

    @ClientV2.onlyTeacher("Only teachers can end the room")
    private async endMessage(end: { end: boolean }) {
        if (end.end) {
            this.room.end();
            return true;
        }

        return false;
    }

    @ClientV2.onlyTeacher("Only teachers can globally pause a track")
    private async globallyPauseMessage(globallyPause: { paused: boolean; trackId: TrackId }) {
        const { paused, trackId } = globallyPause;
        const track = this.room.track(trackId);
        await track.globalPause(paused);
        return true;
    }

    private async locallyPauseMessage(locallyPause: { paused: boolean; trackId: TrackId }) {
        const { paused, trackId } = locallyPause;
        const track = this.room.track(trackId);
        await track.localPause(this.id, paused);
        return true;
    }

    // Getters & Setters
    private get rtpCapabilities() {
        if (!this._rtpCapabilities) {
            throw new Error("RtpCapabilities have not been exchanged");
        }
        return this._rtpCapabilities;
    }

    private set rtpCapabilities(rtpCapabilities: MediaSoup.RtpCapabilities) {
        this._rtpCapabilities = rtpCapabilities;
    }

    private get consumerTransport() {
        if (!this._consumerTransport) {
            throw new Error("Consumer Transport has not yet been created");
        }
        return this._consumerTransport;
    }

    private set consumerTransport(transport: MediaSoup.WebRtcTransport) {
        this._consumerTransport = transport;
    }

    private get producerTransport() {
        if (!this._producerTransport) {
            throw new Error("Producer Transport has not yet been created");
        }
        return this._producerTransport;
    }

    private set producerTransport(transport: MediaSoup.WebRtcTransport) {
        this._producerTransport = transport;
    }

    // Decorators
    /// Decorator for only allowing a teacher to do the action.  Use via @onlyTeacher("errorText").
    private static onlyTeacher(errorText: string) {
        return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
            const childFunction = descriptor.value;
            descriptor.value = function (this: ClientV2, ...args: never[]) {
                if (!this.isTeacher) {
                    throw new Error(errorText);
                }
                return childFunction.apply(this, args);
            };
            return descriptor;
        };
    }
}

function serializeTransport(key: string, { id, iceCandidates, iceParameters, dtlsParameters }: MediaSoup.WebRtcTransport) {
    return JSON.stringify({
        [key]: {
            id,
            iceCandidates,
            iceParameters,
            dtlsParameters,
        }
    });
}

export type ClientId = NewType<string, "ClientId">
export function newClientId(id = nanoid()) { return id as ClientId; }
