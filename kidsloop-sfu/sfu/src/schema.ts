import {gql} from "apollo-server";

export const schema = gql`
    type Query {
        ready: Boolean,
    }

    type Mutation {
        rtpCapabilities(rtpCapabilities: String!): Boolean,
        transport(producer: Boolean!, params: String!): Boolean,
        producer(params: String!): String,
        consumer(id: String!, pause: Boolean): Boolean,
        stream(id: String!, producerIds: [String]!): Boolean,
        close(id: String!): Boolean,
        mute(roomId: String!, sessionId: String!, producerId: String, consumerId: String, audio: Boolean, video: Boolean): Boolean
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
        producerId: String,
        consumerId: String,
        audio: Boolean,
        video: Boolean,
    }
`;

export interface MuteNotification {
    roomId: string
    sessionId: string
    producerId?: string
    consumerId?: string
    audio?: boolean
    video?: boolean
}
