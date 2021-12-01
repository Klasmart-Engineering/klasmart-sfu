import {SFU} from "../sfu";
import {setupSfu, setupSingleClient, TestWssServer} from "./utils";
import {Data, WebSocket} from "ws";
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
        const randomMessage = "random-data";

        const wait = new Promise((resolve) => {
            async function responseHandler(data: Data) {
                resolve(JSON.parse(data.toString()));
            }

            client.on("message", responseHandler);
        });

        client.send(randomMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${randomMessage}`
            });

        client.close();
    });

    it("should throw on an unknown message", async () => {
        const client = await setupSingleClient(wss, sfu);

        const randomMessage = JSON.stringify({
            randomData: "random-data"
        });

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        client.send(randomMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${randomMessage}`
            });

        client.close();
    });

    it("should handle an rtpCapabilities message", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const rtpCapabilities: MediaSoup.RtpCapabilities = {
            codecs: mediaCodecs,
            headerExtensions: []
        };

        client.send(JSON.stringify({
            rtpCapabilities: rtpCapabilities
        }));

        await expect(wait).resolves.toEqual(true);
        client.close();
    });

    it("should handle a createProducerTransport message", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(JSON.parse(data.toString()));
        });

        const producerTransportMessage = {
            producerTransport: "yes"
        };

        client.send(JSON.stringify(producerTransportMessage));

        await expect(wait).resolves.toMatchObject({
            producerTransport: {}
        });
        client.close();
    });

    it("should throw when trying to connect to a producer transport prior to creating a producer transport", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const producerTransportConnectMessage = JSON.stringify({
            producerTransportConnect: {dtlsParameters: {}}
        });

        client.send(producerTransportConnectMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${producerTransportConnectMessage}`
            });

        client.close();
    });

    it("should handle a createConsumerTransport message", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(JSON.parse(data.toString()));
        });

        const consumerTransportMessage = {
            consumerTransport: "yes"
        };

        client.send(JSON.stringify(consumerTransportMessage));

        await expect(wait).resolves.toMatchObject({
            consumerTransport: {}
        });
        client.close();
    });

    it("should throw when trying to connect to a consumer transport prior to creating a consumer transport", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const consumerTransportConnectMessage = JSON.stringify({
            consumerTransportConnect: {dtlsParameters: {}}
        });

        client.send(consumerTransportConnectMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${consumerTransportConnectMessage}`
            });

        client.close();
    });

    it("should throw when trying to create a track prior to creating a producer transport", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

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

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${createTrackMessage}`
            });

        client.close();
    });

    it("should throw when trying to create a consumer prior to exchanging rtpCapabilities", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const createConsumerMessage = JSON.stringify({
            createConsumer: {
                producerId: "producer-id"
            }
        });

        client.send(createConsumerMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${createConsumerMessage}`
            });

        client.close();
    });

    it("should throw when trying to locally pause a track that doesn't exist", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const locallyPauseMessage = JSON.stringify({
            locallyPause: {
                paused: true,
                trackId: "track-id"
            }
        });

        client.send(locallyPauseMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${locallyPauseMessage}`
            });

        client.close();
    });

    it("should throw when trying to globally pause a track and the client is not a teacher", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const globallyPauseMessage = JSON.stringify({
            globallyPause: {
                paused: true,
                trackId: "track-id"
            }
        });

        client.send(globallyPauseMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${globallyPauseMessage}`
            });

        client.close();
    });

    it("should throw when trying to globally pause a track that doesn't exist", async () => {
        const client = await setupSingleClient(wss, sfu, true);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const globallyPauseMessage = JSON.stringify({
            globallyPause: {
                paused: true,
                trackId: "track-id"
            }
        });

        client.send(globallyPauseMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${globallyPauseMessage}`
            });

        client.close();
    });

    it("should throw when trying to end a room and the client is not a teacher", async () => {
        const client = await setupSingleClient(wss, sfu);

        const wait = waitForResponse(client, (data) => {
            return JSON.parse(data.toString());
        });

        const endMessage = JSON.stringify({
            end: true
        });

        client.send(endMessage);

        await expect(wait).resolves.toEqual(
            {
                type: "error",
                message: `Error handling message: ${endMessage}`
            });

        client.close();
    });
});

async function waitForResponse(client: WebSocket, func: (data: Data) => unknown) {
    return new Promise((resolve) => {
        async function waitFor(data: Data) {
            resolve(func(data));
        }

        client.on("message", waitFor);
    });
}
