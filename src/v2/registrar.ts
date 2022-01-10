import {Cluster, Redis as IORedis} from "ioredis";
import {SfuId} from "./sfu";
import {ProducerId} from "./track";
import {RoomId} from "./room";
import {RedisKeys} from "../redisKeys";
import {Logger} from "../logger";

// TODO: Do we still need the group for a track?
export type WebRtcTrack = {
    producerId: ProducerId,
    sfuId: SfuId,
    group: string,
    isPausedForAllConsumers: boolean
};

export interface SfuRegistrar {
    registerSfuAddress(id: SfuId, address: string): Promise<void>;
    registerSfuStatus(id: SfuId): Promise<void>;
}

export interface TrackRegistrar {
    registerTrack(roomId: RoomId, track: WebRtcTrack): Promise<void>;
    updateTrack(roomId: RoomId, track: WebRtcTrack): Promise<void>;
    unregisterTrack(roomId: RoomId, producerId: ProducerId): Promise<void>;
}

export class RedisRegistrar implements SfuRegistrar, TrackRegistrar {
    constructor(private readonly redis: IORedis | Cluster) {}

    public async registerSfuAddress(id: SfuId, address: string) {
        const sfuKey = RedisKeys.sfuId(id);
        const exists = await this.redis.get(sfuKey);
        await this.redis.set(sfuKey, address, "EX", 15);
        if (!exists) {
            Logger.info(`SFU ${id} registered in redis with ${address}`);
        }
    }

    public async registerSfuStatus(id: SfuId) {
        const sfusKey = RedisKeys.onlineSfus();

        await this.redis.zadd(sfusKey, "GT", Date.now(), id);
        // Expire entries not updated in the last minute
        const update = await this.redis.zremrangebyscore(sfusKey, 0, Date.now() - 60 * 1000);
        if (update > 0) {
            Logger.info(`Deleted ${update} outdated SFU entries from redis`);
        }
    }

    public async registerTrack(roomId: RoomId, track: WebRtcTrack) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        // We might want to delete trackIds that are not in use anymore.  However, we don't have
        // any "keepAlive" logic for unpaused tracks, so just leave them in the list for now.
        await this.redis.zadd(roomTracks, "NX", Date.now(), track.producerId);
        // Ensures tracks do not live forever in the event of ungraceful shutdown
        await this.redis.expire(roomTracks, 60 * 60 * 24);
        const trackKey = RedisKeys.trackInfo(track.producerId);
        await this.redis.set(trackKey, JSON.stringify(track), "EX", 60 * 60 * 24);
        const tracksStreamKey = RedisKeys.roomTracksStream(roomId);
        await this.redis.xadd(tracksStreamKey, "*", track.producerId, JSON.stringify(track));
        // Expire streams after 8 hours
        await this.redis.expire(tracksStreamKey, 60 * 60 * 8);
    }

    public async unregisterTrack(roomId: RoomId, producerId: ProducerId) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zrem(roomTracks, producerId);
        await this.redis.expire(roomTracks, 60 * 60 * 24);
        const trackInfoKey = RedisKeys.trackInfo(producerId);
        await this.redis.del(trackInfoKey);
    }

    public async updateTrack(roomId: RoomId, track: WebRtcTrack) {
        const roomTracks = RedisKeys.roomTracks(roomId);
        await this.redis.zadd(roomTracks, "XX", "GT", Date.now(), track.producerId);
        await this.redis.expire(roomTracks, 60 * 60 * 24);
        await this.registerTrack(roomId, track);
    }
}

export const MockRegistrar: TrackRegistrar & SfuRegistrar = {
    /* eslint-disable @typescript-eslint/no-empty-function */
    registerTrack: async () => {},
    unregisterTrack: async () => {},
    updateTrack: async () => {},
    registerSfuAddress: async () => {},
    registerSfuStatus: async () => {},
    /* eslint-enable @typescript-eslint/no-empty-function */
};
