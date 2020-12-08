// TODO: Make this a shared library to prevent inconsistency
export class RedisKeys {
    private static room(roomId: string): string {
        return `room:${roomId}`;
    }

    public static roomNotify(roomId: string) {
        return { key: `${RedisKeys.room(roomId)}:notify`, ttl: 3600 };
    }

    public static roomSfu(roomId: string) {
        return { key: `${RedisKeys.room(roomId)}:sfu`, ttl: 10 };
    }

    public static sfuStatus(sfuId: string) {
        return { key: `sfu:${sfuId}:status`, ttl: 5 };
    }
}
