import {gql} from "apollo-server-express";

export const schema = gql`
    type Query {
        ready: Boolean,
        retrieveGlobalMute(roomId: String!): GlobalMuteNotification,
        retrieveMuteStatuses(sessionId: String!): MuteNotification,
    }

    type Mutation {
        rtpCapabilities(rtpCapabilities: String!): Boolean,
        transport(producer: Boolean!, params: String!): Boolean,
        producer(params: String!): String,
        consumer(id: String!, pause: Boolean): Boolean,
        stream(id: String!, producerIds: [String]!): Boolean,
        close(id: String!): Boolean,
        mute(roomId: String!, sessionId: String!, audio: Boolean, video: Boolean): MuteNotification,
        updateGlobalMute(roomId: String!, audioGloballyMuted: Boolean, videoGloballyDisabled: Boolean): GlobalMuteNotification,
        endClass(roomId: String): Boolean
    }

    type Subscription {
        media(roomId: ID!): WebRTCMessage,
    }

    type WebRTCMessage {
        rtpCapabilities: String,
        producerTransport: String,
        consumerTransport: String,
        consumer: String,
        stream: Stream,
        close: String,
        mute: MuteNotification,
    }

    type Stream {
        id: String!,
        sessionId: String!,
        producerIds: [String]!,
    }

    type MuteNotification {
        roomId: String!,
        sessionId: String!,
        audio: Boolean,
        video: Boolean,
    }

    type GlobalMuteNotification {
        roomId: String!,
        audioGloballyMuted: Boolean,
        videoGloballyDisabled: Boolean,
    }
`;
