import {Cluster, Redis as IORedis} from "ioredis";
import {SfuId} from "./sfu";
import {ProducerId} from "./track";
import {RoomId} from "./room";
import {RedisKeys} from "../redisKeys";
import {Logger} from "../logger";

export type WebRtcTrack = {
    producerId: ProducerId,
    sfuId: SfuId,
    group: string,
    isPausedForAllConsumers: boolean
};

export interface Registrar {
    registerSfuAddress(id: SfuId, address: string): Promise<void>;
    registerSfuStatus(id: SfuId): Promise<void>;
    registerTrack(roomId: RoomId, producerId: ProducerId, sfuId: SfuId, group: string, isPausedForAllConsumers?: boolean): Promise<void>;
    updateTrack(roomId: RoomId, producerId: ProducerId, sfuId: SfuId, group: string, isPausedForAllConsumers: boolean): Promise<void>;
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

    public async registerTrack(roomId: RoomId, producerId: ProducerId, sfuId: SfuId, group: string, isPausedForAllConsumers = false) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zadd(roomTracks, "NX", Date.now(), producerId);
        const trackInfoKey = RedisKeys.trackInfo(producerId);
        const trackInfo: WebRtcTrack = {
            producerId,
            sfuId,
            group,
            isPausedForAllConsumers
        };
        await this.redis.set(trackInfoKey, JSON.stringify(trackInfo), "EX", 60 * 60 * 24);
    }

    public async unregisterTrack(roomId: RoomId, producerId: ProducerId) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zrem(roomTracks, producerId);
        const trackInfoKey = RedisKeys.trackInfo(producerId);
        await this.redis.del(trackInfoKey);
    }

    public async updateTrack(roomId: RoomId, producerId: ProducerId, sfuId: SfuId, group: string, isPausedForAllConsumers: boolean) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zadd(roomTracks, "XX", "GT", Date.now(), producerId);
        await this.registerTrack(roomId, producerId, sfuId, group, isPausedForAllConsumers);
    }
}
