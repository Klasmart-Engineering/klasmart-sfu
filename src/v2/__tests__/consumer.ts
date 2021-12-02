import {mockConsumerParams, MockTransport, setupMockConsumer} from "./utils";
import {types as MediaSoup} from "mediasoup";
import {Consumer} from "../consumer";
import {mediaCodecs} from "../../config";

describe("consumer", () => {
    it("should be able to be created", async () => {
        const consumer = await setupMockConsumer();

        expect(consumer).toBeDefined();
    });

    it("should close on transport close", async () => {
        const transport = new MockTransport();
        const params = mockConsumerParams();
        const consumer = await Consumer.create(transport as unknown as MediaSoup.WebRtcTransport, params);

        const waitClose = new Promise<void>((resolve) => {
            consumer.emitter.once("closed", () => {
                resolve();
            });
        });

        transport.triggerConsumer("transportclose");

        await expect(waitClose).resolves.not.toThrow();
    });

    it("should close on producer close", async () => {
        const transport = new MockTransport();
        const params = mockConsumerParams();
        const consumer = await Consumer.create(transport as unknown as MediaSoup.WebRtcTransport, params);

        const waitClose = new Promise<void>((resolve) => {
            consumer.emitter.once("closed", () => {
                resolve();
            });
        });

        transport.triggerConsumer("producerclose");

        await expect(waitClose).resolves.not.toThrow();
    });

    it("should return an id", async () => {
        const consumer = await setupMockConsumer();

        expect(consumer.id).toEqual("id");
    });

    it("should set a locallyPaused state", async () => {
        const consumer = await setupMockConsumer();
        expect(consumer.locallyPaused).toEqual(true);

        await consumer.setLocallyPaused(false);
        expect(consumer.locallyPaused).toEqual(false);

        await consumer.setLocallyPaused(true);
        expect(consumer.locallyPaused).toEqual(true);
    });

    it("should pause when the producer pauses", async () => {
        const transport = new MockTransport();
        const params = mockConsumerParams();
        const consumer = await Consumer.create(transport as unknown as MediaSoup.WebRtcTransport, params);

        transport.setProducerPaused(false);
        await consumer.setLocallyPaused(false);

        const waitPause = new Promise((resolve) => {
            consumer.emitter.once("paused", (paused) => {
                resolve(paused);
            });
        });

        transport.triggerConsumer("producerpause");

        await expect(waitPause).resolves.toEqual(true);
    });

    it("should resume when the producer resumes", async () => {
        const transport = new MockTransport();
        const params = mockConsumerParams();
        const consumer = await Consumer.create(transport as unknown as MediaSoup.WebRtcTransport, params);

        await consumer.setLocallyPaused(false);
        transport.setProducerPaused(false);

        const waitPause = new Promise((resolve) => {
            consumer.emitter.once("paused", (paused) => {
                resolve(paused);
            });
        });

        transport.triggerConsumer("producerresume");

        await expect(waitPause).resolves.toEqual(false);
    });

    it("should respond to a layerschange event", async () => {
        const transport = new MockTransport();
        const params = mockConsumerParams();
        const consumer = await Consumer.create(transport as unknown as MediaSoup.WebRtcTransport, params);

        const waitLayersChange = new Promise((resolve) => {
            consumer.emitter.once("layerschange", (layers) => {
                resolve(layers);
            });
        });

        transport.triggerConsumer("layerschange");

        await expect(waitLayersChange).resolves.not.toThrow();
    });

    it("should return its parameters", async () => {
        const consumer = await setupMockConsumer();

        expect(consumer.parameters()).toMatchObject({
            id: "id",
            kind: "audio",
            producerId: "id",
            rtpParameters: {
                codecs: mediaCodecs
            }
        });
    });
});
