import {createWorker, types as MediaSoup} from "mediasoup";
import {SFU} from "../sfu";
import {Data, Server, WebSocket} from "ws";
import {newRoomId} from "../room";
import {newTrackId} from "../track";
import {newProducerId, Producer, ProducerParams} from "../producer";
import {Consumer, ConsumerParams} from "../consumer";
import {mediaCodecs} from "../../config";

export async function setupSfu() {
    const worker = await createWorker({
        logLevel: "warn",
        rtcMinPort: 10000,
        rtcMaxPort: 59999,
    });

    const announcedIp = "127.0.0.1";

    return new SFU(worker, [{ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0", announcedIp }]);
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

export async function setupSingleClient(wss: TestWssServer, sfu: SFU, isTeacher = false) {
    const client = await newClient(wss);

    const roomId = newRoomId("test-room");
    const ws = wss.getSocket(0);

    await sfu.addClient(ws, roomId, isTeacher);
    return client;
}

// A class that wraps a `WebSocket` to allow you to `await` on messages.
// Useful for blocking until a message is received, and continuing to listen
// afterward.
export class WebSocketMessageGenerator {
    private receivedMessages: Data[] = [];
    private wait: Promise<void>;
    private waitResolve?: () => void;
    private generator: AsyncGenerator<Data | undefined, void>;
    private closed = false;
    constructor(private readonly client: WebSocket) {
        this.generator = this.messages();
        this.wait = new Promise<void>((resolve) => {
            this.waitResolve = resolve;
        });

        this.client.on("message", (data: Data) => {
            this.receivedMessages.push(data);
            if(!this.waitResolve) {
                throw new Error("waitResolve is undefined");
            }
            this.waitResolve();
            this.wait = new Promise<void>((resolve) => {
                this.waitResolve = resolve;
            });
        });

        this.client.on("close", () => {
            this.closed = true;
        });
    }

    public async * messages() {
        while (!this.closed) {
            if (this.receivedMessages.length > 0) {
                yield this.receivedMessages.shift();
                continue;
            }
            await this.wait;
        }
    }

    public async nextMessage<T>(): Promise<T> {
        const message = await this.generator.next();
        if (message.done) {
            throw new Error("No more messages");
        }
        if (!message.value) {
            throw new Error("No message");
        }
        return JSON.parse(message.value.toString());
    }
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

export async function setupMockProducer() {
    const mockTransport = createMockTransport();
    const params = mockProducerParams();
    return Producer.create(mockTransport, params);
}

export function mockProducerParams(): ProducerParams {
    return {id: newTrackId("id"), kind: "audio", rtpParameters: {codecs: []}};
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

function createMockProducer(id?: string) {
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
    const params = mockConsumerParams();
    return Consumer.create(mockTransport, params);
}

export function mockConsumerParams(): ConsumerParams {
    const rtpCapabilities = {codecs: mediaCodecs };
    return {producerId: newProducerId("id"), rtpCapabilities};
}
