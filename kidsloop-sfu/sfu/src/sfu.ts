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
import * as pg from "pg"
import {JWT} from "./auth"
import {mediaCodecs} from "./config"
import {MuteNotification} from "./schema"

import * as fs from "fs"

enum UserAction {
    Join = "JOIN",
    Leave = "LEAVE"
}

enum RoomAction {
    Start = "START",
    End = "END"
}

export class SFU {
    public static async create(ip: string, uri: string): Promise<SFU> {
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
        });
        await redis.connect();
        Logger.info("🔴 Redis database connected")

        const id = uuid()

        // These environment variables don't need to be read, but they do need to be defined in order to connect
        // PGUSER=dbuser
        // PGHOST=database.server.com
        // PGPASSWORD=secretpassword
        // PGDATABASE=mydb
        // PGPORT=3211

        const PGNOSSL = process.env.PGNOSSL

        let client
        if (PGNOSSL) {
            client = new pg.Client()
        } else {
            // These environment variables should be read
            const PGSSLCA = process.env.PGSSLCA
            const PGSSLKEY = process.env.PGSSLKEY
            const PGSSLCERT = process.env.PGSSLCERT

            if (!PGSSLCA) {
                Logger.error("PGSSLCA is not set.  It should point to the server certificate, i.e. /path/to/server-certificates/root.crt.  Run with PGNOSSL set to attempt connecting without SSL.")
                process.exit(-1)
            }
            if (!PGSSLKEY) {
                Logger.error("PGSSLKEY is not set.  It should point to the client key, i.e. /path/to/client-key/postgresql.key. Run with PGNOSSL set to attempt connecting without SSL.")
                process.exit(-1)
            }
            if (!PGSSLCERT) {
                Logger.error("PGSSLCERT is not set.  It should point to the client certificate, i.e. /path/to/client-certificates/postgresql.crt. Run with PGNOSSL set to attempt connecting without SSL.")
                process.exit(-1)
            }

            // connect via SSL socket
            const config = {
                ssl: {
                    rejectUnauthorized: false,
                    ca: fs.readFileSync(PGSSLCA).toString(),
                    key: fs.readFileSync(PGSSLKEY).toString(),
                    cert: fs.readFileSync(PGSSLCERT).toString()
                }
            }

            client = new pg.Client(config)
        }

        await client.connect()
        Logger.info("🐘 POSTGRES database connected")

        Logger.info("Creating SFU")
        return new SFU(ip, uri, id, redis, worker, router, client)
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
        await this.db.end()
        await this.redis.disconnect()
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
            try {
                await this.recordRoomStart(token.roomid)
            } catch (e) {
                Logger.error(e)
            }
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
        if (teacher) {
            Logger.info("teacher")
            if ((!targetClient.selfAudioMuted && audio !== undefined) ||
                (!targetClient.selfVideoMuted && video !== undefined)) {
                for (const client of this.clients.values()) {
                    clientMessages.push(client.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher))
                }
            } else {
                return targetClient.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher)
            }

        } else if (self) {
            Logger.info("self")
            if ((!targetClient.teacherAudioMuted && audio !== undefined) ||
                (!targetClient.teacherVideoMuted && video !== undefined)) {
                for (const client of this.clients.values()) {
                    clientMessages.push(client.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher))
                }
            } else {
                return sourceClient.muteMessage(roomId, sessionId, producerId, consumerId, audio, video, teacher)
            }
        } else {
            Logger.info("local")
            return sourceClient.muteMessage(roomId, sessionId, producerId, consumerId, audio, video)
        }

        return (await Promise.all(clientMessages)).reduce((p, c) => c && p)
    }

    private readonly id: string;
    private readonly externalIp: string
    private readonly address: string
    private readonly listenIps: MediaSoup.TransportListenIp[]
    public clients = new Map<string, Client>()
    public roomId?: string
    private redis: Redis.Redis
    private worker: MediaSoup.Worker
    private readonly router: MediaSoup.Router
    private db: pg.Client
    private roomStatusMap = new Map<string, boolean>()

    private constructor(ip: string, uri: string, id: string, redis: Redis.Redis, worker: MediaSoup.Worker, router: MediaSoup.Router, db: pg.Client) {
        this.externalIp = ip
        this.listenIps = [{ip: "0.0.0.0", announcedIp: process.env.PUBLIC_ADDRESS || ip}]
        this.address = uri
        this.id = id
        this.redis = redis
        this.worker = worker
        this.router = router
        this.db = db
        this.claimRoom()
    }

    private async claimRoom() {
        let roomId: string
        let claimed: "OK" | null = null
        let sfu = {key: "", ttl: 0}
        do {
            [, roomId] = await this.redis.blpop("sfu:request", 0)
            if (!roomId) {
                continue
            }
            sfu = RedisKeys.roomSfu(roomId)
            claimed = await this.redis.set(sfu.key, this.address, "EX", sfu.ttl, "NX")
        } while (claimed !== "OK")
        this.roomId = roomId
        setAvailable(false)

        Logger.info(`Assigned to Room(${roomId})`)
        startServerTimeout(this)
        const notify = RedisKeys.roomNotify(this.roomId);
        await this.redis.xadd(
            notify.key,
            "MAXLEN", "~", 32, "*",
            "json", JSON.stringify({sfu: this.address})
        );

        await this.checkRoomStatus();

        let value: string | null
        do {
            await this.redis.set(sfu.key, this.address, "EX", sfu.ttl, "XX")
            await new Promise((resolve) => setTimeout(resolve, sfu.ttl / 2))
            value = await this.redis.get(sfu.key)
        } while (value === this.address)

        Logger.error(`Room(${roomId})::SFU was '${value}' but expected '${this.address}', terminating SFU`)
        process.exit(-2)
    }

    private async checkRoomStatus() {
        if (this.clients.size === 0 && this.roomId && this.roomStatusMap.get(this.roomId)) {
            this.roomStatusMap.set(this.roomId, false)
            try {
                await this.recordRoomEnd(this.roomId)
            } catch (e) {
                Logger.error(e)
            }
        }
        setTimeout(() => this.checkRoomStatus(), 60 * 1000)
    }

    private async recordUserJoin(clientid: number, issuer: string, roomId: string, teacher: boolean) {
        Logger.info(`Recording client: ${clientid} joining room ${roomId} teacher: ${teacher}`)
        const query = `INSERT INTO users (userid, issuer, roomid, action, teacher) 
                       VALUES ($1, $2, $3, $4, $5)`
        const keys = [clientid, issuer, roomId, UserAction.Join, teacher]
        return this.db.query(query, keys)
    }

    private async recordUserLeave(clientid: number, issuer: string, roomId: string, teacher: boolean) {
        Logger.info(`Recording client: ${clientid} leaving room ${roomId} teacher: ${teacher}`)
        const query = `INSERT INTO users (userid, issuer, roomid, action, teacher)
                       VALUES ($1, $2, $3, $4, $5)`
        const keys = [clientid, issuer, roomId, UserAction.Leave, teacher]
        return this.db.query(query, keys)
    }

    public async recordRoomStart(roomId: string) {
        Logger.info(`Recording room: ${roomId} starting`)
        const query = `INSERT INTO rooms (roomid, action)
                       VALUES ($1, $2)`
        const keys = [roomId, RoomAction.Start]
        return this.db.query(query, keys)
    }

    public async recordRoomEnd(roomId: string) {
        Logger.info(`Recording room: ${roomId} ending`)
        const query = `INSERT INTO rooms (roomid, action)
                       VALUES ($1, $2)`
        const keys = [roomId, RoomAction.End]
        return this.db.query(query, keys)
    }

    private async getOrCreateClient(id: string, token?: JWT): Promise<Client> {
        let client = this.clients.get(id)
        if (!client) {
            if (!token) {
                Logger.error("Token must be supplied to create a client")
                throw new Error("Token must be supplied to create a client")
            }
            try {
                await this.recordUserJoin(token.userid, token.iss, token.roomid, token.teacher)
            } catch (e) {
                Logger.error(e)
            }
            client = await Client.create(
                id,
                this.router,
                this.listenIps,
                () => {
                    try {
                        this.recordUserLeave(token.userid, token.iss, token.roomid, token.teacher)
                    } catch (e) {
                        Logger.error(e)
                    }
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