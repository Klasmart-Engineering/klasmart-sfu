import { nanoid } from "nanoid";
import {
    types as MediaSoup
} from "mediasoup";
import { Logger } from "../logger";
import { Room } from "./room";
import { ProducerId } from "./track";
import { NewType } from "./newType";
import { ConsumerId } from "./consumer";
import { SFU } from "./sfu";
import { EventEmitter } from "eventemitter3";

export type RequestId = NewType<string, "requestId">
export const newRequestId = (id: string) => id as RequestId;

export type RequestMessage = {
    id: RequestId,
    request: Request,
}

export type Request = {
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
type ProduceTrackRequest = {
    kind: MediaSoup.MediaKind,
    rtpParameters: MediaSoup.RtpParameters,
    appData?: Record<string, unknown>,
};
type ConsumeTrackRequest = { producerId: ProducerId };
type PauseRequest = { paused: boolean, id: ProducerId };



export type ResponseMessage = {
    response?: Response,

    pausedSource?: PauseEvent,
    pausedGlobally?: PauseEvent,

    consumerClosed?: ProducerId,
    producerClosed?: ProducerId,

    consumerTransportClosed?: unknown,
    producerTransportClosed?: unknown,
}

export type Response = {
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

export type Result = {
    routerRtpCapabilities?: MediaSoup.RtpCapabilities;

    producerTransportCreated?: WebRtcTransportResult;
    producerCreated?: {
        producerId: ProducerId,
        pausedGlobally: boolean,
    };

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

const MAX_PRODUCERS = 10;

export class ClientV2 {
    public readonly id = newClientId(nanoid());

    private readonly emitter = new EventEmitter<ClientEventMap>();
    public readonly on: ClientV2["emitter"]["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: ClientV2["emitter"]["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: ClientV2["emitter"]["once"] = (event, listener) => this.emitter.once(event, listener);

    private rtpCapabilities?: MediaSoup.RtpCapabilities;
    private producerTransport?: MediaSoup.WebRtcTransport;
    private consumerTransport?: MediaSoup.WebRtcTransport;
    private _numProducers = 0;

    public constructor(
        public readonly userId: string,
        private readonly sfu: SFU,
        public readonly room: Room,
        public readonly isTeacher: boolean,
    ) {
        Logger.info(`Client(${this.id}) created for User(${this.userId})`);
    }

    public get numProducers() {
        return this._numProducers;
    }

    public async onMessage({ id, request }: RequestMessage) {
        try {
            Logger.info(request);
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
            const { producerId, pausedGlobally } = await this.produceTrack(produceTrack);
            return {
                producerCreated: {
                    producerId,
                    pausedGlobally,
                }
            };
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
        Logger.info(`Client(${this.id}) disconnect`);
        this.producerTransport?.close();
        this.consumerTransport?.close();
        this.emitter.emit("close");
    }

    // Network messages
    private async createProducerTransport(): Promise<WebRtcTransportResult> {
        this.producerTransport = await this.createTransport(this.sfu.listenIps);
        this.producerTransport.on("routerclose", () => {
            Logger.info(`Client(${this.id}).ProducerTransport(${this.producerTransport?.id})'s Router(${this.room.router.id}) has closed`);
            this.emitter.emit("producerTransportClosed");
        });
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

    private async produceTrack({ kind, rtpParameters, appData}: ProduceTrackRequest) {
        if (!this.producerTransport) { throw new Error("Producer transport has not been initialized"); }
        if (this.numProducers + 1 > MAX_PRODUCERS) { throw new Error("Too many producers"); }
        const name = appData && appData["name"] && typeof appData["name"] === "string" ? appData["name"] : undefined;
        const sessionId = appData && appData["sessionId"] && typeof appData["sessionId"] === "string" ? appData["sessionId"] : undefined;
        const track = await this.room.createTrack(
            this.id,
            this.producerTransport,
            kind,
            rtpParameters,
            name,
            sessionId,
        );

        const producerId = track.producerId;

        this._numProducers++;
        track.on("closed", () => {
            Logger.info(`Track(${track.producerId}) close`);
            this.emitter.emit("producerClosed", producerId);
            this._numProducers--;
        });

        track.on("pausedGlobally", paused => this.emitter.emit("pausedGlobally", {producerId, paused}));

        return track;
    }

    private async createConsumerTransport(): Promise<WebRtcTransportResult> {
        this.consumerTransport = await this.createTransport(this.sfu.listenIps);
        this.consumerTransport.on("routerclose", () => {
            Logger.info(`Client(${this.id}).ConsumerTransport(${this.consumerTransport?.id})'s Router(${this.room.router.id}) has closed`);
            this.emitter.emit("consumerTransportClosed");
        });
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

        consumer.on("closed", () => {
            Logger.info(`Client(${this.id}).Consumer(${this.consumerTransport?.id}) has closed`);
            this.emitter.emit("consumerClosed", producerId);
        });

        track.on("pausedByProducingUser", paused => this.emitter.emit("pausedByProducingUser", {producerId, paused}));
        this.emitter.emit("pausedByProducingUser", {producerId, paused: track.pausedByProducingUser});

        track.on("pausedGlobally", paused => this.emitter.emit("pausedGlobally", {producerId, paused}));
        this.emitter.emit("pausedGlobally", {producerId, paused: track.pausedGlobally});

        return consumer.parameters();
    }

    private async createTransport(listenIps: MediaSoup.TransportListenIp[]) {
        const transport = await this.room.router.createWebRtcTransport({
            listenIps,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });
        Logger.info(transport);

        transport.on("routerclose", () => transport.close());

        transport.on("icestatechange", iceState => Logger.info(`Client(${this.id}).Transport(${transport.id}) iceState(${iceState})`));
        transport.on("iceselectedtuplechange", iceSelectedTuple => Logger.info(`Client(${this.id}).Transport(${transport.id}) iceSelectedTuple(${iceSelectedTuple})`));
        transport.on("dtlsstatechange", dtlsState => Logger.info(`Client(${this.id}).Transport(${transport.id}) dtlsState(${dtlsState})`));
        transport.on("sctpstatechange", sctpState => Logger.info(`Client(${this.id}).Transport(${transport.id}) sctpState(${sctpState})`));

        return transport;
    }

    @ClientV2.onlyTeacher("Only teachers can end the room")
    private async endRoom() {
        this.room.end();
        return {
            end: true
        };
    }

    @ClientV2.onlyTeacher("Only teachers can pause for everyone")
    private async pauseForEveryone({ paused, id }: PauseRequest) {
        const track = this.room.track(id);
        await track.setPausedGlobally(paused);
    }

    private async pause({ paused, id }: PauseRequest) {
        const track = this.room.track(id);
        await track.setPausedForUser(this, paused);
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

export type ClientEventMap = {
    close: () => void,
    response: (response: Response) => void,

    pausedByProducingUser: (pauseEvent: PauseEvent) => void,
    pausedGlobally: (pauseEvent: PauseEvent) => void,

    consumerClosed: (producerId: ProducerId) => void,
    producerClosed: (producerId: ProducerId) => void,

    consumerTransportClosed: () => void,
    producerTransportClosed: () => void,
}

export type ClientId = NewType<string, "ClientId">;
export function newClientId(id: string) { return id as ClientId; }
