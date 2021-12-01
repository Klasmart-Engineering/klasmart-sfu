import {createWorker} from "mediasoup";
import {SFU} from "../sfu";
import {Data, Server, WebSocket} from "ws";
import {newRoomId} from "../room";

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
