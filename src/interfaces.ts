export interface MuteNotification {
    roomId: string
    sessionId: string
    audio?: boolean
    video?: boolean
}

export interface GlobalMuteNotification {
    roomId: string,
    sessionId: string,
    audioGloballyMuted?: boolean,
    videoGloballyDisabled?: boolean,
}
