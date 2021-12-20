import {nanoid} from "nanoid";
import {
    types as MediaSoup
} from "mediasoup";
import {Logger} from "../logger";
import {Room} from "./room";
import {ProducerId} from "./track";
import {NewType} from "./newType";
import {ConsumerId} from "./consumer";
import {TrackRegistrar, WebRtcTrack} from "./registrar";
import {SFU} from "./sfu";
import { EventEmitter } from "eventemitter3";

export type RequestID = NewType<string, "requestId">

export type RequestMessage = {
  id: RequestID,
  request: Request,
}

type Request = {
  routerRtpCapabilities?: unknown;
  producerTransport?: unknown;
  producerTransportConnect?: { dtlsParameters: MediaSoup.DtlsParameters };
  createTrack?: { kind: MediaSoup.MediaKind, rtpParameters: MediaSoup.RtpParameters };

  rtpCapabilities?: MediaSoup.RtpCapabilities;
  consumerTransport?: unknown;
  consumerTransportConnect?: { dtlsParameters: MediaSoup.DtlsParameters };
  createConsumer?: { producerId: ProducerId };

  locallyPause?: { paused: boolean, id: ProducerId };
  globallyPause?: { paused: boolean, id: ProducerId };
  end?: unknown;
}

export type ResponseMessage = {
  response?: Response,
  consumerPaused?: PauseMessage,
  producerPaused?: PauseMessage,
  consumerClosed?: ProducerId,
  producerClosed?: ProducerId,
  consumerTransportClosed?: unknown,
  producerTransportClosed?: unknown,
}

type Response = {
    id: RequestID;
    error: string,
  } | {
    id: RequestID;
    result: Result | void,
  }

export type PauseMessage = {
  id: ProducerId,
  localPause: boolean,
  globalPause: boolean,
}

export type WebRtcTransportResult = {
  id: string,
  iceCandidates: MediaSoup.IceCandidate[],
  iceParameters: MediaSoup.IceParameters,
  dtlsParameters: MediaSoup.DtlsParameters,
  sctpParameters?: MediaSoup.SctpParameters,
}

type Result = {
  routerRtpCapabilities?: MediaSoup.RtpCapabilities;
  producerTransport?: WebRtcTransportResult;
  createTrack?: ProducerId;
  locallyPauseTrack?: boolean;

  consumerTransport?: WebRtcTransportResult;
  consumerCreated?: {
    id: ConsumerId,
    producerId: ProducerId,
    kind: MediaSoup.MediaKind,
    rtpParameters: MediaSoup.RtpParameters,
    paused: boolean,
  },
}

export class ClientV2 {
    public readonly id = newClientId();

    private readonly emitter = new EventEmitter<ClientEventMap>();
    public readonly on: ClientEventEmitter["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: ClientEventEmitter["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: ClientEventEmitter["once"] = (event, listener) => this.emitter.once(event, listener);

    private _rtpCapabilities?: MediaSoup.RtpCapabilities;
    private _producerTransport?: MediaSoup.WebRtcTransport;
    private _consumerTransport?: MediaSoup.WebRtcTransport;

    constructor(
        private readonly sfu: SFU,
        private readonly registrar: TrackRegistrar,
        public readonly room: Room,
        public readonly isTeacher: boolean,
    ) {
    }

    public async onMessage({id, request}: RequestMessage) {
        try {
            const result = await this.handleMessage(request);
            this.emitter.emit("response", {id, result});
        } catch (error: unknown) {
            this.emitter.emit("response", {id, error: `${error}`});
        }
    }

    private async handleMessage(message: Request) {
        const {
            rtpCapabilities,
            routerRtpCapabilities,
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
            return this.rtpCapabilitiesMessage(rtpCapabilities);
        } else if(routerRtpCapabilities) {
            Logger.info(`routerRtpCapabilities: ${JSON.stringify(routerRtpCapabilities)}`);
            return await this.routerRtpCapabilitiesMessage();
        } else if (producerTransport) {
            Logger.info(`producerTransport: ${JSON.stringify(producerTransport)}`);
            return await this.createProducerTransportMessage();
        } else if (producerTransportConnect) {
            Logger.info(`producerTransportConnect: ${JSON.stringify(producerTransportConnect)}`);
            const {dtlsParameters} = producerTransportConnect;
            return await this.connectProducerTransportMessage(dtlsParameters);
        } else if (consumerTransport) {
            Logger.info(`consumerTransport: ${JSON.stringify(consumerTransport)}`);
            return await this.createConsumerTransportMessage();
        } else if (consumerTransportConnect) {
            Logger.info(`consumerTransportConnect: ${JSON.stringify(consumerTransportConnect)}`);
            const {dtlsParameters} = consumerTransportConnect;
            return await this.connectConsumerTransportMessage(dtlsParameters);
        } else if (createTrack) {
            Logger.info(`createTrack: ${JSON.stringify(createTrack)}`);
            const {kind, rtpParameters} = createTrack;
            return await this.createTrackMessage(kind, rtpParameters);
        } else if (createConsumer) {
            Logger.info(`createConsumer: ${JSON.stringify(createConsumer)}`);
            const {producerId} = createConsumer;
            return await this.createConsumerMessage(producerId);
        } else if (locallyPause) {
            Logger.info(`locallyPause: ${JSON.stringify(locallyPause)}`);
            return await this.locallyPauseMessage(locallyPause);
        } else if (globallyPause) {
            Logger.info(`globallyPause: ${JSON.stringify(globallyPause)}`);
            return await this.globallyPauseMessage(globallyPause);
        } else if (end) {
            Logger.info(`end: ${JSON.stringify(end)}`);
            return await this.endMessage();
        }

        return;
    }

    public onClose() {
        this._producerTransport?.close();
        this._consumerTransport?.close();
        this.emitter.emit("close");
    }

    // Network messages
    private rtpCapabilitiesMessage(rtpCapabilities: MediaSoup.RtpCapabilities) {
        this.rtpCapabilities = rtpCapabilities;
    }

    private async routerRtpCapabilitiesMessage(): Promise<Result> {
        return {
            routerRtpCapabilities: this.room.router.rtpCapabilities
        };
    }

    private async createProducerTransportMessage(): Promise<Result> {
        this.producerTransport = await this.createTransport(this.sfu.listenIps);
        this.producerTransport.on("routerclose", () => this.emitter.emit("producerTransportClosed"));
        return {
            producerTransport: {
                id: this.producerTransport.id,
                iceCandidates: this.producerTransport.iceCandidates,
                iceParameters: this.producerTransport.iceParameters,
                dtlsParameters: this.producerTransport.dtlsParameters,
                sctpParameters: this.producerTransport.sctpParameters,
            }
        };
    }

    private async connectProducerTransportMessage(dtlsParameters: MediaSoup.DtlsParameters) {
        await this.producerTransport.connect({ dtlsParameters });
    }

    private async createTrackMessage(kind: MediaSoup.MediaKind, rtpParameters: MediaSoup.RtpParameters) {
        const track = await this.room.createTrack(
            this.id,
            this.producerTransport,
            kind,
            rtpParameters,
        );

        const webRtcTrack: WebRtcTrack = {
            producerId: track.producerId,
            sfuId: this.sfu.id,
            group: "",
            isPausedForAllConsumers:
            track.globallyPaused
        };
        await this.registrar.registerTrack(this.room.id, webRtcTrack);

        track.on("paused", (localPause, globalPause) => {
            this.emitter.emit("producerPaused", {id: track.producerId, localPause, globalPause});
            // Update the track's last updated time
            webRtcTrack.isPausedForAllConsumers = globalPause || localPause;
            this.registrar.updateTrack(this.room.id, webRtcTrack);
        });
        track.on("closed",() => {
            this.emitter.emit("producerClosed", track.producerId);
            this.registrar.unregisterTrack(this.room.id, track.producerId);
        });

        return { createTrack: track.producerId };
    }

    private async createConsumerTransportMessage() {
        this.consumerTransport = await this.createTransport(this.sfu.listenIps);
        this.consumerTransport.on("routerclose", () => this.emitter.emit("consumerTransportClosed"));
        return {
            consumerTransport: {
                id: this.consumerTransport.id,
                iceCandidates: this.consumerTransport.iceCandidates,
                iceParameters: this.consumerTransport.iceParameters,
                dtlsParameters: this.consumerTransport.dtlsParameters,
                sctpParameters: this.consumerTransport.sctpParameters,
            }
        };
    }

    private async connectConsumerTransportMessage(dtlsParameters: MediaSoup.DtlsParameters) {
        await this.consumerTransport.connect({ dtlsParameters });
    }

    private async createConsumerMessage(producerId: ProducerId) {
        const consumer = await this.room.track(producerId).consume(
            this.id,
            this.consumerTransport,
            this.rtpCapabilities
        );

        consumer.on("paused", (localPause, globalPause) => this.emitter.emit("consumerPaused", {id: producerId, localPause, globalPause}));
        consumer.on("closed", () => this.emitter.emit("consumerClosed", producerId));
        return { consumerCreated: consumer.parameters() };
    }

    private async createTransport(listenIps: MediaSoup.TransportListenIp[]) {
        const transport = await this.room.router.createWebRtcTransport({
            listenIps,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });

        transport.on("routerclose", () => transport.close());

        return transport;
    }

    @ClientV2.onlyTeacher("Only teachers can end the room")
    private async endMessage() {
        this.room.end();
    }

    @ClientV2.onlyTeacher("Only teachers can globally pause a track")
    private async globallyPauseMessage(globallyPause: { paused: boolean; id: ProducerId }) {
        const { paused, id } = globallyPause;
        const track = this.room.track(id);
        await track.globalPause(paused);
    }

    private async locallyPauseMessage(locallyPause: { paused: boolean; id: ProducerId }) {
        const { paused, id } = locallyPause;
        const track = this.room.track(id);
        console.log(`locallyPauseMessage Track(${id}) paused(${paused})`);
        await track.localPause(this.id, paused);
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
        if (this._consumerTransport) {
            throw new Error("Consumer Transport has already been created");
        }
        this._consumerTransport = transport;
    }

    private get producerTransport() {
        if (!this._producerTransport) {
            throw new Error("Producer Transport has not yet been created");
        }
        return this._producerTransport;
    }

    private set producerTransport(transport: MediaSoup.WebRtcTransport) {
        if (this._producerTransport) {
            throw new Error("Producer Transport has already created");
        }
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

export type ClientEventEmitter = ClientV2["emitter"];

export type ClientEventMap = {
    close: () => void,
    response: (response: Response) => void,
    consumerPaused: (consumerPaused: PauseMessage) => void,
    producerPaused: (producerPaused: PauseMessage) => void,
    consumerClosed: (producerId: ProducerId) => void,
    producerClosed: (producerId: ProducerId) => void,
    consumerTransportClosed: () => void,
    producerTransportClosed: () => void,
}

export type ClientId = NewType<string, "ClientId">
export function newClientId(id = nanoid()) { return id as ClientId; }
