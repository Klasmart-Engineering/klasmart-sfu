import {SFU} from "../sfu";
import {createWorker} from "mediasoup";
import {newRoomId} from "../room";
import {WebSocket, Server} from "ws";

let sfu: SFU;
let wss: Server;
let sockets: Map<number, WebSocket>;
let client: WebSocket;

describe("sfu", () => {
    beforeEach(async () => {
        const worker = await createWorker({
            logLevel: "warn",
            rtcMinPort: 10000,
            rtcMaxPort: 59999,
        });

        const announcedIp = "127.0.0.1";

        sfu = new SFU(worker, [{ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0", announcedIp }]);

        wss = new Server({ port: 8080 });
        let connections = 0;

        sockets = new Map<number, WebSocket>();

        wss.on("connection", (socket) => {
            sockets.set(connections, socket);
            connections++;
        });

        wss.on("close", () => {
            sockets.delete(connections);
            connections--;
        });

        client = new WebSocket("ws://127.0.0.1:8080");

        await new Promise((resolve) => setTimeout(resolve, 200));
    });

    afterEach(() => {
        sfu.shutdown();
        for (const ws of sockets.values()) {
            ws.close();
        }
        client.close();
        wss.close();
    });

    it("should be able to be instantiated", async () => {
        expect(sfu).toBeDefined();
    });

    it("should be able to add a client", async () => {
        const roomId = newRoomId("test-room");
        const isTeacher = false;
        const ws = sockets.get(0);
        expect(ws).toBeDefined();
        if (!ws) {
            return;
        }
        await expect(sfu.addClient(ws, roomId, isTeacher)).resolves.not.toThrow();
    });

    it("should create a room when the first client connects", async () => {
        const roomId = newRoomId("test-room");
        const isTeacher = false;
        const ws = sockets.get(0);
        expect(ws).toBeDefined();
        if (!ws) {
            return;
        }
        await sfu.addClient(ws, roomId, isTeacher);
        const room = sfu.room(roomId);

        expect(room).toBeDefined();
    });

    it ("should delete a room when the last client disconnects", async () => {
        const roomId = newRoomId("test-room-solo");
        const isTeacher = false;
        const ws = sockets.get(0);
        expect(ws).toBeDefined();
        if (!ws) {
            return;
        }
        await sfu.addClient(ws, roomId, isTeacher);
        const room = sfu.room(roomId);
        expect(room).toBeDefined();

        client.close();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        expect(sfu.room(roomId)).toBeUndefined();
    });

    it("should not delete a room if a client disconnects and there are other clients in the room", async () => {
        const roomId = newRoomId("test-room-multi");
        const isTeacher = false;

        const client2 = new WebSocket("ws://127.0.0.1:8080");
        await new Promise((resolve) => setTimeout(resolve, 200));
        const ws = sockets.get(0);
        const ws2 = sockets.get(1);
        expect(ws).toBeDefined();
        expect(ws2).toBeDefined();
        if (!ws || !ws2) {
            return;
        }

        await sfu.addClient(ws, roomId, isTeacher);
        await sfu.addClient(ws2, roomId, isTeacher);
        const room = sfu.room(roomId);
        expect(room).toBeDefined();

        client.close();
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(sfu.room(roomId)).toBeDefined();
        client2.close();
    });
});
