import {createWorker, types as MediaSoup} from "mediasoup";
import {SFU} from "../sfu";
import {Data, Server, WebSocket} from "ws";
import {newRoomId} from "../room";
import {newTrackId} from "../track";
import {newProducerId, Producer, ProducerParams} from "../producer";
import {ProducerOptions} from "mediasoup/node/lib/Producer";

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
    private generator: AsyncGenerator<Data | undefined, void>;
    constructor(private readonly client: WebSocket) {
        this.generator = this.messages();
    }

    private async * messages() {
        this.client.on("message", (data: Data) => {
            this.receivedMessages.push(data);
        });

        while (true) {
            if (this.receivedMessages.length > 0) {
                yield this.receivedMessages.shift();
                continue;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
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
    public async produce(params: ProducerOptions) {
        const { producer, trigger } = createMockProducer(params.id);
        this.producer = trigger;
        return producer;
    }

    public trigger(event: string) {
        return this.producer?.trigger(event);
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
        return newProducerId(this._id);
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
