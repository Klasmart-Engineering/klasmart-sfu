import {
    types as MediaSoup
} from "mediasoup"
import {Resolver} from "./resolver"
import {PubSub} from "apollo-server-express"
import {EventEmitter} from "events"
import {Logger} from "./entry"
import {JWT} from "./auth"

export interface Stream {
    id: string
    sessionId: string
    producers: MediaSoup.Producer[]
}

// noinspection DuplicatedCode
export class Client {
    public id: string
    public emitter = new EventEmitter()
    private destructors = new Map<string, () => unknown>()
    private streams = new Map<string, Stream>()
    private producers = new Map<string, MediaSoup.Producer>()
    private consumers = new Map<string, MediaSoup.Consumer>()
    private channel = new PubSub()
    private producerRouter: MediaSoup.Router
    private consumerRouter: MediaSoup.Router
    public producerTransport: MediaSoup.WebRtcTransport
    public consumerTransport: MediaSoup.WebRtcTransport
    private timeout?: NodeJS.Timeout
    private readonly closeCallback: () => unknown
    public jwt: JWT
    public selfAudioMuted: boolean = false
    public selfVideoMuted: boolean = false
    public teacherAudioMuted: boolean = false
    public teacherVideoDisabled: boolean = false
    private consumerMute: Map<string, boolean>

    private constructor(
        id: string,
        producerRouter: MediaSoup.Router,
        consumerRouter: MediaSoup.Router,
        producerTransport: MediaSoup.WebRtcTransport,
        consumerTransport: MediaSoup.WebRtcTransport,
        closeCallback: () => unknown,
        jwt: JWT
    ) {
        this.id = id
        this.producerRouter = producerRouter
        this.consumerRouter = consumerRouter

        this.producerTransport = producerTransport
        producerTransport.on("routerclose", () => {
            this.channel.publish("close", {media: {close: producerTransport.id}}).catch(e => Logger.error(e))
        })
        this.destructors.set(producerTransport.id, () => producerTransport.close())

        this.consumerTransport = consumerTransport
        consumerTransport.on("routerclose", () => {
            this.channel.publish("close", {media: {close: consumerTransport.id}}).catch(e => Logger.error(e))
        })
        this.destructors.set(consumerTransport.id, () => consumerTransport.close())
        this.jwt = jwt
        this.closeCallback = closeCallback
        this.consumerMute = new Map()
    }

    private _rtpCapabilities?: MediaSoup.RtpCapabilities
    private rtpCapabilitiesPrePromise = Resolver<MediaSoup.RtpCapabilities>()

    public static async create(
        id: string,
        producerRouter: MediaSoup.Router,
        consumerRouter: MediaSoup.Router,
        listenIps: MediaSoup.TransportListenIp[],
        closeCallback: () => unknown,
        jwt: JWT) {
        try {
            const producerTransport = await producerRouter.createWebRtcTransport({
                listenIps,
                enableTcp: true,
                enableUdp: true,
                preferUdp: true,
            })
            const consumerTransport = await consumerRouter.createWebRtcTransport({
                listenIps,
                enableTcp: true,
                enableUdp: true,
                preferUdp: true,
            })
            return new Client(id, producerRouter, consumerRouter, producerTransport, consumerTransport, closeCallback, jwt)
        } catch (e) {
            Logger.error(e)
            throw e
        }
    }

    public connect() {
        if (!this.timeout) {
            return
        }
        clearTimeout(this.timeout)
        this.timeout = undefined
    }

    public disconnect() {
        if (this.timeout) {
            clearTimeout(this.timeout)
        }
        this.timeout = setTimeout(() => {
            Logger.warn(`User(${this.id}) has timed out`)
            this.close()
        }, 1000 * 60)
    }

    public subscribe() {
        setImmediate(() => {
            Logger.info("initial")
            this.channel.publish("initial", {
                media: {
                    rtpCapabilities: JSON.stringify(this.producerRouter.rtpCapabilities),
                    producerTransport: transportParams(this.producerTransport),
                    consumerTransport: transportParams(this.consumerTransport),
                }
            }).catch(e => Logger.error(e))
        })
        return this.channel.asyncIterator([
            "initial",
            "consumer",
            "stream",
            "close",
            "mute",
            "globalMute"
        ])
    }

    public getStreams() {
        return this.streams.values()
    }

    public async forwardStream(stream: Stream, roomId: string) {
        Logger.info(`forward Stream(${stream.sessionId}_${stream.id})(${stream.producers.length}) to Client(${this.id})`)
        const forwardPromises = stream.producers.map((p) => this.forward(p, roomId, stream.sessionId).catch((e) => Logger.error(e)))
        Logger.info(`forward Stream - wait`)
        await Promise.all(forwardPromises)
        const producerIds = stream.producers.map((p) => p.id)
        Logger.info(`Publish Stream(${stream.sessionId}_${stream.id})`, producerIds)
        this.channel.publish("stream", {
            media: {
                stream: {
                    id: stream.id,
                    sessionId: stream.sessionId,
                    producerIds,
                }
            }
        }).catch(e => Logger.error(e))
    }

    public async forward(producer: MediaSoup.Producer, roomId: string, sessionId: string) {
        Logger.info(`forward rtp caps`)
        const rtpCapabilities = await this.rtpCapabilities()
        const producerParams = {
            producerId: producer.id,
            rtpCapabilities
        }
        Logger.info(`forward can consume`)
        if (!this.consumerRouter.canConsume(producerParams)) {
            Logger.error(`Client(${this.id}) could not consume producer(${producer.kind},${producer.id})`, producer.consumableRtpParameters)
            return
        }
        Logger.info(`forward wait consumer`)
        const consumer = await this.consumerTransport.consume({
            ...producerParams,
            paused: true
        })
        this.destructors.set(consumer.id, () => consumer.close())
        this.consumers.set(consumer.id, consumer)
        this.consumerMute.set(consumer.id, false)
        consumer.on("transportclose", () => {
            this.consumers.delete(consumer.id)
            this.channel.publish("close", {media: {close: consumer.id}})

        })
        consumer.on("producerclose", () => {
            this.consumers.delete(consumer.id)
            this.channel.publish("close", {media: {close: consumer.id}})
        })
        consumer.on("producerpause", () => {
            consumer.pause()
            this.channel.publish("mute", {
                media: {
                    mute: {
                        roomId,
                        sessionId,
                        producerId: producer.id,
                        consumerId: consumer.id,
                        audio: consumer.kind === "audio" ? false : undefined,
                        video: consumer.kind === "video" ? false : undefined,
                    }
                }
            })
        })
        consumer.on("producerresume", () => {
            if (this.consumerMute.get(consumer.id)) {
                return
            }
            consumer.resume()
            this.channel.publish("mute", {
                media: {
                    mute: {
                        roomId,
                        sessionId,
                        producerId: producer.id,
                        consumerId: consumer.id,
                        audio: consumer.kind === "audio" ? true : undefined,
                        video: consumer.kind === "video" ? true : undefined,
                    }
                }
            })
        })

        this.channel.publish("consumer", {
            media: {
                consumer: JSON.stringify({
                    id: consumer.id,
                    producerId: consumer.producerId,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                    appData: undefined
                })
            }
        }).catch(e => Logger.error(e))
    }

    public async rtpCapabilitiesMessage(message: string) {
        const rtpCapabilities = JSON.parse(message)
        if (this._rtpCapabilities) {
            Logger.warn("rtpCapabilities is already set... overriding")
        }
        const {resolver} = await this.rtpCapabilitiesPrePromise
        this._rtpCapabilities = rtpCapabilities
        Logger.info(`rtpCapabilities initialized`)
        resolver(rtpCapabilities)
        return true
    }

    public async transportMessage(producer: boolean, message: string) {
        Logger.info("transport")
        const params = JSON.parse(message)
        if (producer) {
            await this.producerTransport.connect(params)
        } else {
            await this.consumerTransport.connect(params)
        }
        return true
    }

    public async producerMessage(paramsMessage: string) {
        Logger.info("producer message")
        const params = JSON.parse(paramsMessage)
        const producer = await this.producerTransport.produce(params)
        this.destructors.set(producer.id, () => producer.close())
        producer.on("transportclose", () => {
            this.producers.delete(producer.id)
            this.channel.publish("close", {media: {close: producer.id}})
        })
        this.producers.set(producer.id, producer)
        Logger.info("producer message - ret")
        return producer
    }

    public consumerMessage(id: string, pause?: boolean) {
        Logger.info("consumer message")
        if (pause === undefined) {
            return
        }
        const consumer = this.consumers.get(id)
        if (!consumer) {
            Logger.error(`Unable to pause missing Consumer(${id})`);
            return;
        }
        if (pause) {
            consumer.pause().catch(e => Logger.error(e))
        } else {
            consumer.resume().catch(e => Logger.error(e))
        }
        return true
    }

    public streamMessage(id: string, producerIds: string[]) {
        Logger.info(`StreamMessage(${id}) to Client(${this.id}) contains ${producerIds.map((id) => `Producer(${id})`).join(" ")}`)
        const producers = []
        for (const producerId of producerIds) {
            const producer = this.producers.get(producerId)
            if (!producer) {
                Logger.error(`Client(${this.id}).Stream(${id}) could not locate Producer(${producerId})`)
                continue
            }
            producers.push(producer)
        }
        const stream = {
            id,
            sessionId: this.id,
            producers
        }
        this.streams.set(id, stream)
        Logger.info(`Emit Stream(${this.id}_${id})(${producers.length})`)
        this.emitter.emit("stream", stream)
        return true
    }

    public async closeMessage(id: string) {
        const destructor = this.destructors.get(id)
        if (!destructor) {
            Logger.error(`Client(${this.id}).Destructor(${id}) could not be found`);
            return;
        }
        destructor()
        return true
    }

    public async endClassMessage(roomId?: string) {
        this.close()
        return true
    }

    public async selfMute(roomId: string, audio?:boolean, video?:boolean): Promise<boolean> {
        const producer = this.getProducer(audio, video);
        Logger.debug(`selfMute: muting producer ${producer.id}`)
        switch (producer.kind) {
            case "audio":
                this.selfAudioMuted = audio !== undefined ? !audio : this.selfAudioMuted
                if (this.selfAudioMuted) {
                    await producer.pause()
                } else {
                    await producer.resume()
                }
                break;
            case "video":
                this.selfVideoMuted = video !== undefined ? !video: this.selfVideoMuted
                if (this.selfVideoMuted) {
                    await producer.pause()
                } else{
                    await producer.resume()
                }
                break;
            default:
                Logger.debug(`muteMessage: default`)
                break;
        }

        await this.channel.publish("mute", {
            media: {
                mute: {
                    roomId,
                    sessionId: this.id,
                    audio,
                    video,
                }
            }
        })
        return true
    }

    public async teacherMute(roomId: string, audio?: boolean, video?: boolean): Promise<boolean> {
        const producer = this.getProducer(audio, video);
        Logger.debug(`teacherMute: muting producer: ${producer.id}`)
        switch (producer.kind) {
            case "audio":
                this.teacherAudioMuted = audio !== undefined ? !audio : this.teacherAudioMuted
                if (this.teacherAudioMuted) {
                    await producer.pause()
                } else {
                    await producer.resume()
                }
                break;
            case "video":
                this.teacherVideoDisabled = video !== undefined ? !video : this.teacherVideoDisabled
                if (this.teacherVideoDisabled) {
                    await producer.pause()
                } else {
                    await producer.resume()
                }
                break;
            default:
                Logger.info(`muteMessage: default`)
                break;
        }

        await this.channel.publish("mute", {
            media: {
                mute: {
                    roomId,
                    sessionId: this.id,
                    audio,
                    video,
                }
            }
        })
        return true
    }

    public getProducer(audio?: boolean, video?: boolean): MediaSoup.Producer {
        let producer: MediaSoup.Producer | undefined;
        if (audio !== undefined) {
            producer = Array.from(this.producers.values()).find((p) => p.kind === "audio");
        } else if (video !== undefined) {
            producer = Array.from(this.producers.values()).find((p) => p.kind === "video");
        }
        if (!producer) {
            throw new Error("getProducer: no producerId found");
        }
        return producer;
    }

    public async publishGlobalMuteState(roomId: string, audioGloballyMuted?: boolean, videoGloballyDisabled?: boolean): Promise<void> {
        await this.channel.publish("globalMute", {
            media: {
                globalMute: {
                    roomId,
                    audioGloballyMuted,
                    videoGloballyDisabled,
                }
            }
        })
    }

    private async rtpCapabilities() {
        if (this._rtpCapabilities) {
            return this._rtpCapabilities
        }
        const {promise} = await this.rtpCapabilitiesPrePromise
        return promise
    }

    private close() {
        Logger.info(`Client(${this.id}) cleanup`)
        this.closeCallback()
        for (const destructor of this.destructors.values()) {
            destructor()
        }
    }
}

function transportParams(transport: MediaSoup.WebRtcTransport) {
    return JSON.stringify({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
    })
}