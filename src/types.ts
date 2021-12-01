import {JWT} from "./auth";

export type MuteNotification = {
    roomId: string
    sessionId: string
    audio?: boolean
    video?: boolean
}

export type GlobalMuteNotification = {
    roomId: string,
    sessionId: string,
    audioGloballyMuted?: boolean,
    videoGloballyDisabled?: boolean,
}

export type Context = {
    roomId: string,
    sessionId: string,
    token: JWT
}
