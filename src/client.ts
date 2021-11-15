import {
    types as MediaSoup
} from "mediasoup"
import {Resolver} from "./resolver"
import {PubSub} from "apollo-server-express"
import {EventEmitter} from "events"
import {Logger} from "./entry"
import {JWT} from "./auth"
import { MuteNotification } from "./interfaces"
import { Consumer } from "mediasoup/lib/Consumer"
import newrelic from 'newrelic'

export interface Stream {
    id: string
    sessionId: string
    producers: MediaSoup.Producer[]
}

// noinspection DuplicatedCode
export class Client {
    public emitter = new EventEmitter()
    private destructors = new Map<string, () => unknown>()
    private streams = new Map<string, Stream>()
    private producers = new Map<string, MediaSoup.Producer>()
    private consumers = new Map<string, MediaSoup.Consumer>()
    private channel = new PubSub()
    private timeout?: NodeJS.Timeout
    public selfAudioMuted: boolean = false
    public selfVideoMuted: boolean = false
    public teacherAudioMuted: boolean = false
    public teacherVideoDisabled: boolean = false
    private consumerMute = new Map<string, boolean>()

    private constructor(
        public readonly id: string,
        private readonly producerRouter: MediaSoup.Router,
        private readonly consumerRouter: MediaSoup.Router,
        public readonly producerTransport: MediaSoup.WebRtcTransport,
        public readonly consumerTransport: MediaSoup.WebRtcTransport,
        public readonly audioLevelObserver: MediaSoup.AudioLevelObserver,
        private readonly closeCallback: () => unknown,
        public readonly roomId: string,
        public readonly teacher: boolean,
    ) {
        this.producerTransport.on("routerclose", () => {
            this.channel.publish("close", {media: {close: producerTransport.id}}).catch(e => Logger.error(e))
        })
        this.destructors.set(producerTransport.id, () => producerTransport.close())

        this.consumerTransport.on("routerclose", () => {
            this.channel.publish("close", {media: {close: consumerTransport.id}}).catch(e => Logger.error(e))
        })
        this.destructors.set(consumerTransport.id, () => consumerTransport.close())
    }

    private _rtpCapabilities?: MediaSoup.RtpCapabilities
    private rtpCapabilitiesPrePromise = Resolver<MediaSoup.RtpCapabilities>()

    public static async create(
        id: string,
        producerRouter: MediaSoup.Router,
        consumerRouter: MediaSoup.Router,
        audioLevelObserver: MediaSoup.AudioLevelObserver,
        listenIps: MediaSoup.TransportListenIp[],
        closeCallback: () => unknown,
        jwt: JWT) {
        try {
            if(!jwt.roomid) { throw new Error("No room id") }
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
            return new Client(
                id,
                producerRouter,
                consumerRouter,
                producerTransport,
                consumerTransport,
                audioLevelObserver,
                closeCallback,
                jwt.roomid,
                jwt.teacher,
            )
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
        ])
    }

    public getStreams() {
        return this.streams.values()
    }

    public static async forwardStream(stream: Stream, source: Client, destination: Client) {
        if(source.roomId !== destination.roomId) {
            const errorMessage = `Attempt to forward Stream(${stream.id}) from Client(${source.id}) in Room(${source.roomId}) to Client(${destination.id}) in Room(${destination.roomId})`
            Logger.crit(errorMessage)
            throw new Error(errorMessage)
        }


        const {id, sessionId, producers} = stream
        Logger.info(`forward Stream(${sessionId}_${id})(${producers.length}) from Client(${source.id}) to Client(${destination.id})`)

        const producerIds: string[] = []
        const promises = producers.map(async (producer) => {
            producerIds.push(producer.id)
            const priority = source.producerIdBasePriority.get(producer.id)||1
            const consumerSet = source.producerIdToConsumers.get(producer.id)
            await destination.consume(producer, source.roomId, sessionId, consumerSet, priority)
            if(!consumerSet) {
                let errorMessage = `Unable to find producer to consumer mapping from Producer(${producer.id})`
                Logger.crit(errorMessage)
            }
        })
        await Promise.allSettled(promises)

        Logger.info(`Publish Stream(${sessionId}_${id})`, producerIds)
        destination.channel.publish("stream", {
            media: {
                stream: {
                    id,
                    sessionId,
                    producerIds,
                }
            }
        }).catch(e => Logger.error(e))
    }

    public async consume(producer: MediaSoup.Producer, roomId: string, sessionId: string, consumerSet?: Set<Consumer>, priority=1) {
        try {
            Logger.info(`forward rtp caps`)
            const rtpCapabilities = await this.rtpCapabilities()
            const producerParams = {
                producerId: producer.id,
                rtpCapabilities
            }

            Logger.info(`forward can consume`)
            if (!this.consumerRouter.canConsume(producerParams)) {
                throw new Error(`Client(${this.id}) could not consume Producer(${producer.kind},${producer.id}), capabilities: ${producer.consumableRtpParameters}`)
            }

            Logger.info(`forward wait consumer`)
            const consumer = await this.consumerTransport.consume({
                ...producerParams,
                paused: true
            })
            consumerSet?.add(consumer)
            this.destructors.set(consumer.id, () => consumer.close())
            this.consumers.set(consumer.id, consumer)
            this.consumerMute.set(consumer.id, false)

            consumer.on("transportclose", () => {
                consumerSet?.delete(consumer)
                this.consumers.delete(consumer.id)
                this.consumerMute.delete(consumer.id)
                this.channel.publish("close", {media: {close: consumer.id}})
            })
            consumer.on("producerclose", () => {
                consumerSet?.delete(consumer)
                this.consumers.delete(consumer.id)
                this.consumerMute.delete(consumer.id)
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
            await consumer.setPriority(priority)

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
            return consumer
        } catch(e) {
            Logger.error(e)
            throw e
        }
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

    // TODO: Refactor this to remove these maps, there is a better way :(
    private producerIdToConsumers = new Map<string, Set<Consumer>>()
    private producerIdBasePriority = new Map<string, number>()
    public async producerMessage(paramsMessage: string) {
        Logger.info("producer message")
        const params = JSON.parse(paramsMessage)
        const producer = await this.producerTransport.produce(params)

        const basePriority = (this.teacher ? 128 : 0) + (producer.kind === "audio" ? 64 : 0)
        const producerId = producer.id
        this.producers.set(producerId, producer)
        this.producerIdBasePriority.set(producerId, basePriority)
        this.producerIdToConsumers.set(producerId, new Set<Consumer>())
        this.destructors.set(producerId, () => producer.close())


        producer.observer.on("close", () => {
            this.producers.delete(producerId)
            this.producerIdBasePriority.delete(producerId)
            this.producerIdToConsumers.delete(producerId)
        })
        producer.on("transportclose", () => {
            this.producers.delete(producerId)
            this.producerIdBasePriority.delete(producerId)
            this.producerIdToConsumers.delete(producerId)
            this.channel.publish("close", {media: {close: producerId}})
        })
        if(producer.kind === "audio") {
            this.audioLevelObserver
                .addProducer({producerId})
                .catch((e) => Logger.error(e))
        }
        Logger.info("producer message - ret")
        return producer
    }

    public async setConsumerPriority(producerId: string, priority: number) {
        const consumers = this.producerIdToConsumers.get(producerId)
        if(!consumers) { return }
        const promises: Promise<any>[] = []
        const basePriority = this.producerIdBasePriority.get(producerId) || 0
        const newPriority = basePriority + Math.floor(63 * priority)
        for(const consumer of consumers) {
            const promise = consumer.setPriority(newPriority).catch((e) => Logger.error(e))
            promises.push(promise)
        }
        await Promise.allSettled(promises)
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

    private videoProducersByAssociatedAudioStreamId = new Map<string, MediaSoup.Producer[]>()
    public streamMessage(id: string, producerIds: string[]) {
        Logger.info(`StreamMessage(${id}) to Client(${this.id}) contains ${producerIds.map((id) => `Producer(${id})`).join(" ")}`)

        const producers: MediaSoup.Producer[] = []
        const videoProducers: MediaSoup.Producer[] = []
        const audioProducers: MediaSoup.Producer[] = []

        for (const producerId of producerIds) {
            const producer = this.producers.get(producerId)
            if (!producer) {
                Logger.error(`Client(${this.id}).Stream(${id}) could not locate Producer(${producerId})`)
                continue
            }
            producers.push(producer)
            const likeTypeProducers = (producer.kind === "audio" ? audioProducers : videoProducers)
            likeTypeProducers.push(producer)
        }

        for(const { id } of audioProducers) {
            this.videoProducersByAssociatedAudioStreamId.set(id, videoProducers)
        }

        const stream: Stream = {
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
        console.log('Room: ', roomId, ' has been closed');
        this.close()
        return true
    }

    public async selfMute(roomId: string, audio?:boolean, video?:boolean): Promise<MuteNotification> {
        return newrelic.startWebTransaction('selfMute', async () => {
            newrelic.addCustomAttribute('roomId', roomId)
            if (audio) newrelic.addCustomAttribute('audio', audio)
            if (video) newrelic.addCustomAttribute('video', video)
            const producer = this.getProducer(audio, video);
            if (!producer) {
                return {
                    roomId,
                    sessionId: this.id,
                    audio: undefined,
                    video: undefined,
                };
            }
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
                    this.selfVideoMuted = video !== undefined ? !video : this.selfVideoMuted
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

            const notification: MuteNotification =  {
                roomId,
                sessionId: this.id,
                audio,
                video,
            }

            await this.channel.publish("mute", {
                media: {
                    mute: notification
                }
            })
            return notification;
        })
    }

    public async teacherMute(roomId: string, audio?: boolean, video?: boolean): Promise<MuteNotification> {
        return newrelic.startWebTransaction('teacherMute', async () => {
            const producer = this.getProducer(audio, video);
            newrelic.addCustomAttribute('roomId', roomId)
            if (audio) newrelic.addCustomAttribute('audio', audio)
            if (video) newrelic.addCustomAttribute('video', video)
            if (!producer) {
                return {
                    roomId,
                    sessionId: this.id,
                    audio: undefined,
                    video: undefined,
                };
            }
            Logger.debug(`teacherMute: muting producer: ${producer.id}`)
            switch (producer.kind) {
                case "audio":
                    this.teacherAudioMuted = audio !== undefined ? !audio : this.teacherAudioMuted
                    this.selfAudioMuted = this.teacherAudioMuted ? true : this.selfAudioMuted
                    if (this.selfAudioMuted) {
                        await producer.pause()
                    } else {
                        await producer.resume()
                    }
                    break;
                case "video":
                    this.teacherVideoDisabled = video !== undefined ? !video : this.teacherVideoDisabled
                    this.selfVideoMuted = this.teacherVideoDisabled ? true : this.selfVideoMuted
                    if (this.selfVideoMuted) {
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
                        audio: !this.selfAudioMuted,
                        video: !this.selfVideoMuted,
                    }
                }
            })
            return {
                    roomId,
                    sessionId: this.id,
                    audio: !this.teacherAudioMuted,
                    video: !this.teacherVideoDisabled,
                };

        })
    }

    public getProducer(audio?: boolean, video?: boolean): MediaSoup.Producer | undefined {
        let producer: MediaSoup.Producer | undefined;
        if (audio !== undefined) {
            producer = Array.from(this.producers.values()).find((p) => p.kind === "audio");
        } else if (video !== undefined) {
            producer = Array.from(this.producers.values()).find((p) => p.kind === "video");
        }
        return producer;
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
