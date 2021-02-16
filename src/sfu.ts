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
        const numWorkers = parseInt(process.env.NUM_CPU_CORES ?? "1")
        const producerWorkers: Worker[] = []
        const consumerWorkers: Worker[] = []
        const mixedWorkers: Worker[] = []

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

        Logger.info("🎥 Mediasoup workers initialized")
        Logger.info("💠 Mediasoup routers created")

        const redis = new Redis({
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT) ?? undefined,
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
                await this.redis.set(status.key, this.available?1:0, "EX", status.ttl).catch((e) => console)
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
        if (this.clients.size === 0 && this.roomId && this.roomStatusMap.get(this.roomId)) {
            this.roomStatusMap.set(this.roomId, false)
        }
        setTimeout(() => this.checkRoomStatus(), 60 * 1000)
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