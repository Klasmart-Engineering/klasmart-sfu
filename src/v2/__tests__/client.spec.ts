import {SFU} from "../sfu";
import {rtpParameters, setupSfu, setupSingleClient} from "./utils";
import {types as MediaSoup} from "mediasoup";
import {mediaCodecs} from "../../config";
import {newRequestID, Request, Response, Result} from "../client";
import {newProducerId} from "../track";
import {DtlsParameters} from "mediasoup/node/lib/WebRtcTransport";

let sfu: SFU;

describe("client", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
    });
    afterEach(() => {
        sfu.shutdown();
    });

    it("should handle an rtpCapabilities message", async () => {
        const client = await setupSingleClient(sfu);

        const rtpCapabilities: MediaSoup.RtpCapabilities = {
            codecs: mediaCodecs,
            headerExtensions: []
        };
        client.on("response", response => expect(response).toHaveProperty("result"));
        await client.onMessage({
            id: newRequestID("0"),
            request: {
                setRtpCapabilities: rtpCapabilities
            }
        });

        client.onClose();
    });

    it("should handle a createProducerTransport message", async () => {
        const client = await setupSingleClient(sfu);

        client.on("response", response => expect(response).toHaveProperty( "result"));
        await client.onMessage({
            id: newRequestID("0"),
            request: {
                createProducerTransport: {}
            }
        });
        client.onClose();
    });

    it("should throw when trying to connect to a producer transport prior to creating a producer transport", async () => {
        const client = await setupSingleClient(sfu);

        const request = {
            connectProducerTransport: {
                dtlsParameters: {
                    fingerprints: []
                }
            }
        };
        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: Producer transport has not been initialized"
            }));
        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should handle a createConsumerTransport message", async () => {
        const client = await setupSingleClient(sfu);

        const request = {
            createConsumerTransport: {}
        };

        client.on("response", response => expect(response).toHaveProperty("result"));
        await client.onMessage(
            {
                id: newRequestID("0"),
                request
            }
        );
        client.onClose();
    });

    it("should throw when trying to connect to a consumer transport prior to creating a consumer transport", async () => {
        const client = await setupSingleClient(sfu);

        const request = {
            connectConsumerTransport: {dtlsParameters: {fingerprints :[]}}
        };
        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: Consumer transport has not been initialized"
            }));

        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should throw when trying to create a track prior to creating a producer transport", async () => {
        const client = await setupSingleClient(sfu);

        const request: Request = {
            produceTrack: {
                kind: "audio",
                rtpParameters: {
                    codecs: [{
                        mimeType: "audio/opus",
                        clockRate: 48000,
                        channels: 2,
                        payloadType: 100
                    }]
                },
                name: "Name"
            }
        };

        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: Producer transport has not been initialized"
            }));
        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should throw when trying to create a consumer prior to exchanging rtpCapabilities", async () => {
        const client = await setupSingleClient(sfu);

        const request: Request = {
            consumeTrack: {
                producerId: newProducerId("producer-id")
            }
        };

        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: RTP Capabilities has not been initialized"
            }));
        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should throw when trying to locally pause a track that doesn't exist", async () => {
        const client = await setupSingleClient(sfu);

        const request: Request = {
            pause: {
                paused: true,
                id: newProducerId("track-id")
            }
        };

        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: Track track-id not found"
            }));
        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should throw when trying to globally pause a track and the client is not a teacher", async () => {
        const client = await setupSingleClient(sfu);

        const request: Request = {
            pauseForEveryone: {
                paused: true,
                id: newProducerId("track-id")
            }
        };

        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: Only teachers can pause for everyone"
            }));
        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should throw when trying to globally pause a track that doesn't exist", async () => {
        const client = await setupSingleClient(sfu, true);

        const request: Request = {
            pauseForEveryone: {
                paused: true,
                id: newProducerId("track-id")
            }
        };

        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: Track track-id not found"
            }));
        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should throw when trying to end a room and the client is not a teacher", async () => {
        const client = await setupSingleClient(sfu);

        const request: Request = {
            endRoom: {}
        };

        client.on("response", response => expect(response).toEqual(
            {
                id: "0",
                error: "Error: Only teachers can end the room"
            }));
        await client.onMessage({
            id: newRequestID("0"),
            request
        });

        client.onClose();
    });

    it("should handle a connectProducerTransport message", async () => {
        const client = await setupSingleClient(sfu);

        const request: Request = {
            createProducerTransport: {}
        };
        let dtlsParameters: DtlsParameters = {fingerprints: []};
        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("result");
            const success = response as {id: string, result: Result};
            if (success.result && success.result.producerTransportCreated) {
                dtlsParameters = success.result.producerTransportCreated.dtlsParameters;
            }
        });
        await client.onMessage({
            id: newRequestID("0"),
            request
        });
        client.once("response", response => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("producerTransportConnected");
        });
        await client.onMessage({
            id: newRequestID("1"),
            request: {
                connectProducerTransport: {
                    dtlsParameters
                }
            }
        });

        client.onClose();
    });

    it("should handle a produceTrack message", async () => {
        const client = await setupSingleClient(sfu);
        let dtlsParameters: DtlsParameters = {fingerprints: []};
        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("result");
            const success = response as {id: string, result: Result};
            if (success.result && success.result.producerTransportCreated) {
                dtlsParameters = success.result.producerTransportCreated.dtlsParameters;
            }
        });
        await client.onMessage({
            id: newRequestID("0"),
            request: {
                createProducerTransport: {}
            }
        });

        await client.onMessage({
            id: newRequestID("1"),
            request: {
                connectProducerTransport: {
                    dtlsParameters
                }
            }
        });

        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("result");
        });
        await client.onMessage({
            id: newRequestID("2"),
            request: {
                produceTrack: {
                    kind: "video",
                    rtpParameters,
                    name: "camera"
                }
            }
        });

        client.onClose();
    });

    it("should get the router RTP capabilities", async () => {
        const client = await setupSingleClient(sfu);
        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("result");
            const success = response as {id: string, result: Result};
            if (success.result && success.result.routerRtpCapabilities) {
                const routerRtpCapabilities = success.result.routerRtpCapabilities;
                expect(routerRtpCapabilities).toHaveProperty("codecs");
                expect(routerRtpCapabilities).toHaveProperty("headerExtensions");
            }
        });
        await client.onMessage({
            id: newRequestID("0"),
            request: {
                getRouterRtpCapabilities: {}
            }
        });

        client.onClose();
    });

    it("should handle a connectConsumerTransport request", async () => {
        const client = await setupSingleClient(sfu);
        let dtlsParameters: DtlsParameters = {fingerprints: []};
        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("result");
            const success = response as {id: string, result: Result};
            if (success.result && success.result.consumerTransportCreated) {
                dtlsParameters = success.result.consumerTransportCreated.dtlsParameters;
            }
        });
        await client.onMessage({
            id: newRequestID("0"),
            request: {
                createConsumerTransport: {}
            }
        });
        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("result");
        });
        await client.onMessage({
            id: newRequestID("1"),
            request: {
                connectConsumerTransport: {
                    dtlsParameters
                }
            }
        });

        client.onClose();
    });
});
