import {setupMockProducer} from "./utils";
import {newClientId} from "../client";
import {newTrackId, Track} from "../track";
import {types as MediaSoup} from "mediasoup";
import {Room} from "../room";

describe("room", () => {
    it("should be able to add a track", async () => {
        const producer = await setupMockProducer();
        const clientId = newClientId("clientId");
        const track = new Track(clientId, producer);
        const router = {
            close: () => undefined
        } as unknown as MediaSoup.Router;
        const room = new Room(router);
        const trackId = newTrackId("trackId");

        room.addTrack(trackId, track);

        expect(room.track(trackId)).toBe(track);
    });

    it("should throw when trying to retrieve a track that doesn't exist", async () => {
        const router = {
            close: () => undefined
        } as unknown as MediaSoup.Router;
        const room = new Room(router);

        expect(() => {room.track(newTrackId("trackId"));}).toThrow();
    });

    it("should throw when trying to replace a track", async () => {
        const producer = await setupMockProducer();
        const clientId = newClientId("clientId");
        const track = new Track(clientId, producer);
        const router = {
            close: () => undefined
        } as unknown as MediaSoup.Router;
        const room = new Room(router);
        const trackId = newTrackId("trackId");

        room.addTrack(trackId, track);

        expect(() => {room.addTrack(trackId, track);}).toThrow();
    });

    it("should remove a track", async () => {
        const producer = await setupMockProducer();
        const clientId = newClientId("clientId");
        const track = new Track(clientId, producer);
        const router = {
            close: () => undefined
        } as unknown as MediaSoup.Router;
        const room = new Room(router);
        const trackId = newTrackId("trackId");

        room.addTrack(trackId, track);
        room.removeTrack(trackId);

        expect(() => room.track(trackId)).toThrow();
    });

    it("should end a room", async () => {
        const router = {
            close: () => undefined
        } as unknown as MediaSoup.Router;
        const room = new Room(router);

        expect(() => room.end()).not.toThrow();
    });
});
