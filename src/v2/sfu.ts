import { types as MediaSoup } from "mediasoup";
import { nanoid } from "nanoid";

import {ClientId, ClientV2} from "./client";
import { RoomId, Room } from "./room";
import { NewType } from "./newType";
import { SfuRegistrar, TrackRegistrar } from "./registrar";
import { Logger } from "../logger";

export class SFU {
    public readonly id: SfuId = newSfuId(nanoid());
    private readonly rooms = new Map<RoomId, Room>();
    constructor(
        public readonly listenIps: MediaSoup.TransportListenIp[],
        public endpoint: string,
        private registrar: SfuRegistrar & TrackRegistrar
    ) {
        Logger.info(`SFU(${this.id}) created`);
        this.updateStatus().catch((e) => Logger.error(e));
    }

    private async updateStatus(timeout = 5000) {
        try {
            setTimeout(() => this.updateStatus(), timeout);

            const numProducers = Array.from(this.rooms.values())
                .reduce((acc, room) => acc + room.numProducers, 0);
            const numConsumers = Array.from(this.rooms.values())
                .reduce((acc, room) => acc + room.numConsumers, 0);

            await this.registrar.addSfuId(this.id);
            await this.registrar.setSfuStatus(this.id, {
                endpoint: this.endpoint,
                producers: numProducers,
                consumers: numConsumers,
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

    public getClient(roomId: RoomId, clientId: ClientId) {
        const room = this.rooms.get(roomId);
        if (!room) { return; }
        return room.getClient(clientId);
    }

    public getRoom(roomId: RoomId): Room {
        const room = this.rooms.get(roomId);
        if (!room) { throw new Error(`Room ${roomId} not found`); }
        return room;
    }

    private async createRoom(roomId: RoomId) {
        if(this.rooms.has(roomId)) { throw new Error(`Room(${roomId}) already exists`); }
        const room = await Room.create(roomId, this.id, this.registrar);
        this.rooms.set(room.id, room);
        room.on("closed", () => this.rooms.delete(room.id));
        return room;
    }
}

export type SfuId = NewType<string, "SfuId">;
export function newSfuId(id: string) { return id as SfuId; }
