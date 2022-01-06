import { nanoid } from "nanoid";
import {
    types as MediaSoup
} from "mediasoup";
import { Logger } from "../logger";
import { Room } from "./room";
import { ProducerId } from "./track";
import { NewType } from "./newType";
import { ConsumerId } from "./consumer";
import { TrackRegistrar, WebRtcTrack } from "./registrar";
import { SFU } from "./sfu";
import { EventEmitter } from "eventemitter3";

export type RequestId = NewType<string, "requestId">
export const newRequestID = (id: string) => id as RequestId;

export type RequestMessage = {
    id: RequestId,
    request: Request,
}

type Request = {
    getRouterRtpCapabilities?: unknown;
    createProducerTransport?: unknown;
    connectProducerTransport?: TransportConnectRequest;
    produceTrack?: ProduceTrackRequest;

    setRtpCapabilities?: MediaSoup.RtpCapabilities;
    createConsumerTransport?: unknown;
    connectConsumerTransport?: TransportConnectRequest;
    consumeTrack?: ConsumeTrackRequest;

    pause?: PauseRequest;
    pauseForEveryone?: PauseRequest;
    endRoom?: unknown;
}

type TransportConnectRequest = { dtlsParameters: MediaSoup.DtlsParameters };
type ProduceTrackRequest = { kind: MediaSoup.MediaKind, rtpParameters: MediaSoup.RtpParameters, name: string };
type ConsumeTrackRequest = { producerId: ProducerId };
type PauseRequest = { paused: boolean, id: ProducerId };

export type ResponseMessage = {
    response?: Response,

    sourcePauseEvent?: PauseEvent,
    broadcastPauseEvent?: PauseEvent,
    sinkPauseEvent?: PauseEvent,

    consumerClosed?: ProducerId,
    producerClosed?: ProducerId,

    consumerTransportClosed?: unknown,
    producerTransportClosed?: unknown,
}

type Response = {
    id: RequestId;
    error: string,
} | {
    id: RequestId;
    result: Result | void,
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

    producerTransportCreated?: WebRtcTransportResult;
    producerCreated?: ProducerId;

    consumerTransportCreated?: WebRtcTransportResult;
    consumerCreated?: {
        id: ConsumerId,
        producerId: ProducerId,
        kind: MediaSoup.MediaKind,
        rtpParameters: MediaSoup.RtpParameters,
    },
}

export type PauseEvent = {
    producerId: ProducerId,
    paused: boolean
}

export class ClientV2 {
    public readonly id = newClientId();

    private readonly emitter = new EventEmitter<ClientEventMap>();
    public readonly on: ClientEventEmitter["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: ClientEventEmitter["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: ClientEventEmitter["once"] = (event, listener) => this.emitter.once(event, listener);

    private rtpCapabilities?: MediaSoup.RtpCapabilities;
    private producerTransport?: MediaSoup.WebRtcTransport;
    private consumerTransport?: MediaSoup.WebRtcTransport;

    constructor(
        private readonly sfu: SFU,
        private readonly registrar: TrackRegistrar,
        public readonly room: Room,
        public readonly isTeacher: boolean,
    ) {
    }

    public async onMessage({ id, request }: RequestMessage) {
        try {
            const result = await this.handleMessage(request);
            this.emitter.emit("response", { id, result });
        } catch (error: unknown) {
            this.emitter.emit("response", { id, error: `${error}` });
        }
    }

    private async handleMessage(message: Request): Promise<Result | void> {
        const {
            setRtpCapabilities,
            getRouterRtpCapabilities,

            createProducerTransport,
            connectProducerTransport,
            produceTrack,

            createConsumerTransport,
            connectConsumerTransport,
            consumeTrack,

            pause,
            pauseForEveryone,
            endRoom,
        } = message;

        if (setRtpCapabilities) {
            Logger.info(`setRtpCapabilities: ${setRtpCapabilities}`);
            this.rtpCapabilities = setRtpCapabilities;
            return;
        } else if (getRouterRtpCapabilities) {
            Logger.info(`getRouterRtpCapabilities: ${JSON.stringify(getRouterRtpCapabilities)}`);
            return { routerRtpCapabilities: this.room.router.rtpCapabilities };
        } else if (createProducerTransport) {
            Logger.info(`producerTransport: ${JSON.stringify(createProducerTransport)}`);
            const producerTransportCreated = await this.createProducerTransport();
            return { producerTransportCreated };
        } else if (connectProducerTransport) {
            Logger.info(`producerTransportConnect: ${JSON.stringify(connectProducerTransport)}`);
            await this.connectProducerTransport(connectProducerTransport);
            return;
        } else if (produceTrack) {
            Logger.info(`produceTrack: ${JSON.stringify(produceTrack)}`);
            const producerCreated = await this.produceTrack(produceTrack);
            return { producerCreated };
        } else if (createConsumerTransport) {
            Logger.info(`consumerTransport: ${JSON.stringify(createConsumerTransport)}`);
            const consumerTransportCreated = await this.createConsumerTransport();
            return { consumerTransportCreated };
        } else if (connectConsumerTransport) {
            Logger.info(`connectConsumerTransport: ${JSON.stringify(connectConsumerTransport)}`);
            await this.connectConsumerTransport(connectConsumerTransport);
            return;
        } else if (consumeTrack) {
            Logger.info(`consumeTrack: ${JSON.stringify(consumeTrack)}`);
            const consumerCreated = await this.consumeTrack(consumeTrack);
            return { consumerCreated };
        } else if (pause) {
            Logger.info(`pause: ${JSON.stringify(pause)}`);
            await this.pause(pause);
            return;
        } else if (pauseForEveryone) {
            Logger.info(`pauseForEveryone: ${JSON.stringify(pauseForEveryone)}`);
            await this.pauseForEveryone(pauseForEveryone);
            return;
        } else if (endRoom) {
            Logger.info(`endRoom: ${JSON.stringify(endRoom)}`);
            await this.endRoom();
            return;
        }

        return;
    }

    public onClose() {
        this.producerTransport?.close();
        this.consumerTransport?.close();
        this.emitter.emit("close");
    }

    // Network messages
    private async createProducerTransport(): Promise<WebRtcTransportResult> {
        this.producerTransport = await this.createTransport(this.sfu.listenIps);
        this.producerTransport.on("routerclose", () => this.emitter.emit("producerTransportClosed"));
        return {
            id: this.producerTransport.id,
            iceCandidates: this.producerTransport.iceCandidates,
            iceParameters: this.producerTransport.iceParameters,
            dtlsParameters: this.producerTransport.dtlsParameters,
            // Disable data channels
            // sctpParameters: this.producerTransport.sctpParameters,
        };
    }

    private async connectProducerTransport({ dtlsParameters }: TransportConnectRequest) {
        if (!this.producerTransport) { throw new Error("Producer transport has not been initialized"); }
        await this.producerTransport.connect({ dtlsParameters });
    }

    private async produceTrack({ kind, name, rtpParameters }: ProduceTrackRequest) {
        if (!this.producerTransport) { throw new Error("Producer transport has not been initialized"); }
        const track = await this.room.createTrack(
            this.id,
            this.producerTransport,
            kind,
            rtpParameters,
        );

        const producerId = track.producerId;
        const webRtcTrack: WebRtcTrack = {
            producerId,
            sfuId: this.sfu.id,
            name,
        };
        
        track.on("broadcastPaused", paused => this.emitter.emit("broadcastPaused", {producerId, paused}));
        track.on("closed", () => {
            this.emitter.emit("producerClosed", producerId);
            this.registrar.unregisterTrack(this.room.id, producerId);
        });
        this.emitter.emit("broadcastPaused", {producerId, paused: track.broadcastIsPaused});
        await this.registrar.registerTrack(this.room.id, webRtcTrack);
        return track.producerId;
    }

    private async createConsumerTransport(): Promise<WebRtcTransportResult> {
        this.consumerTransport = await this.createTransport(this.sfu.listenIps);
        this.consumerTransport.on("routerclose", () => this.emitter.emit("consumerTransportClosed"));
        return {
            id: this.consumerTransport.id,
            iceCandidates: this.consumerTransport.iceCandidates,
            iceParameters: this.consumerTransport.iceParameters,
            dtlsParameters: this.consumerTransport.dtlsParameters,
            // Disable data channels
            // sctpParameters: this.consumerTransport.sctpParameters,
        };
    }

    private async connectConsumerTransport({ dtlsParameters }: TransportConnectRequest) {
        if (!this.consumerTransport) { throw new Error("Consumer transport has not been initialized"); }
        await this.consumerTransport.connect({ dtlsParameters });
    }

    private async consumeTrack({ producerId }: ConsumeTrackRequest) {
        if (!this.rtpCapabilities) { throw new Error("RTP Capabilities has not been initialized"); }
        if (!this.consumerTransport) { throw new Error("Consumer transport has not been initialized"); }
        const track = this.room.track(producerId);
        
        const consumer = await track.consume(
            this.id,
            this.consumerTransport,
            this.rtpCapabilities,
        );
                
        consumer.on("closed", () => this.emitter.emit("consumerClosed", producerId));
        
        consumer.on("paused", paused => this.emitter.emit("sinkPauseEvent", {producerId, paused}));
        this.emitter.emit("sinkPauseEvent", {producerId, paused: consumer.sinkIsPaused});
        
        track.on("broadcastPaused", paused => this.emitter.emit("broadcastPaused", {producerId, paused}));
        this.emitter.emit("broadcastPaused", {producerId, paused: track.broadcastIsPaused});
        
        track.on("sourcePaused", paused => this.emitter.emit("sourcePaused", {producerId, paused}));
        this.emitter.emit("sourcePaused", {producerId, paused: track.sourceIsPaused});
        
        return consumer.parameters();
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
    private async endRoom() {
        this.room.end();
    }

    @ClientV2.onlyTeacher("Only teachers can pause for everyone")
    private async pauseForEveryone({ paused, id }: PauseRequest) {
        const track = this.room.track(id);
        await track.setBroadcastPaused(paused);
    }

    private async pause({ paused, id }: PauseRequest) {
        const track = this.room.track(id);
        await track.pauseClient(this, paused);
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

    sourcePaused: (pauseEvent: PauseEvent) => void,
    broadcastPaused: (pauseEvent: PauseEvent) => void,
    sinkPauseEvent: (pauseEvent: PauseEvent) => void,

    consumerClosed: (producerId: ProducerId) => void,
    producerClosed: (producerId: ProducerId) => void,

    consumerTransportClosed: () => void,
    producerTransportClosed: () => void,
}

export type ClientId = NewType<string, "ClientId">
export function newClientId(id = nanoid()) { return id as ClientId; }
