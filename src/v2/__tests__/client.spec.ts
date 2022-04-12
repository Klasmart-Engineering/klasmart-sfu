import {SFU} from "../sfu";
import {
    connectConsumerTransport,
    connectProducerTransport, consumeTrack, createConsumerTransport, createProducer,
    createProducerTransport, pauseTrack, pauseTrackForEveryone,
    responseShouldError,
    responseShouldNotError,
    rtpParameters, setRtpCapabilities,
    setupSfu,
    setupSingleClient,
} from "./utils";
import {types as MediaSoup} from "mediasoup";
import {mediaCodecs} from "../../config";
import {newRequestId, Request, Response} from "../client";
import {newProducerId} from "../track";

let sfu: SFU;

describe("client", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
    });

    afterEach(async () => {
        await sfu.shutdown();
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    it("should handle an rtpCapabilities message", async () => {
        const client = await setupSingleClient(sfu);

        const rtpCapabilities: MediaSoup.RtpCapabilities = {
            codecs: mediaCodecs,
            headerExtensions: []
        };
        const waitResponse = responseShouldNotError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request: {
                setRtpCapabilities: rtpCapabilities
            }
        });

        await waitResponse;
        client.onClose();
    });

    it("should handle a createProducerTransport message", async () => {
        const client = await setupSingleClient(sfu);

        const waitResponse = responseShouldNotError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request: {
                createProducerTransport: {}
            }
        });
        await waitResponse;
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
        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });
        const response = await waitResponse;

        expect(response).toEqual(
            {
                id: "0",
                error: "Error: Producer transport has not been initialized"
            });

        client.onClose();
    });

    it("should handle a createConsumerTransport message", async () => {
        const client = await setupSingleClient(sfu);

        const request = {
            createConsumerTransport: {}
        };

        const waitResponse = responseShouldNotError(client);
        await client.onMessage(
            {
                id: newRequestId("0"),
                request
            }
        );
        await waitResponse;
        client.onClose();
    });

    it("should throw when trying to connect to a consumer transport prior to creating a consumer transport", async () => {
        const client = await setupSingleClient(sfu);

        const request = {
            connectConsumerTransport: {dtlsParameters: {fingerprints :[]}}
        };

        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });

        const response = await waitResponse;
        expect(response).toEqual(
            {
                id: "0",
                error: "Error: Consumer transport has not been initialized"
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
            }
        };
        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });

        const response = await waitResponse;
        expect(response).toEqual(
            {
                id: "0",
                error: "Error: Producer transport has not been initialized"
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
        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });

        const response = await waitResponse;
        expect(response).toEqual(
            {
                id: "0",
                error: "Error: RTP Capabilities has not been initialized"
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

        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });

        const response = await waitResponse;
        expect(response).toEqual(
            {
                id: "0",
                error: "Error: Track(\"track-id\") not found"
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

        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });

        const response = await waitResponse;
        expect(response).toEqual(
            {
                id: "0",
                error: "Error: Only teachers can pause for everyone"
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
        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });

        const response = await waitResponse;
        expect(response).toEqual(
            {
                id: "0",
                error: "Error: Track(\"track-id\") not found"
            });

        client.onClose();
    });

    it("should throw when trying to end a room and the client is not a teacher", async () => {
        const client = await setupSingleClient(sfu);

        const request: Request = {
            endRoom: {}
        };
        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request
        });

        const response = await waitResponse;
        expect(response).toEqual(
            {
                id: "0",
                error: "Error: Only teachers can end the room"
            });

        client.onClose();
    });

    it("should handle a connectProducerTransport message", async () => {
        const client = await setupSingleClient(sfu);
        const dtlsParameters = await createProducerTransport(client, newRequestId("0"));
        await connectProducerTransport(dtlsParameters, client, newRequestId("1"));
        client.onClose();
    });

    it("should handle a produceTrack message", async () => {
        const client = await setupSingleClient(sfu);
        const dtlsParameters = await createProducerTransport(client, newRequestId("0"));
        await connectProducerTransport(dtlsParameters, client, newRequestId("1"));

        await createProducer(client, newRequestId("2"), rtpParameters);

        client.onClose();
    });

    it("should get the router RTP capabilities", async () => {
        const client = await setupSingleClient(sfu);
        const waitResponse = responseShouldNotError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request: {
                getRouterRtpCapabilities: {}
            }
        });

        const response = await waitResponse;
        expect(response.result).toHaveProperty("routerRtpCapabilities");
        expect(response.result.routerRtpCapabilities).toHaveProperty("codecs");
        expect(response.result.routerRtpCapabilities).toHaveProperty("headerExtensions");

        client.onClose();
    });

    it("should handle a connectConsumerTransport request", async () => {
        const client = await setupSingleClient(sfu);
        const dtlsParameters = await createConsumerTransport(client, newRequestId("0"));
        await connectConsumerTransport(dtlsParameters, client, newRequestId("1"));

        client.onClose();
    });
    it("should handle a consumeTrack request", async () => {
        const client = await setupSingleClient(sfu);
        const consumeClient = await setupSingleClient(sfu);

        let dtlsParameters = await createProducerTransport(client, newRequestId("0"));
        await connectProducerTransport(dtlsParameters, client, newRequestId("1"));

        const { producerId }  = await createProducer(client, newRequestId("2"), rtpParameters);
        await setRtpCapabilities(consumeClient, newRequestId("0"));

        dtlsParameters = await createConsumerTransport(consumeClient, newRequestId("1"));
        await connectConsumerTransport(dtlsParameters, consumeClient, newRequestId("2"));
        await consumeTrack(consumeClient, producerId, newRequestId("3"));

        consumeClient.onClose();
        client.onClose();
    });

    it("should handle a pause request", async () => {
        const client = await setupSingleClient(sfu);
        const dtlsParameters = await createProducerTransport(client, newRequestId("0"));
        await connectProducerTransport(dtlsParameters, client, newRequestId("1"));

        const { producerId } = await createProducer(client, newRequestId("2"), rtpParameters);
        await pauseTrack(client, producerId, true, newRequestId("3"));

        client.onClose();
    });

    it("should handle a pauseForEveryone request", async () => {
        const client = await setupSingleClient(sfu, true);
        const dtlsParameters = await createProducerTransport(client, newRequestId("0"));
        await connectProducerTransport(dtlsParameters, client, newRequestId("1"));

        const { producerId } = await createProducer(client, newRequestId("2"), rtpParameters);
        await pauseTrackForEveryone(client, producerId, true, newRequestId("3"));

        client.onClose();
    });

    it("should only allow teachers to pause for everyone", async () => {
        const client = await setupSingleClient(sfu);
        const dtlsParameters = await createProducerTransport(client, newRequestId("0"));
        await connectProducerTransport(dtlsParameters, client, newRequestId("1"));

        const { producerId } = await createProducer(client, newRequestId("2"), rtpParameters);

        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("error");
        });

        const waitPause = pauseTrackForEveryone(client, producerId, true, newRequestId("3"));
        await expect(waitPause).rejects.toThrow();

        client.onClose();
    });

    it("should handle an endRoom request", async () => {
        const client = await setupSingleClient(sfu, true);
        client.once("response", (response: Response) => {
            expect(response).toBeDefined();
            expect(response).toHaveProperty("result");
        });
        await client.onMessage({
            id: newRequestId("0"),
            request: {
                endRoom: {}
            }
        });

        client.onClose();
    });

    it("should only allow teachers to end the room", async () => {
        const client = await setupSingleClient(sfu);
        const waitResponse = responseShouldError(client);
        await client.onMessage({
            id: newRequestId("0"),
            request: {
                endRoom: {}
            }
        });

        const response = await waitResponse;
        expect(response.id).toEqual(newRequestId("0"));
        expect(response.error).toEqual("Error: Only teachers can end the room");

        client.onClose();
    });

    it("should not allow a client to produce to many tracks", async () => {
        const client = await setupSingleClient(sfu);
        const dtlsParameters = await createProducerTransport(client, newRequestId("0"));
        await connectProducerTransport(dtlsParameters, client, newRequestId("1"));

        const numNewProducers = 10;
        for (let i = 2; i < 2 + numNewProducers; i++) {
            const rtpParameters = {
                codecs: [{
                    mimeType: "video/VP8",
                    payloadType: 100 + i,
                    clockRate: 90000,
                    parameters: {},
                }],
                encodings: [{
                    ssrc: 100 + i,
                    codecPayloadType: 100 + i,
                    rtx: {
                        ssrc: 200 + i,
                    },
                }],
            };

            await createProducer(client, newRequestId(i.toString()), rtpParameters);
        }

        const waitResponse = responseShouldError(client);

        await client.onMessage({
            id: newRequestId("13"),
            request: {
                produceTrack: {
                    kind: "video",
                    rtpParameters: {
                        codecs: [{
                            mimeType: "video/VP8",
                            payloadType: 100 + 13,
                            clockRate: 90000,
                            parameters: {},
                        }],
                        encodings: [{
                            ssrc: 100 + 13,
                            codecPayloadType: 100 + 13,
                            rtx: {
                                ssrc: 200 + 13,
                            },
                        }],
                    },
                },
            }
        });

        const response = await waitResponse;
        expect(response.id).toEqual(newRequestId("13"));
        expect(response.error).toEqual("Error: Too many producers");

        client.onClose();
    });

    it("Gets the number of producers", async () => {
        const client = await setupSingleClient(sfu);

        expect(client.numProducers).toEqual(0);
        client.onClose();
    });
});
