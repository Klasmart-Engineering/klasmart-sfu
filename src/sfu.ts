import {v4 as uuid} from "uuid"
import {
    observer,
    createWorker,
    types as MediaSoup,
} from "mediasoup"
import {Client, Stream} from "./client"
import {Context, Logger, startServerTimeout} from "./entry"
import Redis = require("ioredis")
import {RedisKeys} from "./redisKeys"
import {
    setAvailable,
    incrementConsumerCount,
    decrementConsumerCount,
    incrementProducerCount,
    decrementProducerCount,
} from "./reporting";
import {JWT} from "./auth"
import {mediaCodecs} from "./config"
import {MuteNotification} from "./schema"

enum UserAction {
    Join = "JOIN",
    Leave = "LEAVE"
}

enum RoomAction {
    Start = "START",
    End = "END"
}

export class SFU {
    public static async create(ip: string): Promise<SFU> {
        const worker = await createWorker({
            logLevel: "warn",
        })
        Logger.info("🎥 Mediasoup worker initialized")

        const router = await worker.createRouter({mediaCodecs})
        Logger.info("💠 Mediasoup router created")

        const redis = new Redis({
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT) || undefined,
            password: process.env.REDIS_PASS || undefined,
            lazyConnect: true,
            reconnectOnError: (err) => err.message.includes("READONLY"),
        });
        await redis.connect();
        Logger.info("🔴 Redis database connected")

        const id = uuid()

        Logger.info("Creating SFU")
        return new SFU(ip, id, redis, worker, router)
    }

    public connect(sessionId: string) {
        const client = this.clients.get(sessionId)
        if (!client) {
            return
        }
        client.connect()
    }

    public disconnect(sessionId: string) {
        const client = this.clients.get(sessionId)
        if (!client) {
            return
        }
        client.disconnect()
    }

    public async shutdown() {
        await this.redis.disconnect()
        process.exit(0)
    }

    public async subscribe({sessionId, token}: Context) {
        if (!sessionId) {
            Logger.error("Can not initiate subscription without sessionId");
            return
        }
        if (!token) {
            Logger.error("Can not initiate subscription without token");
            return
        }
        Logger.info(`Subscription from ${sessionId}`)
        const client = await this.getOrCreateClient(sessionId, token)
        if (!this.roomStatusMap.get(token.roomid)) {
            this.roomStatusMap.set(token.roomid, true)
        }
        return client.subscribe()
    }

    public async rtpCapabilitiesMessage(context: Context, rtpCapabilities: string) {
        Logger.info(`rtpCapabilitiesMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.rtpCapabilitiesMessage(rtpCapabilities)
    }

    public async transportMessage(context: Context, producer: boolean, params: string) {
        Logger.info(`transportMessage(${producer}) from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.transportMessage(producer, params)
    }

    public async producerMessage(context: Context, params: string) {
        Logger.info(`producerMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.producerMessage(params)
    }

    public async consumerMessage(context: Context, id: string, pause?: boolean) {
        Logger.info(`consumerMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.consumerMessage(id, pause)
    }

    public async streamMessage(context: Context, id: string, producerIds: string[]) {
        Logger.info(`streamMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.streamMessage(id, producerIds)
    }

    public async closeMessage(context: Context, id: string) {
        Logger.info(`closeMessage from ${context.sessionId}`)
        if (!context.sessionId) {
            return false
        }
        const client = await this.getOrCreateClient(context.sessionId)
        return client.closeMessage(id)
    }

    public async muteMessage(context: Context, muteNotification: MuteNotification): Promise<boolean> {
        Logger.info(`muteMessage from ${context.sessionId}`)
        let {roomId, sessionId, producerId, consumerId, audio, video} = muteNotification
        if (!context.sessionId) {
            Logger.warn("No sessionId in context")
            return false
        }
        const sourceClient = await this.getOrCreateClient(context.sessionId)
        const targetClient = await this.getOrCreateClient(sessionId)
        let self = sessionId === context.sessionId
        let teacher = sourceClient.jwt.teacher
        let clientMessages: Promise<boolean>[] = []
        if (teacher && !self) {
                for (const client of this.clients.values()) {
                    if (audio !== undefined) {
                        producerId = Array.from(targetClient.producers.values()).find((p) => p.kind === "audio")?.id
                    } else if (video !== undefined) {
                        producerId = Array.from(targetClient.producers.values()).find((p) => p.kind === "video")?.id
                    }
                    clientMessages.push(client.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher))
                }
        } else if (self) {
            if ((!targetClient.teacherAudioMuted && audio !== undefined) ||
                (!targetClient.teacherVideoMuted && video !== undefined)) {
                for (const client of this.clients.values()) {
                    clientMessages.push(client.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher))
                }
            } else {
                return sourceClient.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher)
            }
        } else {
            return sourceClient.muteMessage(roomId, sessionId, producerId, consumerId, audio, video)
        }

        return (await Promise.all(clientMessages)).reduce((p, c) => c && p)
    }

    public async endClassMessage(context: Context, roomId?: string): Promise<boolean> {
        Logger.info(`endClassMessage from: ${context.sessionId}`)
        if (!context.sessionId) {
            Logger.warn("No sessionId in context")
            return false
        }
        const sourceClient = await this.getOrCreateClient(context.sessionId)
        let teacher = sourceClient.jwt.teacher

        if (!teacher) {
            Logger.warn(`SessionId: ${context.sessionId} attempted to end the class!`)
            return false
        }

        for (const client of this.clients.values()) {
            await client.endClassMessage(roomId)
        }

        return true
    }

    private readonly id: string;
    private readonly externalIp: string
    private readonly listenIps: MediaSoup.TransportListenIp[]
    public clients = new Map<string, Client>()
    public roomId?: string
    private redis: Redis.Redis
    private worker: MediaSoup.Worker
    private readonly router: MediaSoup.Router
    private roomStatusMap = new Map<string, boolean>()

    private constructor(ip: string, id: string, redis: Redis.Redis, worker: MediaSoup.Worker, router: MediaSoup.Router) {
        this.externalIp = ip
        this.listenIps = [{ip: "0.0.0.0", announcedIp: process.env.PUBLIC_ADDRESS || ip}]
        this.id = id
        this.redis = redis
        this.worker = worker
        this.router = router
    }

    public async claimRoom(announceURI: string) {
        let roomId: string
        let claimed: "OK" | null = null
        let sfu = {key: "", ttl: 0}
        do {
            [, roomId] = await this.redis.blpop("sfu:request", 0)
            if (!roomId) {
                continue
            }
            sfu = RedisKeys.roomSfu(roomId)
            claimed = await this.redis.set(sfu.key, announceURI, "EX", sfu.ttl, "NX")
        } while (claimed !== "OK")
        this.roomId = roomId
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
            await new Promise((resolve) => setTimeout(resolve, sfu.ttl / 2))
            value = await this.redis.get(sfu.key)
        } while (value === announceURI)

        Logger.error(`Room(${roomId})::SFU was '${value}' but expected '${announceURI}', terminating SFU`)
        process.exit(-2)
    }

    private async checkRoomStatus() {
        if (this.clients.size === 0 && this.roomId && this.roomStatusMap.get(this.roomId)) {
            this.roomStatusMap.set(this.roomId, false)
        }
        setTimeout(() => this.checkRoomStatus(), 60 * 1000)
    }


    private async getOrCreateClient(id: string, token?: JWT): Promise<Client> {
        let client = this.clients.get(id)
        if (!client) {
            if (!token) {
                Logger.error("Token must be supplied to create a client")
                throw new Error("Token must be supplied to create a client")
            }
            client = await Client.create(
                id,
                this.router,
                this.listenIps,
                () => {
                    this.clients.delete(id)
                },
                token
            )
            Logger.info(`New Client(${id})`)
            for (const [otherId, otherClient] of this.clients) {
                for (const stream of otherClient.getStreams()) {
                    client.forwardStream(stream).then(() => {
                        Logger.info(`Forwarding Stream(${stream.sessionId}_${stream.id}) from Client(${otherId}) to Client(${id})`)
                    })
                }
            }
            this.clients.set(id, client)
            client.emitter.on("stream", (s: Stream) => this.newStream(s))
        }
        return client
    }

    private async newStream(stream: Stream) {
        Logger.info(`New Stream(${stream.sessionId}_${stream.id})`)
        const forwardPromises = []
        for (const [id, client] of this.clients) {
            if (id === stream.sessionId) {
                continue
            }
            const forwardPromise = client.forwardStream(stream)
            forwardPromise.then(() => {
                Logger.info(`Forwarding new Stream(${stream.sessionId}_${stream.id}) to Client(${id})`)
            })
            forwardPromises.push(forwardPromise)
        }
        await Promise.all(forwardPromises)
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