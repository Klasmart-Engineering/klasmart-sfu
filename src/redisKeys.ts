// TODO: Make this a shared library to prevent inconsistency
import {SfuId} from "./v2/sfu";
import {RoomId} from "./v2/room";
import {ProducerId} from "./v2/track";

export class RedisKeys {
    private static room(roomId: string): string {
        return `room:{${roomId}}`;
    }

    public static roomNotify(roomId: string) {
        return { key: `${RedisKeys.room(roomId)}:notify`, ttl: 3600 };
    }

    public static roomAudioMuted(roomId: string) {
        return { key: `${RedisKeys.room(roomId)}:audio:muted`, ttl: 3600 };
    }

    public static roomVideoDisabled(roomId: string) {
        return { key: `${RedisKeys.room(roomId)}:video:disabled`, ttl: 3600 };
    }

    public static roomSfu(roomId: string) {
        return { key: `${RedisKeys.room(roomId)}:sfu`, ttl: 10 };
    }

    public static sfuStatus(sfuId: string) {
        return { key: `sfu:{${sfuId}}:status`, ttl: 5 };
    }

    public static sfuId(id: SfuId) {
        return `sfu:{${id}}`;
    }

    public static onlineSfus() {
        return "sfus";
    }

    public static roomTracks(roomId: RoomId) {
        return `${RedisKeys.room(roomId)}:tracks`;
    }

    public static trackInfo(trackId: ProducerId) {
        return `track:{${trackId}}`;
    }
    public static roomTracksStream(roomId: RoomId) {
        return `${RedisKeys.roomTracks(roomId)}:stream`;
    }
}
