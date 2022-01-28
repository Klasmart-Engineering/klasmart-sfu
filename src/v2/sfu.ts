import { types as MediaSoup } from "mediasoup";
import { nanoid } from "nanoid";

import { ClientV2 } from "./client";
import { RoomId, Room } from "./room";
import { NewType } from "./newType";
import { SfuRegistrar, TrackRegistrar } from "./registrar";
import { mediaCodecs } from "../config";
import { Logger } from "../logger";

export class SFU {
    public readonly id: SfuId = newSfuId(nanoid());
    private readonly rooms = new Map<RoomId, Room>();
    constructor(
        private readonly worker: MediaSoup.Worker,
        public readonly listenIps:MediaSoup.TransportListenIp[],
        public /*readonly*/ endpoint: string,
        private registrar: SfuRegistrar & TrackRegistrar
    ) {
        Logger.info(`SFU(${this.id}) created`);
        this.updateStatus();
    }

    private async updateStatus(timeout = 5000) {
        try {
            if(this.worker.closed) { return; }
            setTimeout(() => this.updateStatus(), timeout);

            await this.registrar.addSfuId(this.id);
            await this.registrar.setSfuStatus(this.id, {
                endpoint: this.endpoint,
            });
        } catch (e) {
            // istanbul ignore next
            Logger.error(e);
        }
    }

    public async createClient(userId: string, roomId: RoomId, isTeacher: boolean) {
        let room = this.rooms.get(roomId);
        if (!room) { room = await this.createRoom(roomId); }
        const client = new ClientV2(userId, this, room, isTeacher);
        room.addClient(client);
        return client;
    }

    private async createRoom(roomId: RoomId) {
        if(this.rooms.has(roomId)) { throw new Error(`Room(${roomId}) already exists`); }
        const router = await this.worker.createRouter({mediaCodecs});
        const room = new Room(roomId, this.id, router, this.registrar);
        this.rooms.set(room.id, room);
        room.on("closed", () => this.rooms.delete(room.id));
        return room;
    }

    public shutdown() {
        this.worker.close();
    }
}

export type SfuId = NewType<string, "SfuId">;
export function newSfuId(id: string) { return id as SfuId; }
