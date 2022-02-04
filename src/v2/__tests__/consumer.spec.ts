import {createMockTransport, MockTransport, setupMockConsumer} from "./utils";
import {Consumer} from "../consumer";
import {mediaCodecs} from "../../config";
import {newProducerId} from "../track";

describe("consumer", () => {
    it("should be able to be created", async () => {
        const consumer = await setupMockConsumer();
        expect(consumer).toBeDefined();
    });

    it("should close on transport close", async () => {
        const transport = createMockTransport();
        const producerId = newProducerId();
        const rtpCapabilities = {codecs: mediaCodecs};
        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);

        const waitClose = new Promise<void>((resolve) => {
            consumer.once("closed", () => {
                resolve();
            });
        });

        (transport as unknown as MockTransport).triggerConsumer("transportclose");

        await expect(waitClose).resolves.not.toThrow();
    });

    it("should close on producer close", async () => {
        const transport = createMockTransport();
        const producerId = newProducerId();
        const rtpCapabilities = {codecs: mediaCodecs};
        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);

        const waitClose = new Promise<void>((resolve) => {
            consumer.once("closed", () => {
                resolve();
            });
        });

        (transport as unknown as MockTransport).triggerConsumer("producerclose");

        await expect(waitClose).resolves.not.toThrow();
    });

    it("should return an id", async () => {
        const consumer = await setupMockConsumer();

        expect(consumer.id).toBeDefined();
    });

    it("should set a locallyPaused state", async () => {
        const consumer = await setupMockConsumer();
        expect(consumer.sinkIsPaused).toEqual(true);

        await consumer.setSinkPaused(false);
        expect(consumer.sinkIsPaused).toEqual(false);

        await consumer.setSinkPaused(true);
        expect(consumer.sinkIsPaused).toEqual(true);
    });

    it("should pause when the producer pauses", async () => {
        const transport = createMockTransport();
        const producerId = newProducerId();
        const rtpCapabilities = {codecs: mediaCodecs};
        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);

        (transport as unknown as MockTransport).setProducerPaused(false);
        await consumer.setSinkPaused(false);

        const waitPause = new Promise((resolve) => {
            consumer.once("paused", (paused) => {
                resolve(paused);
            });
        });
        (transport as unknown as MockTransport).setProducerPaused(true);

        (transport as unknown as MockTransport).triggerConsumer("producerpause");

        await expect(waitPause).resolves.toEqual(true);
    });

    it("should resume when the producer resumes", async () => {
        const transport = createMockTransport();
        const producerId = newProducerId();
        const rtpCapabilities = {codecs: mediaCodecs};
        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);

        await consumer.setSinkPaused(false);
        // Not a typo!  This is a quick test to make sure the `setSinkPaused` call is idempotent
        await consumer.setSinkPaused(false);
        (transport as unknown as MockTransport).setProducerPaused(true);

        const waitPause = new Promise((resolve) => {
            consumer.once("paused", (paused) => {
                resolve(paused);
            });
        });

        (transport as unknown as MockTransport).setProducerPaused(false);

        (transport as unknown as MockTransport).triggerConsumer("producerresume");

        await expect(waitPause).resolves.toEqual(false);
    });

    it("should respond to a layerschange event", async () => {
        const transport = createMockTransport();
        const producerId = newProducerId();
        const rtpCapabilities = {codecs: mediaCodecs};
        const consumer = await Consumer.create(transport, producerId, rtpCapabilities);

        const waitLayersChange = new Promise((resolve) => {
            consumer.once("layerschange", (layers) => {
                resolve(layers);
            });
        });

        (transport as unknown as MockTransport).triggerConsumer("layerschange");

        await expect(waitLayersChange).resolves.not.toThrow();
    });

    it("should return its parameters", async () => {
        const consumer = await setupMockConsumer();

        expect(consumer.parameters()).toBeDefined();
    });

    it("should emit on close", async () => {
        const consumer = await setupMockConsumer();

        const waitClose = new Promise<void>((resolve) => {
            consumer.once("closed", () => {
                resolve();
            });
        });

        consumer.close();
        // Not a typo!  This is a quick test to make sure the close operation is idempotent
        consumer.close();

        await expect(waitClose).resolves.not.toThrow();
    });
});
