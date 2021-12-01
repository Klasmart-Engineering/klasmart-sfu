import {SFU} from "../sfu";
import {newRoomId} from "../room";
import {newClient, setupSfu, TestWssServer} from "./utils";

let sfu: SFU;
let wss: TestWssServer;

describe("sfu", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
        wss = new TestWssServer(8080);
    });

    afterEach(() => {
        sfu.shutdown();
        wss.close();
    });

    it("should be able to be instantiated", async () => {
        expect(sfu).toBeDefined();
    });

    it("should be able to add a client", async () => {
        const client = await newClient(wss);

        const roomId = newRoomId("test-room");
        const isTeacher = false;
        const ws = wss.getSocket(0);

        await expect(sfu.addClient(ws, roomId, isTeacher)).resolves.not.toThrow();
        client.close();
    });

    it("should create a room when the first client connects", async () => {
        const client = await newClient(wss);

        const roomId = newRoomId("test-room");
        const isTeacher = false;
        const ws = wss.getSocket(0);

        await sfu.addClient(ws, roomId, isTeacher);
        const room = sfu.room(roomId);

        expect(room).toBeDefined();
        client.close();
    });

    it ("should delete a room when the last client disconnects", async () => {
        const client = await newClient(wss);

        const roomId = newRoomId("test-room-solo");
        const isTeacher = false;
        const ws = wss.getSocket(0);
        await sfu.addClient(ws, roomId, isTeacher);
        const room = sfu.room(roomId);
        expect(room).toBeDefined();

        const socket = wss.getSocket(0);
        const wait = new Promise(resolve => socket.on("close", () => {
            resolve(undefined);
        }));
        client.close();

        await wait;

        expect(sfu.room(roomId)).toBeUndefined();
    });

    it("should not delete a room if a client disconnects and there are other clients in the room", async () => {
        const client = await newClient(wss);

        const roomId = newRoomId("test-room-multi");
        const isTeacher = false;

        const client2 = await newClient(wss);

        const ws = wss.getSocket(0);
        const ws2 = wss.getSocket(1);

        await sfu.addClient(ws, roomId, isTeacher);
        await sfu.addClient(ws2, roomId, isTeacher);
        const room = sfu.room(roomId);
        expect(room).toBeDefined();

        const socket = wss.getSocket(0);
        const wait = new Promise(resolve => socket.on("close", () => {
            resolve(undefined);
        }));
        client.close();
        await wait;
        expect(sfu.room(roomId)).toBeDefined();
        client2.close();
    });
});
