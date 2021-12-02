import {Track} from "../track";
import {newClientId} from "../client";
import {setupMockConsumer, setupMockProducer} from "./utils";

describe("track", () => {
    it("should be able to be created", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);

        expect(track).toBeDefined();
    });

    it("should be able to add a consumer", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);
        const consumer = await setupMockConsumer();
        const consumerId = newClientId("consumer");
        const consumer2 = await setupMockConsumer();
        const consumer2Id = newClientId("consumer2");

        track.addConsumer(consumerId, consumer);
        track.addConsumer(consumer2Id, consumer2);

        expect(track.numConsumers).toBe(2);
        expect(track.consumer(consumerId)).toBe(consumer);
        expect(track.consumer(consumer2Id)).toBe(consumer2);
    });

    it("should report the consumer id", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);

        expect(track.producerId).toEqual("id");
    });

    it("should close a producer when ending", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);

        const wait = new Promise<void>((resolve) => {
            producer.emitter.on("closed", () => {
                resolve();
            });
        });
        track.end();

        await expect(wait).resolves.not.toThrow();
    });

    it("should set a producer to globallyPaused", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);

        await producer.setLocallyPaused(false);

        const paused = new Promise<boolean>((resolve) => {
            producer.emitter.on("paused", (paused) => {
                resolve(paused);
            });
        });

        await track.globalPause(true);

        expect(producer.globallyPaused).toBe(true);

        await expect(paused).resolves.toEqual(true);
    });

    it("should set a producer to locallyPaused", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);

        await producer.setGloballyPaused(false);
        await producer.setLocallyPaused(false);

        const paused = new Promise<boolean>((resolve) => {
            producer.emitter.on("paused", (paused) => {
                resolve(paused);
            });
        });

        await track.localPause(clientId, true);

        expect(producer.locallyPaused).toBe(true);

        await expect(paused).resolves.toEqual(true);
    });

    it("should set a consumer to locallyPaused", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);
        const consumer = await setupMockConsumer();
        const consumerId = newClientId("consumer");

        track.addConsumer(consumerId, consumer);

        await consumer.setLocallyPaused(false);

        await track.localPause(consumerId, true);

        expect(consumer.locallyPaused).toBe(true);
    });

    it("should throw if an owner is trying to consume its own producer", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);
        const consumer = await setupMockConsumer();
        const wait = new Promise<void>((resolve) => {
            track.addConsumer(clientId, consumer);
            resolve();
        });

        await expect(wait).rejects.toThrow();
    });

    it("should return undefined if the clientId matches the owner", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);

        expect(track.consumer(clientId)).toBeUndefined();
    });

    it("should throw if trying to locally pause a consumer that doesn't exist", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);

        expect(track.numConsumers).toEqual(0);

        const wait = new Promise<void>((resolve, reject) => {
            track.localPause(newClientId("consumerId"), true).catch((error) => {
                reject(error);
            }).then(() => {
                resolve();
            });
        });

        await expect(wait).rejects.toThrow();
    });

    it("should remove a consumer when it closes", async () => {
        const clientId = newClientId("client");
        const producer = await setupMockProducer();
        const track = new Track(clientId, producer);
        const consumer = await setupMockConsumer();
        const consumerId = newClientId("consumer");

        track.addConsumer(consumerId, consumer);

        expect(track.numConsumers).toEqual(1);

        const wait = new Promise<void>((resolve) => {
            consumer.emitter.on("closed", () => {
                resolve();
            });
        });

        consumer.close();

        await expect(wait).resolves.not.toThrow();

        expect(track.numConsumers).toEqual(0);
    });
});
