import { Cluster, Redis as IORedis } from "ioredis";
import { newSfuId, SfuId } from "./sfu";
import { RoomId } from "./room";
import { ProducerId } from "./track";

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
    producers?: number
    consumers?: number
    lastUpdateTimestamp?: number
}

export interface SfuRegistrar {
    addSfuId(sfuId: SfuId): Promise<void>;
    removeSfuId(sfuId: SfuId): Promise<void>;
    getSfuIds(): Promise<SfuId[]>;

    getSfuStatus(sfuId: SfuId): Promise<SfuStatus|undefined>;
    setSfuStatus(sfuId: SfuId, status: SfuStatus): Promise<void>;
}

export interface TrackRegistrar {
    addTrack(roomId: RoomId, track: TrackInfo): Promise<void>
    removeTrack(roomId: RoomId, id: ProducerId): Promise<void>
    getTracks(roomId: RoomId): Promise<TrackInfo[]>

    waitForTrackChanges(roomId: RoomId, cursor?: string): Promise<{cursor?: string, events?: TrackInfoEvent[]}>
}

export class RedisRegistrar implements SfuRegistrar, TrackRegistrar {
    public async getRandomSfuId() {
        const sfuIds = await this.getSfuIds();
        const randomIndex = Math.floor(Math.random()*sfuIds.length);
        const sfuId = sfuIds[randomIndex];
        return sfuId;
    }

    public async getSfuAddress(sfuId: SfuId) {
        const status = await this.getSfuStatus(sfuId);
        return status?.endpoint;
    }

    public async addSfuId(sfuId: SfuId, timestamp = Date.now()) {
        const key = RedisRegistrar.keySfuIds();
        await this.redis.zadd(key, "GT", timestamp, sfuId);
    }

    public async removeSfuId(sfuId: SfuId) {
        const key = RedisRegistrar.keySfuIds();
        await this.redis.zrem(key, sfuId);
    }

    public async getSfuIds() {
        const key = RedisRegistrar.keySfuIds();

        const oldestTimestamp = Date.now() - 15 * 1000;
        const numberDeleted = await this.redis.zremrangebyscore(key, 0, oldestTimestamp);
        if (numberDeleted > 0) { console.info(`Deleted ${numberDeleted} outdated entries from '${key}'`); }

        const list = await this.getSortedSet(key);
        return list.map(id => newSfuId(id));
    }

    public async setSfuStatus(sfuId: SfuId, status: SfuStatus) {
        status.lastUpdateTimestamp = Date.now();
        const key = RedisRegistrar.keySfuStatus(sfuId);
        await this.setJsonEncoded(key, status);
    }

    public async getSfuStatus(sfuId: SfuId) {
        const key = RedisRegistrar.keySfuStatus(sfuId);
        return await this.getJsonEncoded<SfuStatus>(key);
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
        if(typeof count !== "number" || count <= 0) { return; }
        await this.publishTrackEvent(key, { remove: id });
    }

    public async getTracks(roomId: RoomId) {
        const key = RedisRegistrar.keyRoomTracks(roomId);

        const oldestTimestamp = Date.now() - 15 * 1000;
        const numberDeleted = await this.redis.zremrangebyscore(key, 0, oldestTimestamp);
        if (numberDeleted > 0) { console.info(`Deleted ${numberDeleted} outdated entries from '${key}'`); }

        const list = await this.getSortedSet(key);
        console.log(list);
        return list.flatMap(track => JsonParse<TrackInfo>(track) || []);
    }

    public async waitForTrackChanges(roomId: RoomId, cursor="0") {
        const redis = this.redis.duplicate();
        try {
            const key = RedisRegistrar.keyNotification(RedisRegistrar.keyRoomTracks(roomId));
            const readResult = await redis.xread("BLOCK", 10000, "STREAMS", key, cursor);

            if (!readResult) { return { cursor }; }

            const [ [ , streamItems ] ] = readResult;
            return {
                cursor: streamItems[streamItems.length-1][0],
                events: streamItems.flatMap(([,keyValues]) =>
                    deserializeRedisStreamFieldValuePairs<TrackInfoEvent>(keyValues) ?? []
                ),
            };
        } finally {
            redis.disconnect();
        }
    }

    public constructor(
        private readonly redis: IORedis | Cluster
    ) {}

    private async publishTrackEvent(key: string, event: TrackInfoEvent) {
        const notificationKey = RedisRegistrar.keyNotification(key);
        await this.redis.xadd(notificationKey, "MAXLEN", "~", 128, "*", "json", JSON.stringify(event));
    }

    private async setJsonEncoded<T=unknown>(key: string, value: T, timeout = 15) {
        await this.redis.set(key, JSON.stringify(value), "EX", timeout);
    }

    private async getJsonEncoded<T=unknown>(key: string) {
        try {
            const status = await this.redis.get(key);
            if(status) { return JSON.parse(status) as T; }
        } catch(e) {
            console.error(e);
        }
        return;
    }

    private async getSortedSet(key: string) {
        const results: string[] = [];
        let cursor = "0";
        do {
            const [nextCursor, items] = await this.redis.zscan(key, cursor);
            for(let i = 0; i+1 < items.length; i+=2) { results.push(items[i]); }
            cursor = nextCursor;
        } while(cursor !== "0");
        return results;
    }

    private static keySfuIds() { return "sfuids"; }
    private static keySfuStatus(sfuId: SfuId) { return `sfu:${sfuId}:status`; }
    private static keyRoomTracks(roomId: RoomId) { return `room:${roomId}:tracks`; }
    private static keyNotification(key: string) { return `${key}:notification`; }

    /* Legacy behavior for sfu v1 */
    public async getLegacySfuAddressByRoomId(roomId: string) {
        const key = RedisRegistrar.roomSfu(roomId);
        const address = await this.redis.get(key);
        if(!address) { return; }
        return address;
    }

    public static roomSfu (roomId: string) { return `room:${roomId}:sfu`; }
}

function deserializeRedisStreamFieldValuePairs<T=unknown>(fieldValues: string[]) {
    for(let i = 0; i+1 < fieldValues.length; i+=2) {
        if(fieldValues[i] !== "json") { continue; }
        const value = JsonParse<T>(fieldValues[i+1]);
        if(value !== undefined) { return value; }
    }
    return undefined;
}

function JsonParse<T=unknown>(serialized: string) {
    try {
        return JSON.parse(serialized) as T;
    } catch(e) {
        console.error(`Failed to deserialize value: ${e}`);
        return undefined;
    }
}
