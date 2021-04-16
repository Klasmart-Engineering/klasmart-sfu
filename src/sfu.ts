import {v4 as uuid} from "uuid"
import {
    observer,
    createWorker,
    types as MediaSoup,
} from "mediasoup"
import {Context, Logger, startServerTimeout} from "./entry"
import Redis = require("ioredis")
import {RedisKeys} from "./redisKeys"
import {
    setAvailable,
    incrementConsumerCount,
    decrementConsumerCount,
    incrementProducerCount,
    decrementProducerCount,
} from "./reporting"
import {mediaCodecs} from "./config"
import {WorkerType, Worker} from "./worker"
import {Client, Stream} from "./client";
import {JWT} from "./auth";
import {GlobalMuteNotification, MuteNotification} from "./interfaces";

export class SFU {
    private readonly id: string;
    private readonly externalIp: string
    private readonly listenIps: MediaSoup.TransportListenIp[]
    public roomId?: string
    private redis: Redis.Redis
    private roomStatusMap = new Map<string, boolean>()
    private available = false
    private producerWorkers = new Map<string, Worker>()
    private consumerWorkers = new Map<string, Worker>()
    private mixedWorkers = new Map<string, Worker>()
    private producerClientWorkerMap = new Map<string, Worker>()
    private consumerClientWorkerMap = new Map<string, Worker>()
    private mixedClientWorkerMap = new Map<string, Worker>()
    public clients: Map<string, Client> = new Map<string, Client>()

    private constructor(
        ip: string,
        id: string,
        redis: Redis.Redis,
        producerWorkers: Worker[],
        consumerWorkers: Worker[],
        mixedWorkers: Worker[]) {

        this.externalIp = ip
        this.listenIps = [{ip: "0.0.0.0", announcedIp: process.env.PUBLIC_ADDRESS ?? ip}]
        this.id = id
        this.redis = redis
        for (const worker of producerWorkers) {
            this.producerWorkers.set(worker.id, worker)
        }

        for (const worker of consumerWorkers) {
            this.consumerWorkers.set(worker.id, worker)
        }

        for (const worker of mixedWorkers) {
            this.mixedWorkers.set(worker.id, worker)
        }

        this.reportSFUState().catch(e => Logger.error(e))
    }

    public static async create(ip: string): Promise<SFU> {
        Logger.warn(`NUM_CPU_CORES: ${process.env.NUM_CPU_CORES}`)
        const numWorkers = parseInt(process.env.NUM_CPU_CORES ?? "1")
        const producerWorkers: Worker[] = []
        const consumerWorkers: Worker[] = []
        const mixedWorkers: Worker[] = []

        // Create worker threads
        for (let i = 0; i < numWorkers; i++) {
            let workerType
            if (numWorkers === 1) {
                workerType = WorkerType.MIXED
            } else if (i === 0) {
                workerType = WorkerType.PRODUCER
            } else {
                workerType = WorkerType.CONSUMER
            }

            const worker = await createWorker({
                logLevel: "warn",
            })

            const router = await worker.createRouter({mediaCodecs})
            const newWorker = new Worker(worker, workerType, router)
            switch (workerType) {
                case WorkerType.PRODUCER:
                    producerWorkers.push(newWorker)
                    break
                case WorkerType.CONSUMER:
                    consumerWorkers.push(newWorker)
                    break
                case WorkerType.MIXED:
                    mixedWorkers.push(newWorker)
                    break
                default:
                    throw new Error("Unsupported worker type")
            }
        }

        Logger.info(`🎥 Mediasoup workers initialized: Producer Workers(${producerWorkers.length}), Consumer Workers(${consumerWorkers.length}), Mixed Workers(${mixedWorkers.length})`)
        Logger.info("💠 Mediasoup routers created")

        const redis = new Redis({
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT ?? 6379),
            password: process.env.REDIS_PASS ?? undefined,
            lazyConnect: true,
            reconnectOnError: (err) => err.message.includes("READONLY"),
        });
        await redis.connect();
        Logger.info("🔴 Redis database connected")

        const id = uuid()

        Logger.info("Creating SFU")
        return new SFU(ip, id, redis, producerWorkers, consumerWorkers, mixedWorkers)
    }

    public async shutdown() {
        await this.redis.disconnect()
        process.exit(0)
    }

    private reporting = false
    private async reportSFUState() {
        if(this.reporting) { return }
        try {
            this.reporting = true
            while(true) {
                const status = RedisKeys.sfuStatus(this.id)
                await this.redis.set(status.key, this.available ? 1 : 0, "EX", status.ttl).catch((e) => console)
                await new Promise((resolve) => setTimeout(resolve, 1000 * status.ttl / 2))
            }
        } finally {
            this.reporting = false
        }
    }

    public async sfuStats() {
        let availableCount = 0
        let otherCount = 0
        
        const statusSearch = RedisKeys.sfuStatus("*");
        let statusSearchCursor = "0";
        do {
            const [newCursor, keys] = await this.redis.scan(statusSearchCursor, "MATCH", statusSearch.key);
            statusSearchCursor = newCursor;
            for (const key of keys) {
                try {
                    const value = await this.redis.get(key)
                    if(value !== null) {
                        if(Boolean(value)) { availableCount++ } else { otherCount++ }
                    }
                } catch(e) {
                    console.error(e)
                }
            }
        } while (statusSearchCursor !== "0");

        return {
            availableCount,
            otherCount,
        }
    }

    public async claimRoom(announceURI: string) {
        this.available = true
        setAvailable(true)
        let roomId: string
        let claimed: "OK" | null = null
        let sfu = {key: "", ttl: 0}
        {
            //Duplicate redis as we will block
            const redis = this.redis.duplicate()
            try {
                do {
                    [, roomId] = await redis.blpop("sfu:request", 0)
                    if (!roomId) {
                        continue
                    }
                    sfu = RedisKeys.roomSfu(roomId)
                    claimed = await this.redis.set(sfu.key, announceURI, "EX", sfu.ttl, "NX")
                } while (claimed !== "OK")
            } finally {
                redis.disconnect()
            }
        }
        this.roomId = roomId
        this.available = false
        setAvailable(false)

        Logger.info(`Assigned to Room(${roomId})`)
        startServerTimeout(this)
        const notify = RedisKeys.roomNotify(this.roomId);
        await this.redis.xadd(
            notify.key,
            "MAXLEN", "~", 32, "*",
            "json", JSON.stringify({sfu: announceURI})
        );

        await this.checkRoomStatus();

        let value: string | null
        do {
            await this.redis.set(sfu.key, announceURI, "EX", sfu.ttl, "XX")
            await new Promise((resolve) => setTimeout(resolve, 1000 * sfu.ttl / 2))
            value = await this.redis.get(sfu.key)
        } while (value === announceURI)

        Logger.error(`Room(${roomId})::SFU was '${value}' but expected '${announceURI}', terminating SFU`)
        process.exit(-2)
    }

    private async checkRoomStatus() {
        if (this.producerClientWorkerMap.size === 0 && this.consumerClientWorkerMap.size === 0 && this.roomId && this.roomStatusMap.get(this.roomId)) {
            this.roomStatusMap.set(this.roomId, false)
        }
        setTimeout(() => this.checkRoomStatus(), 60 * 1000)
    }

    public async subscribe(context: Context) {
        if (!context.sessionId) {
            throw new Error("Context missing sessionId")
        }
        if (!context.token) {
            throw new Error("Context missing token")
        }

        const client = await this.getOrCreateClient(context.sessionId, context.token)
        if (!this.roomStatusMap.get(context.token.roomid)) {
            this.roomStatusMap.set(context.token.roomid, true)
        }

        const producerWorker = this.producerClientWorkerMap.get(client.id)
        const consumerWorker = this.consumerClientWorkerMap.get(client.id)
        const mixedWorker = this.mixedClientWorkerMap.get(client.id)

        if (!producerWorker && !consumerWorker && !mixedWorker) {
            throw new Error("Client is not assigned to any workers!")
        }

        if (producerWorker) {
            return await producerWorker.subscribe(client)
        }
        if (mixedWorker) {
            return await mixedWorker.subscribe(client)
        }
    }

    private async getOrCreateClient(id: string, token?: JWT): Promise<Client> {
        let client = this.clients.get(id)
        if (!client) {
            if (!token) {
                Logger.error("Token must be supplied to create a client")
                throw new Error("Token must be supplied to create a client")
            }

            // Select a worker to assign the client to
            let minProducers = Infinity
            let minConsumers = Infinity
            let lowestLoadProducer: Worker | undefined
            let lowestLoadConsumer: Worker | undefined
            for (const producerWorker of this.producerWorkers.values()) {
                if (producerWorker.numProducers() < minProducers) {
                    lowestLoadProducer = producerWorker
                    minProducers = lowestLoadProducer.numProducers()
                }
            }

            for (const consumerWorker of this.consumerWorkers.values()) {
                if (consumerWorker.numConsumers() < minConsumers) {
                    lowestLoadConsumer = consumerWorker
                    minConsumers = lowestLoadConsumer.numConsumers()
                }
            }

            for (const mixedWorker of this.mixedWorkers.values()) {
                if (mixedWorker.numProducers() < minProducers) {
                    lowestLoadProducer = mixedWorker
                    minProducers = lowestLoadProducer.numProducers()
                }
                if (mixedWorker.numConsumers() < minConsumers) {
                    lowestLoadConsumer = mixedWorker
                    minConsumers = lowestLoadConsumer.numConsumers()
                }
            }

            if (!lowestLoadProducer) {
                throw new Error("No available worker for producer!")
            }
            if (!lowestLoadConsumer) {
                throw new Error("No available worker for consumer!")
            }

            client = await Client.create(
                id,
                lowestLoadProducer.getRouter(),
                lowestLoadConsumer.getRouter(),
                this.listenIps,
                () => {
                    this.clients.delete(id)
                },
                token
            )
            this.clients.set(client.id, client)
            lowestLoadProducer.clients.set(client.id, client)
            lowestLoadConsumer.clients.set(client.id, client)

            this.producerClientWorkerMap.set(client.id, lowestLoadProducer)
            this.consumerClientWorkerMap.set(client.id, lowestLoadConsumer)

            Logger.info(`New Client(${id}) assigned to producer worker(${lowestLoadProducer.id}) and consumer worker (${lowestLoadConsumer.id})`)
            for (const [otherId, otherClient] of this.clients) {
                for (const stream of otherClient.getStreams()) {
                    client.forwardStream(stream, this.roomId!).then(() => {
                        Logger.info(`Forwarding Stream(${stream.sessionId}_${stream.id}) from Client(${otherId}) to Client(${id})`)
                    })
                }
            }
            client.emitter.on("stream", (s: Stream) => lowestLoadProducer!.newStream(s, this.roomId!))
        }
        return client
    }

    private static verifyContext(context: Context): {sessionId: string, token: JWT } {
        if (!context.sessionId) {
            throw new Error("Context missing sessionId")
        }
        if (!context.token) {
            throw new Error("Context missing JWT")
        }

        return {sessionId: context.sessionId, token: context.token }
    }


    public async endClassMessage(context: Context, roomId?: string): Promise<boolean> {
        Logger.info(`endClassMessage from: ${context.sessionId}`)
        const {sessionId} = SFU.verifyContext(context)
        const sourceClient = await this.getOrCreateClient(sessionId)
        let teacher = sourceClient.jwt.teacher

        if (!teacher) {
            Logger.warn(`SessionId: ${sessionId} attempted to end the class!`)
            return false
        }

        for (const client of this.clients.values()) {
            await client.endClassMessage(roomId)
        }

        return true
    }

    public async rtpCapabilitiesMessage(context: Context, rtpCapabilities: string) {
        const {sessionId, token} = SFU.verifyContext(context)
        const client = await this.getOrCreateClient(sessionId, token)
        return await client.rtpCapabilitiesMessage(rtpCapabilities)
    }

    public async transportMessage(context: Context, isProducer: boolean, params: string) {
        const {sessionId, token} = SFU.verifyContext(context)
        const client = await this.getOrCreateClient(sessionId, token)
        return await client.transportMessage(isProducer, params)
    }

    public async producerMessage(context: Context, params: string) {
        const {sessionId, token} = SFU.verifyContext(context)
        Logger.info(`ProducerMessage from ${sessionId}`)
        const client = await this.getOrCreateClient(sessionId, token)
        const producer = await client.producerMessage(params)
        const producerWorker = this.producerClientWorkerMap.get(client.id)

        if (!producerWorker) {
            Logger.info("No dedicated producer workers, checking for mixed worker")
            const mixedWorker = this.mixedClientWorkerMap.get(client.id)
            if (!mixedWorker) {
                throw new Error("No producer or mixed worker in which to place producer")
            }
            mixedWorker.producers.set(producer.id, producer)
            return producer.id
        }
        // Create/connect pipe transports to consumer workers
        for (const consumerWorker of this.consumerWorkers.values()) {
            const { pipeConsumer, pipeProducer } = await producerWorker
                .getRouter()
                .pipeToRouter({
                producerId: producer.id,
                router: consumerWorker.getRouter()
            })
            if (!pipeProducer) {
                throw new Error("Failed to create piped producer")
            }
            if (!pipeConsumer) {
                throw new Error("Failed to create piped consumer")
            }
            consumerWorker.producers.set(pipeProducer.id, pipeProducer)
            producerWorker.consumers.set(pipeConsumer.id, pipeConsumer)
        }
        return producer.id
    }

    public async consumerMessage(context: Context, producerId: string, pause?: boolean) {
        const {sessionId} = SFU.verifyContext(context)
        const client = await this.getOrCreateClient(sessionId)
        return client.consumerMessage(producerId, pause)
    }

    public async streamMessage(context: Context, streamId: string, producerIds: string[]) {
        Logger.info(`Stream message: ${streamId}`)
        const {sessionId} = SFU.verifyContext(context)
        const client = await this.getOrCreateClient(sessionId)
        return client.streamMessage(streamId, producerIds)
    }

    public async closeMessage(context: Context, id: string) {
        const {sessionId} = SFU.verifyContext(context)
        const client = await this.getOrCreateClient(sessionId)
        return await client.closeMessage(id)
    }

    public async muteMessage(context: Context, muteNotification: MuteNotification) {
        const {sessionId: sourceSessionId} = SFU.verifyContext(context)
        Logger.debug(`muteMessage from ${sourceSessionId}`)
        const sourceClient = await this.getOrCreateClient(sourceSessionId)

        const { roomId, sessionId: targetSessionId, audio, video } = muteNotification
        const { audioGloballyMuted, videoGloballyDisabled } = await this.getGlobalMuteStates(roomId);
        const targetClient = this.clients.get(targetSessionId)

        if (!targetClient) {
            throw new Error("Cannot find target client for mute message")
        }

        const tryingToOverrideTeacherMute = !sourceClient.jwt.teacher &&
            ((audio && targetClient.teacherAudioMuted) || (audio && audioGloballyMuted) ||
            (video && targetClient.teacherVideoDisabled) || (video && videoGloballyDisabled))
        
        const tryingToOverrideSelfMute = (targetClient.id !== sourceClient.id && sourceClient.jwt.teacher) && 
            ((audio === false && targetClient.selfAudioMuted) || (video === false && targetClient.selfVideoMuted))

        if (tryingToOverrideSelfMute || tryingToOverrideTeacherMute) {
            return {
                roomId,
                sessionId: sourceSessionId,
                audio: undefined,
                video: undefined,
            }
        }

        if (targetClient.id === sourceClient.id) {
            await sourceClient.selfMute(roomId, audio, video)
        } else if (sourceClient.jwt.teacher) {
            await targetClient.teacherMute(roomId, audio, video);
        }
        return muteNotification; 
    }

    public async globalMuteMutation(context: Context, globalMuteNotification: GlobalMuteNotification) {
        const { roomId, audioGloballyMuted, videoGloballyDisabled } = globalMuteNotification;
        const {sessionId } = SFU.verifyContext(context)
        Logger.debug(`globalMuteMutation requested by ${sessionId}`)
        const sourceClient = await this.getOrCreateClient(sessionId)
        if (!sourceClient.jwt.teacher) {
            throw new Error("globalMuteMutation: only teachers can enforce this");
        }

        if (audioGloballyMuted === undefined && videoGloballyDisabled === undefined) {
            throw new Error("globalMuteMutation: audioGloballyMuted and videoGloballyDisabled are both undefined");
        } else if (audioGloballyMuted !== undefined) {
            const roomAudioMuted = RedisKeys.roomAudioMuted(roomId);
            await this.redis.set(roomAudioMuted.key, audioGloballyMuted.toString());
        } else if (videoGloballyDisabled !== undefined) {
            const roomVideoDisabled = RedisKeys.roomVideoDisabled(roomId);
            await this.redis.set(roomVideoDisabled.key, videoGloballyDisabled.toString());
        } 

        const students = Array.from(this.clients.values()).filter(client => !client.jwt.teacher);
        const audio = audioGloballyMuted === undefined ? undefined : !audioGloballyMuted;
        const video = videoGloballyDisabled === undefined ? undefined : !videoGloballyDisabled;
        for (const student of students) {
            student.teacherMute(roomId, audio, video);
            student.publishGlobalMuteState(roomId, audioGloballyMuted, videoGloballyDisabled);
        }
        sourceClient.publishGlobalMuteState(roomId, audioGloballyMuted, videoGloballyDisabled);
        return {
            roomId,
            audioGloballyMuted,
            videoGloballyDisabled,
        };
    }

    private async getGlobalMuteStates(roomId: string) {
        const roomAudioMuted = RedisKeys.roomAudioMuted(roomId);
        const roomVideoDisabled = RedisKeys.roomVideoDisabled(roomId);
        const audioGloballyMuted = await this.redis.get(roomAudioMuted.key) === 'true';
        const videoGloballyDisabled = await this.redis.get(roomVideoDisabled.key) === 'true';
        return {
            audioGloballyMuted,
            videoGloballyDisabled,
        }
    }

    public async globalMuteQuery(context: Context, roomId: string) {
        const { audioGloballyMuted, videoGloballyDisabled } = await this.getGlobalMuteStates(roomId);
        return {
            roomId,
            audioGloballyMuted,
            videoGloballyDisabled,
        }
    }

    public async disconnect(sessionId: string) {
        const client = await this.getOrCreateClient(sessionId)
        this.clients.delete(client.id)
        const producerWorker = this.producerClientWorkerMap.get(client.id)
        const consumerWorker = this.consumerClientWorkerMap.get(client.id)
        if (producerWorker) {
            producerWorker.disconnect(sessionId)
        }
        if (consumerWorker) {
            consumerWorker.disconnect(sessionId)
        }
    }
}

observer.on("newworker", (worker) => {
    Logger.info(`new worker created [worker.pid:${worker.pid}]`);
    worker.observer.on("close", () => {
        Logger.info(`worker closed [worker.pid:${worker.pid}]`);
        Logger.info("Will shutdown due to worker close");
        process.exit(-1)
    })
    worker.observer.on("newrouter", (router: MediaSoup.Router) => {
        Logger.info(`new router created [worker.pid:${worker.pid}, router.id:${router.id}]`);
        router.observer.on("close", () => {
            Logger.info("router closed [router.id:%s]", router.id)
            Logger.info("Will shutdown due to router close");
            process.exit(-1)
        });
        router.observer.on("newtransport", (transport: MediaSoup.Transport) => {
            Logger.info(`new transport created [worker.pid:${worker.pid}, router.id:${router.id}, transport.id:${transport.id}]`);
            transport.observer.on("close", () => Logger.info(`transport closed [transport.id:${transport.id}]`));
            transport.observer.on("newproducer", (producer: MediaSoup.Producer) => {
                incrementProducerCount()
                Logger.info(`new producer created [worker.pid:${worker.pid}, router.id:${router.id}, transport.id:${transport.id}, producer.id:${producer.id}]`);
                producer.observer.on("close", () => {
                    decrementProducerCount()
                    Logger.info(`producer closed [producer.id:${producer.id}]`)
                });
            });
            transport.observer.on("newconsumer", (consumer: MediaSoup.Consumer) => {
                incrementConsumerCount()
                Logger.info(`new consumer created [worker.pid:${worker.pid}, router.id:${router.id}, transport.id:${transport.id}, consumer.id:${consumer.id}]`);
                consumer.observer.on("close", () => {
                    decrementConsumerCount()
                    Logger.info(`consumer closed [consumer.id:${consumer.id}]`)
                });
            });
            transport.observer.on("newdataproducer", (dataProducer: MediaSoup.DataProducer) => {
                Logger.info(`new data producer created [worker.pid:${worker.pid}, router.id:${router.id}, transport.id:${transport.id}, dataProducer.id:${dataProducer.id}]`);
                dataProducer.observer.on("close", () => Logger.info(`data producer closed [dataProducer.id:${dataProducer.id}]`, dataProducer.id));
            });
            transport.observer.on("newdataconsumer", (dataConsumer: MediaSoup.DataConsumer) => {
                Logger.info(`new data consumer created [worker.pid:${worker.pid}, router.id:${router.id}, transport.id:${transport.id}, dataConsumer.id:${dataConsumer.id}]`);
                dataConsumer.observer.on("close", () => Logger.info(`data consumer closed [dataConsumer.id:${dataConsumer.id}]`));
            });
        });
    });
});