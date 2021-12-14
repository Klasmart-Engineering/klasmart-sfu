import WebSocket from "ws";
import {ClientV2} from "./client";
import {RoomId, Room, newRoomId} from "./room";
import {
    types as MediaSoup
} from "mediasoup";
import {mediaCodecs} from "../config";
import {Cluster, Redis as IORedis} from "ioredis";
import {NewType} from "./newType";
import {nanoid} from "nanoid";
import {Logger} from "../logger";

export class SFU {
    private readonly rooms = new Map<RoomId, Room>();
    private readonly id: SfuId = newSfuId();
    constructor(
        private readonly worker: MediaSoup.Worker,
        private readonly listenIps: MediaSoup.TransportListenIp[],
        private redis: IORedis | Cluster,
    ) {
        this.redisStatus().then(() => {
            Logger.info(`SFU ${this.id} registered in redis with ${JSON.stringify(this.listenIps)}`);
        });
    }

    private async redisStatus() {
        try {
            await this.redis.set(this.id, JSON.stringify(this.listenIps), "EX", 15);
        } catch (e) {
            Logger.error(e);
        } finally {
            setTimeout(() => this.redisStatus(), 5000);
        }
    }

    public async addClient(ws: WebSocket, roomId: string, isTeacher: boolean) {
        const id = newRoomId(roomId);
        let room = this.room(id);
        if (!room) {
            room = await this.createRoom(id);
        }
        const client = new ClientV2(ws, this.listenIps, room, isTeacher);
        room.clients.add(client);

        ws.on("close", () => {
            room?.clients.delete(client); 
            if (room && room.clients.size === 0) {
                room.end();
                this.rooms.delete(id);
            }
        });
    }

    public room(roomId: RoomId) { return this.rooms.get(roomId); }

    private async createRoom(roomId: RoomId) {
        if(this.rooms.has(roomId)) {
            throw new Error(`Room ${roomId} already exists`);
        }
        const router = await this.worker.createRouter({mediaCodecs});
        const room = new Room(router);
        this.rooms.set(roomId, room);
        return room;
    }

    public shutdown() {
        this.worker.close();
    }
}

export type SfuId = NewType<string, "SfuId">
export function newSfuId(id: string = nanoid()) { return id as SfuId; }
