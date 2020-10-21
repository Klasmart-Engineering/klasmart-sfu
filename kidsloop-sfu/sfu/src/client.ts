import {
    types as MediaSoup
} from "mediasoup";
import {Resolver} from "./resolver";
import {PubSub} from "apollo-server";
import {EventEmitter} from "events";
import {Logger} from "./entry";
import {JWT} from "./auth";

export interface Stream {
    id: string
    sessionId: string
    producers: MediaSoup.Producer[]
}

export class Client {
    public static async create(id: string, router: MediaSoup.Router, listenIps: MediaSoup.TransportListenIp[], closeCallback: () => unknown, jwt: JWT) {
        try {
            const producerTransport = await router.createWebRtcTransport({
                listenIps,
                enableTcp: true,
                enableUdp: true,
                preferUdp: true,
            })
            const consumerTransport = await router.createWebRtcTransport({
                listenIps,
                enableTcp: true,
                enableUdp: true,
                preferUdp: true,
            })
            return new Client(id, router, producerTransport, consumerTransport, closeCallback, jwt)
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
                    rtpCapabilities: JSON.stringify(this.router.rtpCapabilities),
                    producerTransport: transportParams(this.producerTransport),
                    consumerTransport: transportParams(this.consumerTransport),
                }
            })
        })
        return this.channel.asyncIterator([
            "initial",
            "consumer",
            "stream",
            "close",
            "mute"
        ])
    }

    public getStreams() {
        return this.streams.values()
    }

    public async forwardStream(stream: Stream) {
        Logger.info(`forward Stream(${stream.sessionId}_${stream.id})(${stream.producers.length}) to Client(${this.id})`)
        const forwardPromises = stream.producers.map((p) => this.forward(p).catch((e) => Logger.error(e)))
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
        })
    }

    public async forward(producer: MediaSoup.Producer) {
        try {
            Logger.info(`forward rtp caps`)
            const rtpCapabilities = await this.rtpCapabilities()
            const producerParams = {
                producerId: producer.id,
                rtpCapabilities
            }
            Logger.info(`forward can consume`)
            if (!this.router.canConsume(producerParams)) {
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
            consumer.on("transportclose", () => {
                this.consumers.delete(consumer.id)
                this.channel.publish("close", {media: {close: consumer.id}})

            })
            consumer.on("producerclose", () => {
                this.consumers.delete(consumer.id)
                this.channel.publish("close", {media: {close: consumer.id}})
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
            })
        } catch (e) {
            Logger.error(e)
        }
    }

    public async rtpCapabilitiesMessage(message: string) {
        const rtpCapabilities = JSON.parse(message)
        if (this._rtpCapabilities) {
            Logger.error("rtpCapabilities is already set... overiding")
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
        return producer.id
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
            consumer.pause()
        } else {
            consumer.resume()
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

    public async muteMessage(roomId: string, sessionId: string, producerId?: string, consumerId?: string, audio?: boolean, video?: boolean, teacher?: boolean) {
        Logger.info(`muteMessage: ${this}`)
        let consumer
        if (consumerId && sessionId === this.id && teacher) {
            return await this.teacherMute(audio, video, producerId, roomId, sessionId, consumerId);
        }
        if (producerId && sessionId === this.id) {
            return await this.selfMute(producerId, audio, video, roomId, sessionId, consumerId);
        }
        if (producerId && sessionId !== this.id) {
            // Someone else's self mute message
            Logger.info("Sending mute update to other participant")
            consumer = Array.from(this.consumers.values()).find((c) => c.producerId === producerId)
        }
        if ((consumerId || consumer) && sessionId !== this.id) {
            // A teacher's mute message
            Logger.info("Sending teacher mute update to other participant")
            if (!consumer && consumerId) {
                consumer = this.consumers.get(consumerId)
            }
            if (!consumer) {
                Logger.error(`Failed to find consumer with id: ${consumerId}`)
                return false
            }
            Logger.info(`muteMessage: consumer ${consumerId}`)
            switch (consumer.kind) {
                case "audio":
                    Logger.info(`muteMessage: audio`)
                    if (audio) {
                        Logger.info(`muteMessage: resume`)
                        await consumer.resume()
                    } else if (audio === false) {
                        Logger.info(`muteMessage: pause`)
                        await consumer.pause()
                    }
                    break;
                case "video":
                    Logger.info(`muteMessage: video`)
                    if (video) {
                        Logger.info(`muteMessage: resume`)
                        await consumer.resume()
                    } else if (video === false) {
                        Logger.info(`muteMessage: pause`)
                        await consumer.pause()
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
                        sessionId,
                        producerId,
                        consumerId,
                        audio,
                        video
                    }
                }
            })
            return true
        }

        Logger.error(`Failed to find producer or consumer`)
        return false
    }

    private async selfMute(producerId: string | undefined, audio: undefined | boolean, video: undefined | boolean, roomId: string, sessionId: string, consumerId: string | undefined) {
        Logger.info("Self mute")
        let producer
        this.selfAudioMuted = audio !== undefined ? !audio : this.selfAudioMuted
        this.selfVideoMuted = video !== undefined ? !video : this.selfVideoMuted

        if (audio !== undefined && this.teacherAudioMuted) {
            Logger.info("Self is teacherAudioMuted, returning")
            return true
        }
        if (video !== undefined && this.teacherVideoMuted) {
            Logger.info("Self is teacherVideoMuted, returning")
            return true
        }
        // A self mute message
        if (producerId) {
            producer = this.producers.get(producerId)
        }

        if (!producer) {
            Logger.error(`Failed to find producer with id: ${producerId}`)
            return false
        }
        Logger.info(`muteMessage: producer ${producerId}`)
        switch (producer.kind) {
            case "audio":
                Logger.info(`muteMessage: audio`)
                if (audio && !this.teacherAudioMuted) {
                    Logger.info(`muteMessage: resume`)
                    await producer.resume()
                } else if (audio !== undefined && this.selfAudioMuted) {
                    Logger.info(`muteMessage: pause`)
                    await producer.pause()
                }
                break;
            case "video":
                Logger.info(`muteMessage: video`)
                if (video && !this.teacherVideoMuted) {
                    Logger.info(`muteMessage: resume`)
                    await producer.resume()
                } else if (video !== undefined && this.selfVideoMuted) {
                    Logger.info(`muteMessage: pause`)
                    await producer.pause()
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
                    sessionId,
                    producerId,
                    consumerId,
                    audio: audio && !this.teacherAudioMuted && !this.selfAudioMuted,
                    video: video && !this.teacherVideoMuted && !this.selfVideoMuted
                }
            }
        })
        return true
    }

    private async teacherMute(audio: undefined | boolean, video: undefined | boolean, producerId: string | undefined, roomId: string, sessionId: string, consumerId: string) {
        let producer
        Logger.info("Teacher muting producer")
        this.teacherAudioMuted = audio !== undefined ? !audio : this.teacherAudioMuted
        this.teacherVideoMuted = video !== undefined ? !video : this.teacherVideoMuted
        this.selfAudioMuted = audio !== undefined ? true : this.selfAudioMuted
        this.selfVideoMuted = video !== undefined ? true : this.selfVideoMuted
        // A teacher has muted a producer
        if (audio !== undefined) {
            producer = Array.from(this.producers.values()).find((p) => p.kind === "audio")
        } else if (video !== undefined) {
            producer = Array.from(this.producers.values()).find((p) => p.kind === "video")
        }

        if (!producer && producerId) {
            producer = this.producers.get(producerId)
        }
        if (!producer) {
            Logger.error(`Failed to find producer with id: ${producerId}`)
            return false
        }
        Logger.info(`muteMessage: producer ${producerId}`)
        switch (producer.kind) {
            case "audio":
                Logger.info(`muteMessage: audio`)
                if (audio && !this.selfAudioMuted) {
                    Logger.info(`muteMessage: resume`)
                    await producer.resume()
                } else if (audio !== undefined && this.selfAudioMuted) {
                    Logger.info(`muteMessage: pause`)
                    await producer.pause()
                }
                break;
            case "video":
                Logger.info(`muteMessage: video`)
                if (video && !this.selfVideoMuted) {
                    Logger.info(`muteMessage: resume`)
                    await producer.resume()
                } else if (video !== undefined && this.selfVideoMuted) {
                    Logger.info(`muteMessage: pause`)
                    await producer.pause()
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
                    sessionId,
                    producerId,
                    consumerId,
                    audio: audio && !this.selfAudioMuted,
                    video: video && !this.selfVideoMuted
                }
            }
        })
        return true
    }

    public id: string
    public emitter = new EventEmitter()
    private destructors = new Map<string, () => unknown>()
    private streams = new Map<string, Stream>()
    private producers = new Map<string, MediaSoup.Producer>()
    private consumers = new Map<string, MediaSoup.Consumer>()
    private channel = new PubSub()
    private router: MediaSoup.Router
    public producerTransport: MediaSoup.WebRtcTransport
    public consumerTransport: MediaSoup.WebRtcTransport
    private timeout?: NodeJS.Timeout
    private closeCallback: () => unknown
    public jwt: JWT
    public selfAudioMuted: boolean = false
    public selfVideoMuted: boolean = false
    public teacherAudioMuted: boolean = false
    public teacherVideoMuted: boolean = false

    private constructor(
        id: string,
        router: MediaSoup.Router,
        producerTransport: MediaSoup.WebRtcTransport,
        consumerTransport: MediaSoup.WebRtcTransport,
        closeCallback: () => unknown,
        jwt: JWT
    ) {
        this.id = id
        this.router = router

        this.producerTransport = producerTransport
        producerTransport.on("routerclose", () => {
            this.channel.publish("close", {media: {close: producerTransport.id}})
        })
        this.destructors.set(producerTransport.id, () => producerTransport.close())

        this.consumerTransport = consumerTransport
        consumerTransport.on("routerclose", () => {
            this.channel.publish("close", {media: {close: consumerTransport.id}})
        })
        this.destructors.set(consumerTransport.id, () => consumerTransport.close())
        this.jwt = jwt
        this.closeCallback = closeCallback
    }

    private _rtpCapabilities?: MediaSoup.RtpCapabilities
    private rtpCapabilitiesPrePromise = Resolver<MediaSoup.RtpCapabilities>()

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