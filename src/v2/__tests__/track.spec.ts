import {Track} from "../track";
import {newClientId} from "../client";
import {MockRouter, MockTransport, setupSfu, setupSingleClient} from "./utils";
import {types as MediaSoup} from "mediasoup";
import {RtpCapabilities, RtpParameters} from "mediasoup/node/lib/RtpParameters";
import {SFU} from "../sfu";

const rtpParameters: RtpParameters = {
    codecs: [{
        mimeType: "video/VP8",
        payloadType: 100,
        clockRate: 90000,
        channels: 1,
        parameters: {},
    }],
    headerExtensions: [],
    encodings: [{
        ssrc: 100,
        codecPayloadType: 100,
        rtx: {
            ssrc: 200,
        },
    }],
};

const rtpCapabilities: RtpCapabilities = {
    codecs: [{
        mimeType: "video/VP8",
        kind: "video",
        clockRate: 90000,
        channels: 1,
        parameters: {},
    }],
    headerExtensions: [],
};

let sfu: SFU;

describe("track", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
    });
    afterEach(() => {
        sfu.shutdown();
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
        track.end();

        await expect(wait).resolves.not.toThrow();
    });

    it("should set a producer to pausedByAdmin", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        await track.pauseClient(client, false);

        const paused = new Promise<boolean>((resolve) => {
            track.on("pausedByAdmin", (paused) => {
                resolve(paused);
            });
        });

        await track.setPausedByAdmin(true);

        expect(track.pausedByAdmin).toBe(true);

        await expect(paused).resolves.toEqual(true);
    });

    it("should set a track to pausedByOwner", async () => {
        const transport = new MockTransport() as unknown as MediaSoup.WebRtcTransport;
        const client = await setupSingleClient(sfu);
        const clientId = client.id;
        const router = new MockRouter() as unknown as MediaSoup.Router;
        const track = await Track.create(router, clientId, transport, "video", rtpParameters);

        await track.setPausedByAdmin(false);
        await track.pauseClient(client, false);

        const paused = new Promise<boolean>((resolve) => {
            track.on("pausedByOwner", (paused) => {
                resolve(paused);
            });
        });

        await track.pauseClient(client, true);

        expect(track.pausedByOwner).toBe(true);

        await expect(paused).resolves.toEqual(true);
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

        await consumer.setSinkPaused(false);

        await track.pauseClient(consumerClient, true);

        expect(consumer.sinkIsPaused).toBe(true);
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
            track.pauseClient(consumerClient, true).catch((error) => {
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

        consumer.close();

        await expect(wait).resolves.not.toThrow();

        expect(track.numConsumers).toEqual(0);
    });
});
