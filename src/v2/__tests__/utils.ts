import {createWorker, types as MediaSoup} from "mediasoup";
import {SFU} from "../sfu";
import {Server, WebSocket} from "ws";
import {newRoomId} from "../room";
import {Consumer} from "../consumer";
import {mediaCodecs} from "../../config";
import {MockRegistrar} from "../registrar";
import {newProducerId} from "../track";

export async function setupSfu() {
    const worker = await createWorker({
        logLevel: "warn",
        rtcMinPort: 10000,
        rtcMaxPort: 59999,
    });

    const announcedIp = "127.0.0.1";

    return new SFU(worker, [{ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0", announcedIp }], MockRegistrar);
}

export async function newClient(wss: TestWssServer) {
    const client = new WebSocket(wss.address());
    await new Promise((resolve) => {
        wss.attachConnectionHandler(() => resolve(undefined));
    });

    return client;
}

export class TestWssServer {
    private readonly wss: Server;
    private connections = 0;
    private readonly sockets = new Map<number, WebSocket>();

    public constructor(private readonly port: number) {
        this.wss = new Server({port});
        this.wss.on("connection", (socket) => {
            this.sockets.set(this.connections, socket);
            this.connections++;
        });

        this.wss.on("close", () => {
            this.sockets.delete(this.connections);
            this.connections--;
        });
    }

    public attachConnectionHandler(handler: () => any) {
        this.wss.on("connection", handler);
    }
    public getSocket(id: number): WebSocket {
        const socket = this.sockets.get(id);
        if (!socket) {
            throw new Error("Socket not found");
        }
        return socket;
    }

    public address() {
        return `ws://localhost:${this.port}`;
    }

    public close() {
        for (const socket of this.sockets.values()) {
            socket.close();
        }
        this.wss.close();
    }
}

export async function setupSingleClient(sfu: SFU, isTeacher = false) {
    const roomId = newRoomId("test-room");
    return await sfu.createClient(roomId, isTeacher);
}

export class MockTransport {
    private producer?: MockProducer;
    private consumer?: MockConsumer;
    public async produce(params: MediaSoup.ProducerOptions) {
        const { producer, trigger } = createMockProducer(params.id);
        this.producer = trigger;
        return producer;
    }

    public async consume(params: MediaSoup.ConsumerOptions) {
        const { consumer, trigger } = createMockConsumer(params.producerId);
        this.consumer = trigger;
        return consumer;
    }

    public triggerProducer(event: string) {
        return this.producer?.trigger(event);
    }

    public triggerConsumer(event: string) {
        return this.consumer?.trigger(event);
    }

    public setProducerPaused(paused: boolean) {
        if (!this.consumer) {
            return;
        }
        this.consumer.producerPaused = paused;
    }
}

export function createMockTransport() {
    const mockTransport = new MockTransport();
    return mockTransport as unknown as MediaSoup.WebRtcTransport;
}

class MockProducer {
    public paused = true;
    public closed = false;
    private eventHandlers = new Map<string, () => unknown>();
    private readonly _id?: string;

    public constructor(id?: string) {
        if (id) {
            this._id = id;
        }
        else {
            this._id = newProducerId();
        }
    }

    public get id() {
        return this._id;
    }

    public async resume() {
        this.paused = false;
    }

    public async pause() {
        this.paused = true;
    }

    public close() {
        this.closed = true;
    }

    public on(event: string, callback: () => unknown) {
        this.eventHandlers.set(event, callback);
    }

    public trigger(event: string) {
        console.log(JSON.stringify(this));
        const handler = this.eventHandlers.get(event);
        if (!handler) {
            throw new Error(`No handler for event ${event}`);
        }
        return handler();
    }
}

export function createMockProducer(id?: string) {
    const mockProducer = new MockProducer(id);
    return {producer: mockProducer as unknown as MediaSoup.Producer,
        trigger: mockProducer};
}

export class MockConsumer {
    public producerPaused = true;
    public paused = true;
    public closed = false;
    private eventHandlers = new Map<string, () => unknown>();
    public kind = "audio";
    public rtpParameters = {codecs: mediaCodecs};
    public producerId: string;

    public constructor(private readonly _id: string) {
        this.producerId = _id;
    }

    public get id() {
        return this._id;
    }

    public async resume() {
        this.paused = false;
    }

    public async pause() {
        this.paused = true;
    }

    public close() {
        this.closed = true;
    }

    public on(event: string, callback: () => unknown) {
        this.eventHandlers.set(event, callback);
    }

    public trigger(event: string) {
        console.log(JSON.stringify(this));
        const handler = this.eventHandlers.get(event);
        if (!handler) {
            throw new Error(`No handler for event ${event}`);
        }
        return handler();
    }
}

function createMockConsumer(id: string) {
    const mockConsumer = new MockConsumer(id);
    return {consumer: mockConsumer as unknown as MediaSoup.Consumer,
        trigger: mockConsumer};
}

export async function setupMockConsumer() {
    const mockTransport = createMockTransport();
    const producerId = newProducerId();
    const rtpCapabilities = {codecs: mediaCodecs};
    return Consumer.create(mockTransport, producerId, rtpCapabilities);
}

export class MockRouter {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public constructor() {
    }

    public canConsume(properties: unknown) {
        return !!properties;
    }
}
