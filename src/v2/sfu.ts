import {RoomId, Room} from "./room";
import {
    types as MediaSoup
} from "mediasoup";
import {mediaCodecs} from "../config";
import {NewType} from "./newType";
import {nanoid} from "nanoid";
import {Logger} from "../logger";
import {SfuRegistrar, TrackRegistrar} from "./registrar";
import { ClientV2 } from "./client";

export class SFU {
    public readonly id: SfuId = newSfuId(nanoid());
    private readonly rooms = new Map<RoomId, Room>();
    constructor(
        private readonly worker: MediaSoup.Worker,
        public readonly listenIps:MediaSoup.TransportListenIp[],
        private registrar: SfuRegistrar & TrackRegistrar
    ) {
        this.updateStatus();
    }

    private async updateStatus() {
        try {
            await this.registrar.registerSfuAddress(this.id, JSON.stringify(this.listenIps));
            await this.registrar.registerSfuStatus(this.id);
        } catch (e) {
            Logger.error(e);
        } finally {
            setTimeout(() => this.updateStatus(), 5000);
        }
    }

    public async createClient(roomId: RoomId, isTeacher: boolean, ) {
        let room = this.rooms.get(roomId);
        if (!room) { room = await this.createRoom(roomId); }
        const client = new ClientV2(
            this,
            this.registrar,
            room,
            isTeacher,
        );
        room.addClient(client);
        return client;
    }

    private async createRoom(roomId: RoomId) {
        if(this.rooms.has(roomId)) {
            throw new Error(`Room ${roomId} already exists`);
        }
        const router = await this.worker.createRouter({mediaCodecs});
        const room = new Room(
            roomId,
            router,
            ({id}) => this.rooms.delete(id)
        );
        this.rooms.set(roomId, room);
        return room;
    }

    public shutdown() {
        this.worker.close();
    }
}

export type SfuId = NewType<string, "SfuId">;
export function newSfuId(id: string) { return id as SfuId; }
