import {SFU} from "../sfu";
import {setupSfu, setupSingleClient, TestWssServer, WebSocketMessageGenerator} from "./utils";
import {types as MediaSoup} from "mediasoup";
import {mediaCodecs} from "../../config";

let sfu: SFU;
let wss: TestWssServer;

describe("client", () => {
    beforeEach(async () => {
        sfu = await setupSfu();
        wss = new TestWssServer(8081);
    });
    afterEach(() => {
        sfu.shutdown();
        wss.close();
    });

    it("should throw on an malformed message", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const randomMessage = "random-data";

        client.send(randomMessage);

        const response = await messageGenerator.nextMessage();

        await expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${randomMessage}`
            });

        client.close();
    });

    it("should throw on an unknown message", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const randomMessage = JSON.stringify({
            randomData: "random-data"
        });

        client.send(randomMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${randomMessage}`
            });

        client.close();
    });

    it("should handle an rtpCapabilities message", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const rtpCapabilities: MediaSoup.RtpCapabilities = {
            codecs: mediaCodecs,
            headerExtensions: []
        };

        client.send(JSON.stringify({
            rtpCapabilities: rtpCapabilities
        }));

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(true);
        client.close();
    });

    it("should handle a createProducerTransport message", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const producerTransportMessage = {
            producerTransport: "yes"
        };

        client.send(JSON.stringify(producerTransportMessage));

        const response = await messageGenerator.nextMessage();

        expect(response).toMatchObject({
            producerTransport: {}
        });
        client.close();
    });

    it("should throw when trying to connect to a producer transport prior to creating a producer transport", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const producerTransportConnectMessage = JSON.stringify({
            producerTransportConnect: {dtlsParameters: {}}
        });

        client.send(producerTransportConnectMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${producerTransportConnectMessage}`
            });

        client.close();
    });

    it("should handle a createConsumerTransport message", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const consumerTransportMessage = {
            consumerTransport: "yes"
        };

        client.send(JSON.stringify(consumerTransportMessage));

        const response = await messageGenerator.nextMessage();

        expect(response).toMatchObject({
            consumerTransport: {}
        });
        client.close();
    });

    it("should throw when trying to connect to a consumer transport prior to creating a consumer transport", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const consumerTransportConnectMessage = JSON.stringify({
            consumerTransportConnect: {dtlsParameters: {}}
        });

        client.send(consumerTransportConnectMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${consumerTransportConnectMessage}`
            });

        client.close();
    });

    it("should throw when trying to create a track prior to creating a producer transport", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const createTrackMessage = JSON.stringify({
            createTrack: {
                kind: "audio",
                rtpParameters: {
                    codecs: [{
                        mimeType: "audio/opus",
                        clockRate: 48000,
                        channels: 2
                    }]
                }
            }
        });

        client.send(createTrackMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${createTrackMessage}`
            });

        client.close();
    });

    it("should throw when trying to create a consumer prior to exchanging rtpCapabilities", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const createConsumerMessage = JSON.stringify({
            createConsumer: {
                producerId: "producer-id"
            }
        });

        client.send(createConsumerMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${createConsumerMessage}`
            });

        client.close();
    });

    it("should throw when trying to locally pause a track that doesn't exist", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const locallyPauseMessage = JSON.stringify({
            locallyPause: {
                paused: true,
                trackId: "track-id"
            }
        });

        client.send(locallyPauseMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${locallyPauseMessage}`
            });

        client.close();
    });

    it("should throw when trying to globally pause a track and the client is not a teacher", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const globallyPauseMessage = JSON.stringify({
            globallyPause: {
                paused: true,
                trackId: "track-id"
            }
        });

        client.send(globallyPauseMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${globallyPauseMessage}`
            });

        client.close();
    });

    it("should throw when trying to globally pause a track that doesn't exist", async () => {
        const client = await setupSingleClient(wss, sfu, true);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const globallyPauseMessage = JSON.stringify({
            globallyPause: {
                paused: true,
                trackId: "track-id"
            }
        });

        client.send(globallyPauseMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${globallyPauseMessage}`
            });

        client.close();
    });

    it("should throw when trying to end a room and the client is not a teacher", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        const endMessage = JSON.stringify({
            end: true
        });

        client.send(endMessage);

        const response = await messageGenerator.nextMessage();

        expect(response).toEqual(
            {
                type: "error",
                message: `Error handling message: ${endMessage}`
            });

        client.close();
    });

    it("should handle a connectProducerTransport message", async () => {
        const client = await setupSingleClient(wss, sfu);
        const messageGenerator = new WebSocketMessageGenerator(client);

        client.send(JSON.stringify({
            createProducerTransport: "yes"
        }));

        const data = await messageGenerator.nextMessage();

        if (!data) {
            expect(data).toBeDefined();
            return;
        }

        // TODO: Finish this test

        client.close();
    });
});
