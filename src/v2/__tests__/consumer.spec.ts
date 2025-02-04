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
        const producerId = newProducerId("producer-id");
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
        const producerId = newProducerId("producer-id");
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
        let parameters = consumer.parameters();
        expect(parameters.paused).toEqual(true);

        await consumer.setPausedByUser({pausedUpstream: false, pausedByUser: false});
        parameters = consumer.parameters();
        expect(parameters.paused).toEqual(false);

        await consumer.setPausedByUser({pausedUpstream: false, pausedByUser: true});
        parameters = consumer.parameters();
        expect(parameters.paused).toEqual(true);
    });

    it("should return its parameters", async () => {
        const consumer = await setupMockConsumer();

        expect(consumer.parameters()).toBeDefined();
    });

    it("should emit on close", async () => {
        const transport = createMockTransport();
        const consumer = await setupMockConsumer(transport);

        const waitClose = new Promise<void>((resolve) => {
            consumer.once("closed", () => {
                resolve();
            });
        });

        (transport as unknown as MockTransport).triggerConsumer("transportclose");

        await expect(waitClose).resolves.not.toThrow();
    });
});
