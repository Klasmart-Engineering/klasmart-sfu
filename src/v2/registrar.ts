import {Cluster, Redis as IORedis} from "ioredis";
import {SfuId} from "./sfu";
import {ProducerId} from "./track";
import {RoomId} from "./room";
import {RedisKeys} from "../redisKeys";
import {Logger} from "../logger";

export interface Registrar {
    registerSfuAddress(id: SfuId, address: string): Promise<void>;
    registerSfuStatus(id: SfuId): Promise<void>;
    registerTrack(roomId: RoomId, producerId: ProducerId): Promise<void>;
    updateTrack(roomId: RoomId, producerId: ProducerId): Promise<void>;
    unregisterTrack(roomId: RoomId, producerId: ProducerId): Promise<void>;
}

export class RedisRegistrar implements Registrar {
    constructor(private readonly redis: IORedis | Cluster) {}

    public async registerSfuAddress(id: SfuId, address: string) {
        const sfuKey = RedisKeys.sfuId(id);
        await this.redis.set(sfuKey, address, "EX", 15);
    }

    public async registerSfuStatus(id: SfuId): Promise<void> {
        const sfusKey = RedisKeys.onlineSfus();

        await this.redis.zadd(sfusKey, "GT", Date.now(), id);
        // Expire entries not updated in the last minute
        const update = await this.redis.zremrangebyscore(sfusKey, 0, Date.now() - 60 * 1000);
        if (update > 0) {
            Logger.info(`Deleted ${update} outdated SFU entries from redis`);
        }
    }

    public async registerTrack(roomId: RoomId, producerId: ProducerId) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zadd(roomTracks, Date.now(), producerId);
    }

    public async unregisterTrack(roomId: RoomId, producerId: ProducerId) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zrem(roomTracks, producerId);
    }

    public async updateTrack(roomId: RoomId, producerId: ProducerId) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zadd(roomTracks, "XX", "GT", Date.now(), producerId);
    }
}
