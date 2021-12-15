import { nanoid } from "nanoid";
import {
    types as MediaSoup
} from "mediasoup";
import WebSocket from "ws";
import { Logger } from "../logger";
import {Room, RoomId} from "./room";
import { ProducerId } from "./track";
import { NewType } from "./newType";
import { ConsumerId} from "./consumer";
import {Registrar, WebRtcTrack} from "./registrar";
import {SfuId} from "./sfu";

export type RequestID = NewType<string, "requestId">

type RequestMessage = {
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

type Response = {
  id: RequestID;
  error: string,
} | {
  id: RequestID;
  result: Result | void,
}

type ResponseMessage = {
  response?: Response,
  consumerPaused?: PauseMessage,
  producerPaused?: PauseMessage,
  consumerClosed?: ProducerId
  producerClosed?: ProducerId
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
    private _rtpCapabilities?: MediaSoup.RtpCapabilities;
    private _producerTransport?: MediaSoup.WebRtcTransport;
    private _consumerTransport?: MediaSoup.WebRtcTransport;

    constructor(
        private readonly ws: WebSocket,
        private readonly listenIps: MediaSoup.TransportListenIp[],
        public readonly room: Room,
        public readonly isTeacher: boolean,
        private readonly registrar: Registrar,
        private readonly roomId: RoomId,
        private readonly sfuId: SfuId
    ) {
        this.ws.on("message", e => this.onMessage(e));
        this.ws.on("close", () => this.onClose());
    }

    private async onMessage(rawMessage: WebSocket.RawData) {
        if(!rawMessage) {return;}
        const messageString = rawMessage.toString();
        if(messageString.length <= 0) {return;}
        const message = ClientV2.parse(messageString);
        if(!message) { this.ws.close(4400, "Invalid request"); return;}
        const {id, request} = message;
        try {
            const result = await this.handleMessage(request);
            this.send({response: {id, result }});
        } catch (error: unknown) {
            this.send({response: {id, error: `${error}`}});
        }
    }

    private static parse(message: string): RequestMessage | undefined {
        const request = JSON.parse(message) as RequestMessage;
        if(typeof request !== "object") { console.error(`Received request of type '${typeof request}'`); return; }
        if(!request) { console.error("Received null request"); return; }
        if(!request.id) { console.error("Received request without id"); return; }
        return request;
    }

    private send(message: ResponseMessage) {
        this.ws.send(JSON.stringify(message));
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
            return await this.rtpCapabilitiesMessage(rtpCapabilities);
        } else if(routerRtpCapabilities) {
            Logger.info(`routerRtpCapabilities: ${routerRtpCapabilities}`);
            return await this.routerRtpCapabilitiesMessage();
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
            return await this.endMessage();
        }

        return;
    }

    private onClose() {
        this.producerTransport?.close();
        this.consumerTransport?.close();
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
        this.producerTransport = await this.createTransport(this.listenIps);
        this.producerTransport.on("routerclose", () => this.ws.send({producerTransportClosed: {}}));
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

        const id = track.producerId;
        const webRtcTrack: WebRtcTrack = {
            producerId: id,
            sfuId: this.sfuId,
            group: "",
            isPausedForAllConsumers:
            track.globallyPaused
        };
        await this.registrar.registerTrack(this.roomId, webRtcTrack);

        track.on("paused", (localPause, globalPause) => {
            this.send({producerPaused: { id, localPause, globalPause }});
            // Update the track's last updated time
            webRtcTrack.isPausedForAllConsumers = globalPause || localPause;
            this.registrar.updateTrack(this.roomId, webRtcTrack);
        });
        track.on("closed",() => {
            this.send({producerClosed: id});
            this.registrar.unregisterTrack(this.roomId, id);
        });
    }

    private async createConsumerTransportMessage() {
        this.consumerTransport = await this.createTransport(this.listenIps);
        this.consumerTransport.on("routerclose", () => this.ws.send({consumerTransportClosed: {}}));
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

        const id = producerId;
        consumer.on("paused", (localPause, globalPause) => this.send({ consumerPaused: { id, localPause, globalPause } }));
        consumer.on("closed", () => this.send({ consumerClosed: id }));
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

export type ClientId = NewType<string, "ClientId">
export function newClientId(id = nanoid()) { return id as ClientId; }
