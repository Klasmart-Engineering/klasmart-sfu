import { Cluster, Redis as IORedis } from "ioredis";
import { SfuId } from "./sfu";
import { RoomId } from "./room";
import { ProducerId } from "./track";
import { resolve } from "path";

export type TrackInfo = {
    sfuId: SfuId,
    producerId: ProducerId,
    name?: string,
    sessionId?: string,
};

export type TrackInfoEvent = {
    add: TrackInfo
} | {
    remove: ProducerId
} | {
    sfuId: SfuId
}

export type SfuStatus = {
    endpoint: string
    producers: number
    consumers: number
    lastUpdateTimestamp?: number
}

export type SfuRegistrar = {
    addSfuId(sfuId: SfuId): Promise<void>;
    setSfuStatus(sfuId: SfuId, status: SfuStatus): Promise<void>;
    isHealthy(): boolean;
};

export type TrackRegistrar = {
    addTrack(roomId: RoomId, track: TrackInfo): Promise<void>;
    removeTrack(roomId: RoomId, id: ProducerId): Promise<void>;
    isHealthy(): boolean;
};

export class RedisRegistrar implements SfuRegistrar, TrackRegistrar {
    public async addSfuId(sfuId: SfuId, timestamp = Date.now()) {
        const key = RedisRegistrar.keySfuIds();
        await this.redis.zadd(key, "GT", timestamp, sfuId);
    }

    public async setSfuStatus(sfuId: SfuId, status: SfuStatus) {
        status.lastUpdateTimestamp = Date.now();
        const key = RedisRegistrar.keySfuStatus(sfuId);
        await this.setJsonEncoded(key, status);
    }

    public async addTrack(roomId: RoomId, track: TrackInfo) {
        const key = RedisRegistrar.keyRoomTracks(roomId);
        const value = JSON.stringify(track);
        const count = await this.redis.zadd(key, "GT", Date.now(), value);
        if(typeof count !== "number" || count <= 0) { return; }
        await this.publishTrackEvent(key, { add: track });
    }

    public async removeTrack(roomId: RoomId, id: ProducerId) {
        const key = RedisRegistrar.keyRoomTracks(roomId);
        const count = await this.redis.zrem(key, roomId);
        if(count <= 0) { return; }
        await this.publishTrackEvent(key, { remove: id });
    }

    public isHealthy() {
        return this.redis.status === 'ready';
    }

    public constructor(
        private readonly redis: IORedis | Cluster
    ) {}

    private async publishTrackEvent(key: string, event: TrackInfoEvent) {
        const notificationKey = RedisRegistrar.keyNotification(key);
        await this.redis.xadd(notificationKey, "MAXLEN", "~", 128, "*", "json", JSON.stringify(event));
    }

    private async setJsonEncoded<T>(key: string, value: T, timeout = 15) {
        await this.redis.set(key, JSON.stringify(value), "EX", timeout);
    }

    private static keySfuIds() { return "sfuids"; }
    private static keySfuStatus(sfuId: SfuId) { return `sfu:${sfuId}:status`; }
    private static keyRoomTracks(roomId: RoomId) { return `room:${roomId}:tracks`; }
    private static keyNotification(key: string) { return `${key}:notification`; }
}
