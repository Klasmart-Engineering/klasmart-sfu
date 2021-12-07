import {
    types as MediaSoup
} from "mediasoup";
import { NewType } from "./newType";
import { Track } from "./track";
import { ClientV2, ClientId } from "./client";
import { ProducerId } from "./track";

export class Room {
    public readonly clients = new Set<ClientV2>();
    constructor(
        public readonly router: MediaSoup.Router,
    ) { }

    private readonly tracks = new Map<ProducerId, Track>();
    
    public track(id: ProducerId) {
        const track = this.tracks.get(id);
        if (!track) { throw new Error(`Track ${id} not found`); }
        return track;
    }

    public async createTrack(owner: ClientId, transport: MediaSoup.WebRtcTransport, kind: MediaSoup.MediaKind, rtpParameters: MediaSoup.RtpParameters) {
        const track = await Track.create(this.router, owner, transport, kind, rtpParameters);
        const id = track.producerId;
        this.tracks.set(id, track);
        track.on("closed",() => this.tracks.delete(id));
        return track;
    }

    public end() {
        this.router.close();
    }
}
export type RoomId = NewType<string, "RoomId">
export function newRoomId(id: string) { return id as RoomId; }
