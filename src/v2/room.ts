import {
    types as MediaSoup
} from "mediasoup";
import { NewType } from "./newType";
import { TrackId, Track } from "./track";
import { ClientV2 } from "./client";

export class Room {
    public readonly clients = new Set<ClientV2>();
    constructor(
        public readonly router: MediaSoup.Router,
    ) { }

    private readonly tracks = new Map<TrackId, Track>();
    public track(trackId: TrackId) {
        const track = this.tracks.get(trackId);

        // In all cases, if you are trying to do something with a track that doesn't exist,
        // you can't recover from it.
        if (!track) {
            throw new Error(`Track ${trackId} not found`);
        }

        return track;
    }
    public addTrack(id: TrackId, track: Track) {
        // Don't silently replace a track.
        if (this.tracks.has(id)) {
            throw new Error(`Track ${id} already exists`);
        }

        this.tracks.set(id, track);
    }

    public removeTrack(id: TrackId) {
        this.tracks.delete(id);
    }

    public end() {
        this.router.close();
    }
}
export type RoomId = NewType<string, "RoomId">
export function newRoomId(id: string) { return id as RoomId; }
