import {newClientId} from "../client";
import {newProducerId} from "../track";
import {types as MediaSoup} from "mediasoup";
import {newRoomId, Room} from "../room";
import {MockRegistrar, MockTransport, rtpParameters} from "./utils";
import {newSfuId} from "../sfu";

describe("room", () => {
    it("should be able to add a track", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const registrar = MockRegistrar();
        const sfuId = newSfuId("sfu");

        const roomId = newRoomId("room");
        const room = await Room.create(roomId, sfuId, registrar);
        const track = await room.createTrack(clientId, transport, "video", rtpParameters);

        expect(room.track(track.producerId)).toBe(track);
    });

    it("should throw when trying to retrieve a track that doesn't exist", async () => {
        const registrar = MockRegistrar();
        const sfuId = newSfuId("sfu");

        const roomId = newRoomId("room");
        const room = await Room.create(roomId, sfuId, registrar);

        expect(() => {room.track(newProducerId("trackId"));}).toThrow();
    });

    it("should remove a track", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const registrar = MockRegistrar();
        const sfuId = newSfuId("sfu");

        const roomId = newRoomId("room");
        const room = await Room.create(roomId, sfuId, registrar);
        const track = await room.createTrack(clientId, transport, "video", rtpParameters);

        (track as unknown as {onClose: () => void}).onClose();

        expect(() => room.track(track.producerId)).toThrow();
    });

    it("should end a room", async () => {
        const registrar = MockRegistrar();
        const sfuId = newSfuId("sfu");

        const roomId = newRoomId("room");
        const room = await Room.create(roomId, sfuId, registrar);

        expect(() => room.end()).not.toThrow();
    });
});
