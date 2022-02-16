import {createWorker, types as MediaSoup} from "mediasoup";
import {SFU, SfuId} from "../sfu";
import {newRoomId, RoomId} from "../room";
import {Consumer} from "../consumer";
import {mediaCodecs} from "../../config";
import {SfuRegistrar, SfuStatus, TrackInfo, TrackRegistrar} from "../registrar";
import {newProducerId, ProducerId} from "../track";
import {RtpCapabilities, RtpParameters} from "mediasoup/node/lib/RtpParameters";
import {Response, ClientV2, Result, Request, RequestId, RequestMessage, PauseRequest} from "../client";
import {DtlsParameters} from "mediasoup/node/lib/WebRtcTransport";
import {nanoid} from "nanoid";

export async function setupSfu() {
    const worker = await createWorker({
        logLevel: "warn",
        rtcMinPort: 10000,
        rtcMaxPort: 59999,
    });

    const announcedIp = "127.0.0.1";

    return new SFU(worker, [{ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0", announcedIp }], "endpoint", MockRegistrar());
}

export async function setupSingleClient(sfu: SFU, isTeacher = false) {
    const roomId = newRoomId("test-room");
    return await sfu.createClient("user-id", roomId, isTeacher);
}

export class MockTransport {
    private producer?: MockProducer;
    private consumer?: MockConsumer;
    public async produce(params: MediaSoup.ProducerOptions) {
        const { producer, trigger } = createMockProducer(params.id);
        this.producer = trigger;
        return producer;
    }

    public async consume(params: MediaSoup.ConsumerOptions) {
        const { consumer, trigger } = createMockConsumer(params.producerId);
        this.consumer = trigger;
        return consumer;
    }

    public triggerProducer(event: string) {
        return this.producer?.trigger(event);
    }

    public triggerConsumer(event: string) {
        return this.consumer?.trigger(event);
    }

    public setProducerPaused(paused: boolean) {
        if (!this.consumer) {
            return;
        }
        this.consumer.producerPaused = paused;
    }
}

export function createMockTransport() {
    const mockTransport = new MockTransport();
    return mockTransport as unknown as MediaSoup.WebRtcTransport;
}

class MockProducer {
    public paused = true;
    public closed = false;
    private eventHandlers = new Map<string, () => unknown>();
    private readonly _id?: string;

    public constructor(id?: string) {
        if (id) {
            this._id = id;
        }
        else {
            this._id = newProducerId(nanoid());
        }
    }

    public get id() {
        return this._id;
    }

    public async resume() {
        this.paused = false;
    }

    public async pause() {
        this.paused = true;
    }

    public close() {
        this.closed = true;
    }

    public on(event: string, callback: () => unknown) {
        this.eventHandlers.set(event, callback);
    }

    public trigger(event: string) {
        console.log(JSON.stringify(this));
        const handler = this.eventHandlers.get(event);
        if (!handler) {
            throw new Error(`No handler for event ${event}`);
        }
        return handler();
    }
}

export function createMockProducer(id?: string) {
    const mockProducer = new MockProducer(id);
    return {producer: mockProducer as unknown as MediaSoup.Producer,
        trigger: mockProducer};
}

export class MockConsumer {
    public producerPaused = true;
    public paused = true;
    public closed = false;
    private eventHandlers = new Map<string, () => unknown>();
    public kind = "audio";
    public rtpParameters = {codecs: mediaCodecs};
    public producerId: string;

    public constructor(private readonly _id: string) {
        this.producerId = _id;
    }

    public get id() {
        return this._id;
    }

    public async resume() {
        this.paused = false;
    }

    public async pause() {
        this.paused = true;
    }

    public close() {
        this.closed = true;
    }

    public on(event: string, callback: () => unknown) {
        this.eventHandlers.set(event, callback);
    }

    public trigger(event: string) {
        const handler = this.eventHandlers.get(event);
        if (!handler) {
            throw new Error(`No handler for event ${event}`);
        }
        return handler();
    }
}

function createMockConsumer(id: string) {
    const mockConsumer = new MockConsumer(id);
    return {consumer: mockConsumer as unknown as MediaSoup.Consumer,
        trigger: mockConsumer};
}

export async function setupMockConsumer(transport?: MediaSoup.WebRtcTransport) {
    if (!transport) transport = createMockTransport();
    const producerId = newProducerId(nanoid());
    const rtpCapabilities = {codecs: mediaCodecs};
    return Consumer.create(transport, producerId, rtpCapabilities);
}

export class MockRouter {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public constructor() {
    }

    public canConsume(properties: unknown) {
        return !!properties;
    }

    public close() {
        return;
    }
}

export const rtpParameters: RtpParameters = {
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

export const rtpCapabilities: RtpCapabilities = {
    codecs: [{
        mimeType: "video/VP8",
        kind: "video",
        clockRate: 90000,
        channels: 1,
        parameters: {},
    }],
    headerExtensions: [],
};

export function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

export function shouldError(response: Response) {
    expect(response).toBeDefined();
    expect(response).toHaveProperty("error");
    expect(response).not.toHaveProperty("result");
    return response as unknown as {id: string, error: string};
}

export function shouldNotError(response: Response) {
    expect(response).toBeDefined();
    expect(response).not.toHaveProperty("error");
    expect(response).toHaveProperty("result");
    return response as unknown as { id: string, result: Result };
}

export function responseShouldNotError(client: ClientV2): Promise<{id: string, result: Result}>{
    return new Promise( (resolve, reject) => {
        client.once("response", (response: Response) => {
            try {
                resolve(shouldNotError(response));
            } catch (error) {
                reject(error);
            }
        });
    });
}

export function responseShouldError(client: ClientV2): Promise<{id: string, error: string}> {
    return new Promise( (resolve, reject) => {
        client.once("response", (response: Response) => {
            try {
                resolve(shouldError(response));
            } catch (error) {
                reject(error);
            }
        });
    });
}

export async function createProducerTransport(client: ClientV2, id: RequestId) {
    {
        const request: Request = {
            createProducerTransport: {}
        };
        const waitResponse = responseShouldNotError(client);
        await client.onMessage({
            id,
            request
        });
        const response = await waitResponse;
        if (!response.result.producerTransportCreated) {
            throw new Error("Expected a producer transport to be created");
        }
        return response.result.producerTransportCreated.dtlsParameters;
    }
}

export async function connectProducerTransport(dtlsParameters: DtlsParameters, client: ClientV2, id: RequestId) {
    const request = {
        connectProducerTransport: {
            dtlsParameters
        }
    };

    const waitResponse = responseShouldNotError(client);
    await client.onMessage({
        id,
        request
    });
    await expect(waitResponse).resolves.toEqual({id, result: undefined});
}

export async function createConsumerTransport(client: ClientV2, id: RequestId) {
    {
        const request: Request = {
            createConsumerTransport: {}
        };
        const waitResponse = responseShouldNotError(client);
        await client.onMessage({
            id,
            request
        });
        const response = await waitResponse;
        if (!response.result.consumerTransportCreated) {
            throw new Error("Expected a producer transport to be created");
        }
        return response.result.consumerTransportCreated.dtlsParameters;
    }
}

export async function connectConsumerTransport(dtlsParameters: DtlsParameters, client: ClientV2, id: RequestId) {
    const request = {
        connectConsumerTransport: {
            dtlsParameters
        }
    };

    const waitResponse = responseShouldNotError(client);
    await client.onMessage({
        id,
        request
    });
    const response = await waitResponse;
    expect(response.id).toEqual(id);
    expect(response.result).toBeUndefined();
}

export async function createProducer(client: ClientV2, id: RequestId, rtpParameters: RtpParameters) {
    const waitResponse = responseShouldNotError(client);
    await client.onMessage({
        id,
        request: {
            produceTrack: {
                kind: "video",
                rtpParameters,
            }
        }
    });
    const response = await waitResponse;
    expect(response.id).toEqual(id);
    expect(response.result).toHaveProperty("producerCreated");
    if (!response.result.producerCreated) {
        throw new Error("Producer not created");
    }
    return response.result.producerCreated;
}

export async function setRtpCapabilities(consumeClient: ClientV2, id: RequestId) {
    const waitResponse = responseShouldNotError(consumeClient);
    await consumeClient.onMessage({
        id,
        request: {
            setRtpCapabilities: {
                codecs: rtpCapabilities.codecs
            }
        }
    });
    const response = await waitResponse;
    expect(response.id).toEqual(id);
    expect(response.result).toBeUndefined();
}

export async function consumeTrack(consumeClient: ClientV2, producerId: ProducerId, id: RequestId) {
    const waitResponse = responseShouldNotError(consumeClient);
    await consumeClient.onMessage({
        id,
        request: {
            consumeTrack: {
                producerId,
            }
        }
    });
    const response = await waitResponse;
    expect(response.id).toEqual(id);
    expect(response.result).toHaveProperty("consumerCreated");
}

export async function pauseTrack(client: ClientV2, producerId: ProducerId, paused: boolean, id: RequestId) {
    const waitResponse = responseShouldNotError(client);
    await client.onMessage({
        id,
        request: {
            pause: {
                id: producerId,
                paused
            }
        }
    });

    const response = await waitResponse;
    expect(response.id).toEqual(id);
    expect(response.result).toBeUndefined();
}

export async function pauseTrackForEveryone(client: ClientV2, producerId: ProducerId, paused: boolean, id: RequestId) {
    const waitResponse = responseShouldNotError(client);
    const pauseRequest: PauseRequest = {
        id: producerId,
        paused
    };
    const request: Request = {
        pauseForEveryone: pauseRequest
    };
    const requestMessage: RequestMessage = {
        id,
        request
    };
    await client.onMessage(requestMessage);

    const response = await waitResponse;
    expect(response.id).toEqual(id);
    expect(response.result).toBeUndefined();
}

export const MockRegistrar = () => {
    const sfuIds = new Set<SfuId>();
    const statuses = new Map<SfuId, SfuStatus>();
    const tracks = new Map<RoomId, Map<ProducerId, TrackInfo>>();
    const trackMap = (roomId: RoomId) => {
        let map = tracks.get(roomId);
        if(!map) {
            map = new Map<ProducerId, TrackInfo>();
            tracks.set(roomId, map);
        }
        return map;
    };

    /* eslint-disable @typescript-eslint/no-empty-function */
    return {
        addSfuId: async (sfuId: SfuId) => { sfuIds.add(sfuId); },
        setSfuStatus: async (sfuId: SfuId, status: SfuStatus) => { statuses.set(sfuId, status); },
        addTrack: async (roomId: RoomId, track: TrackInfo) => { trackMap(roomId).set(track.producerId, track);} ,
        removeTrack: async (roomId: RoomId, id: ProducerId) => { trackMap(roomId).delete(id); },
    } as SfuRegistrar & TrackRegistrar;
    /* eslint-enable @typescript-eslint/no-empty-function */
};
