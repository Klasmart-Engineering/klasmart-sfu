import {SFU} from "../sfu";
import {newRoomId, Room, RoomId} from "../room";
import { setupSfu } from "./utils";

let sfu: SFU;

describe("sfu", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
    });

    afterEach(() => {
        sfu.shutdown();
    });

    it("should be able to be instantiated", async () => {
        expect(sfu).toBeDefined();
    });

    it("should be able to add a client", async () => {
        const userId = "user-id";
        const roomId = newRoomId("test-room");
        const isTeacher = false;

        await expect(sfu.createClient(userId, roomId, isTeacher)).resolves.not.toThrow();
    });

    it("should create a room when the first client connects", async () => {
        const userId = "user-id";
        const roomId = newRoomId("test-room");
        const isTeacher = false;

        await sfu.createClient(userId, roomId, isTeacher);
        const room = (sfu as unknown as {rooms: Map<RoomId, Room>}).rooms.get(roomId);

        expect(room).toBeDefined();
    });

    it ("should delete a room when the last client disconnects", async () => {
        const userId = "user-id";
        const roomId = newRoomId("test-room-solo");
        const isTeacher = false;
        await sfu.createClient(userId, roomId, isTeacher);
        const room = (sfu as unknown as {rooms: Map<RoomId, Room>}).rooms.get(roomId);
        expect(room).toBeDefined();

        const clients = Array.from(room?.clients || []);

        for (const client of clients) {
            client.onClose();
        }

        expect((sfu as unknown as {rooms: Map<RoomId, Room>}).rooms.get(roomId)).toBeUndefined();
    });

    it("should not delete a room if a client disconnects and there are other clients in the room", async () => {
        const userId1 = "user-id";
        const userId2 = "user-id-2";
        const roomId = newRoomId("test-room-multi");
        const isTeacher = false;

        await sfu.createClient(userId1, roomId, isTeacher);
        const client = await sfu.createClient(userId2, roomId, isTeacher);
        const room = (sfu as unknown as {rooms: Map<RoomId, Room>}).rooms.get(roomId);
        expect(room).toBeDefined();

        client.onClose();

        expect((sfu as unknown as {rooms: Map<RoomId, Room>}).rooms.get(roomId)).toBeDefined();
    });
});
