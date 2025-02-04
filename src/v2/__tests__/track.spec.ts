import {Track} from "../track";
import {newClientId} from "../client";
import {MockRouter, MockTransport, rtpCapabilities, rtpParameters, setupSfu, setupSingleClient} from "./utils";
import {types as MediaSoup} from "mediasoup";
import {SFU} from "../sfu";

let sfu: SFU;

describe("track", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
    });

    afterEach(async () => {
        await sfu.shutdown();
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    it("should be able to be created", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        expect(track).toBeDefined();
    });

    it("should be able to add a consumer", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const track = await Track.create(router, clientId, transport, "video", rtpParameters);
        const consumerId = newClientId("consumer");
        const consumer2Id = newClientId("consumer2");

        const consumer = await track.consume(consumerId, transport, rtpCapabilities);
        const consumer2 = await track.consume(consumer2Id, transport, rtpCapabilities);

        expect(consumer).toBeDefined();
        expect(consumer2).toBeDefined();
        expect(track.numConsumers).toBe(2);
    });

    it("should report the producer id", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        expect(track.producerId).toBeDefined();
    });

    it("should close a producer when ending", async () => {
        const clientId = newClientId("client");
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const router = new MockRouter() as unknown as MediaSoup.Router;

        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        const wait = new Promise<void>((resolve) => {
            track.on("closed", () => {
                resolve();
            });
        });
        (track as unknown as {onClose: () => void}).onClose();

        await expect(wait).resolves.not.toThrow();
    });

    it("should set a producer to setPausedGlobally", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        await track.setPausedForUser(client, false);

        const paused = new Promise<boolean>((resolve) => {
            track.on("pausedGlobally", (paused) => {
                resolve(paused);
            });
        });

        await track.setPausedGlobally(true);

        expect(track.pausedGlobally).toBe(true);

        await expect(paused).resolves.toEqual(true);
    });

    it("should set a track to pausedByOwner", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        await track.setPausedGlobally(false);
        await track.setPausedForUser(client, false);

        const paused = new Promise<boolean>((resolve) => {
            track.on("pausedByProducingUser", (paused) => {
                resolve(paused);
            });
        });

        await track.setPausedForUser(client, true);

        expect(track.pausedByProducingUser).toBe(true);

        await expect(paused).resolves.toEqual(true);
    });

    it("should resume a track pausedByOwner", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        await track.setPausedGlobally(false);
        await track.setPausedForUser(client, false);

        const paused = new Promise<boolean>((resolve) => {
            track.once("pausedByProducingUser", (paused) => {
                resolve(paused);
            });
        });

        await track.setPausedForUser(client, true);

        expect(track.pausedByProducingUser).toBe(true);

        await expect(paused).resolves.toEqual(true);

        const resumed = new Promise<boolean>((resolve) => {
            track.once("pausedByProducingUser", (resumed) => {
                resolve(resumed);
            });
        });

        await track.setPausedForUser(client, false);

        expect(track.pausedByProducingUser).toBe(false);

        await expect(resumed).resolves.toEqual(false);
    });

    it("should set a consumer to pausedByOwner", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const consumerClient = await setupSingleClient(sfu);
        const consumerId = consumerClient.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        const consumer = await track.consume(consumerId, transport, rtpCapabilities);

        await consumer.setPausedByUser({pausedUpstream: false, pausedByUser: false});

        await track.setPausedForUser(consumerClient, true);

        expect(consumer.parameters().paused).toBe(true);
    });

    it("should throw if an owner is trying to consume its own producer", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        const wait = track.consume(clientId, transport, rtpCapabilities);

        await expect(wait).rejects.toThrow();
    });

    it("should throw if trying to locally pause a consumer that doesn't exist", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const consumerClient = await setupSingleClient(sfu);
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        expect(track.numConsumers).toEqual(0);

        const wait = new Promise<void>((resolve, reject) => {
            track.setPausedForUser(consumerClient, true).catch((error) => {
                reject(error);
            }).then(() => {
                resolve();
            });
        });

        await expect(wait).rejects.toThrow();
    });

    it("should remove a consumer when it closes", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const consumerClient = await setupSingleClient(sfu);
        const consumerId = consumerClient.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        const consumer = await track.consume(consumerId, transport, rtpCapabilities);

        expect(track.numConsumers).toEqual(1);

        const wait = new Promise<void>((resolve) => {
            consumer.on("closed", () => {
                resolve();
            });
        });

        (consumer as unknown as {onClose: () => void}).onClose();

        await expect(wait).resolves.not.toThrow();

        expect(track.numConsumers).toEqual(0);
    });

    it("should throw if trying to consume a track twice", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const consumeClient = await setupSingleClient(sfu);
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, client.id, transport, "video", rtpParameters);

        await track.consume(consumeClient.id, transport, rtpCapabilities);

        const wait = track.consume(consumeClient.id, transport, rtpCapabilities);

        await expect(wait).rejects.toThrow();
    });
});
