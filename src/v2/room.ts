import {EventEmitter} from "eventemitter3";
import {createWorker, types as MediaSoup} from "mediasoup";

import {NewType} from "./newType";
import {ProducerId, Track} from "./track";
import {ClientId, ClientV2} from "./client";
import {SfuId} from "./sfu";
import {TrackRegistrar} from "./registrar";
import {Logger} from "../logger";
import {mediaCodecs} from "../config";
import {SemaphoreQueue} from "./semaphoreQueue";

export class Room {
    public readonly semaphoreQueue = SemaphoreQueue.createWithTimeoutProcessor();
    public readonly on: Room["emitter"]["on"] = (event, listener) => this.emitter.on(event, listener);
    public readonly off: Room["emitter"]["off"] = (event, listener) => this.emitter.off(event, listener);
    public readonly once: Room["emitter"]["once"] = (event, listener) => this.emitter.once(event, listener);
    public readonly clients = new Map<ClientId, ClientV2>();

    private constructor(
        public readonly id: RoomId,
        public readonly sfuId: SfuId,
        public readonly worker: MediaSoup.Worker,
        public readonly router: MediaSoup.Router,
        public readonly trackRegistrar: TrackRegistrar
    ) {
        Logger.info(`Room(${this.id}) shard created on SFU(${this.sfuId})`);
    }

    public static async create(
        id: RoomId,
        sfuId: SfuId,
        trackRegistrar: TrackRegistrar
    ) {
        const worker = await createWorker({ logLevel: "debug" });
        worker.on("died", e => console.error("MediaSoup worker died", e));
        const router = await worker.createRouter({mediaCodecs});

        return new Room(id, sfuId, worker, router, trackRegistrar);
    }

    public track(id: ProducerId) {
        const track = this.localTracks.get(id);
        if (!track) { throw new Error(`Track(${JSON.stringify(id)}) not found`); }
        return track;
    }

    public async createTrack(
        owner: ClientId,
        transport: MediaSoup.WebRtcTransport,
        kind: MediaSoup.MediaKind,
        rtpParameters: MediaSoup.RtpParameters,
        name?: string,
        sessionId?: string,
    ) {
        const track = await Track.create(this.router, owner, transport, kind, rtpParameters, name, sessionId);
        this.localTracks.set(track.producerId, track);
        track.on("closed",() => this.onTrackClosed(track));
        this.updateTrackStatus(track).catch((e) => Logger.error(e));
        return track;
    }

    public addClient(client: ClientV2) {
        this.clients.set(client.id, client);
        client.on("close", () => {
            this.clients.delete(client.id);
            if(this.clients.size === 0) { this.end(); }
        });
    }

    public getClient(clientId: ClientId) {
        return this.clients.get(clientId);
    }

    public end() {
        //TODO: Distribute
        this.router.close();
        this.worker.close();
        this.emitter.emit("closed");
    }

    private async updateTrackStatus(track: Track, timeout = 5000) {
        try {
            if(track.closed) { return; }
            if(this.router.closed) { return; }
            setTimeout(() => this.updateTrackStatus(track, timeout), timeout);

            await this.trackRegistrar.addTrack(this.id, {
                sfuId: this.sfuId,
                producerId: track.producerId,
                name: track.name,
                sessionId: track.sessionId,
            });
        } catch (e) {
            Logger.error(e);
        }
    }

    private onTrackClosed(track: Track) {
        Logger.info(`Room(${this.id}).Track(${track.producerId}) closed`);
        this.localTracks.delete(track.producerId);
    }

    private readonly emitter = new EventEmitter<RoomEventMap>();
    private readonly localTracks = new Map<ProducerId, Track>();

    public get numProducers() {
        return Array.from(this.localTracks.values())
            .filter(track => !track.closed)
            .length;
    }

    public get numConsumers() {
        return Array.from(this.localTracks.values())
            .filter(track => !track.closed)
            .reduce((acc, track) => acc + track.numConsumers, 0);
    }
}

export type RoomEventMap = {
    closed: () => void,
}

export type RoomId = NewType<string, "RoomId">;
export function newRoomId(id: string) { return id as RoomId; }
