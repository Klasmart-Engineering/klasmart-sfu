import {mockProducerParams, MockTransport, setupMockProducer} from "./utils";
import {Producer} from "../producer";
import { types as MediaSoup} from "mediasoup";
import {newTrackId} from "../track";

describe("producer", () => {
    it("should be able to be created", async () => {
        const producer = await setupMockProducer();

        expect(producer).toBeDefined();
    });

    it("should close on transport close", async () => {
        const transport = new MockTransport();
        const params = mockProducerParams();
        const producer = await Producer.create(transport as unknown as MediaSoup.WebRtcTransport, params);

        const waitClose = new Promise<void>((resolve) => {
            producer.emitter.once("closed", () => {
                resolve();
            });
        });

        transport.triggerProducer("transportclose");

        await expect(waitClose).resolves.not.toThrow();
    });

    it("should get a producer id", async () => {
        const producer = await setupMockProducer();
        expect(producer.id).toEqual(newTrackId("id"));
    });

    it("should set locallyPaused state", async () => {
        const producer = await setupMockProducer();
        expect(producer.locallyPaused).toBe(true);

        await producer.setLocallyPaused(false);

        expect(producer.locallyPaused).toBe(false);

        await producer.setLocallyPaused(true);
        expect(producer.locallyPaused).toBe(true);
    });

    it("should set globallyPaused state", async () => {
        const producer = await setupMockProducer();
        expect(producer.globallyPaused).toBe(false);

        await producer.setGloballyPaused(true);

        expect(producer.globallyPaused).toBe(true);
    });
});
