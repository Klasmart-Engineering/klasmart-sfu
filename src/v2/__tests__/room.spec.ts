import {newClientId} from "../client";
import {newProducerId} from "../track";
import {types as MediaSoup} from "mediasoup";
import {newRoomId, Room} from "../room";
import {MockRouter, MockTransport, rtpParameters, setupSfu} from "./utils";
import {SFU} from "../sfu";

let sfu: SFU;
describe("room", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
    });

    afterEach(() => {
        sfu.shutdown();
    });

    it("should be able to add a track", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const roomId = newRoomId("room");
        const room = new Room(roomId, router, () => {console.log("room closed");});
        const track = await room.createTrack(clientId, transport, "video", rtpParameters);

        expect(room.track(track.producerId)).toBe(track);
    });

    it("should throw when trying to retrieve a track that doesn't exist", async () => {
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const roomId = newRoomId("room");
        const room = new Room(roomId, router, () => {console.log("room closed");});

        expect(() => {room.track(newProducerId("trackId"));}).toThrow();
    });

    it("should remove a track", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const roomId = newRoomId("room");
        const room = new Room(roomId, router, () => {console.log("room closed");});
        const track = await room.createTrack(clientId, transport, "video", rtpParameters);

        track.end();

        expect(() => room.track(track.producerId)).toThrow();
    });

    it("should end a room", async () => {
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const roomId = newRoomId("room");
        const room = new Room(roomId, router, () => {console.log("room closed");});

        expect(() => room.end()).not.toThrow();
    });
});
