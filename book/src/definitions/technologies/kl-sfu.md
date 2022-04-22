# KidsLoop SFU

The KidsLoop SFU is a service built using [mediasoup](./mediasoup.md) and [WebRTC](./webrtc.md) to provide a live streaming 
experience for students and teachers.  

## API

The SFU is accessed via two methods:
- [WebSocket](./websocket.md) for signaling instructions.  WebSocket connections are proxied via the [SFU Gateway](./kl-sfu-gate.md).
- WebRTC via the mediasoup library

### WebSocket API

Each request over WebSocket must have the following form:
```json 
{
    id: RequestId,
    request: Request,
}
```
where `RequestId` is a unique identifier for the request, and `Request` is the request itself.

A `Request` is a JSON object with the following fields:
```json
{
    "getRouterRtpCapabilities": {},
    "createProducerTransport": {},
    "connectProducerTransport": TransportConnectRequest,
    "produceTrack": ProduceTrackRequest,

    "setRtpCapabilities": MediaSoup.RtpCapabilities,
    "createConsumerTransport": {},
    "connectConsumerTransport": TransportConnectRequest,
    "consumeTrack": ConsumeTrackRequest,

    "pause": PauseRequest,
    "pauseForEveryone": PauseRequest,
    "endRoom": {}
}
```
A field with a type of `{}` indicates that the value of the field is defined (but not used) by the protocol.
Each request will only process one of the supplied fields.  If additional fields are supplied, they will be ignored.

Likewise, responses for each of the above requests are as defined:
```json
{
    "id": RequestId,
    "error": string,
} | {
    "id": RequestId,
    "result": Result | void,
}
```
where the presence of a `result` field indicates success, and the `error` field indicates failure.  
The `id` field is the same as the `id` field of the request.

A `Result` is a JSON object with the following possible fields:
```json
{
    "routerRtpCapabilities": MediaSoup.RtpCapabilities,
    "producerTransportCreated": WebRtcTransportResult,
    "producerCreated": {
        "producerId": ProducerId,
        "pausedGlobally": boolean,
    },

    "consumerTransportCreated": WebRtcTransportResult,
    "consumerCreated": {
        "id": ConsumerId,
        "producerId": ProducerId,
        "kind": MediaSoup.MediaKind,
        "rtpParameters": MediaSoup.RtpParameters,
    }
}
```
Only one of the fields will be present in any given `Result`.  For some responses, the `result` field will be `void` and 
no data will present.  This is to indicate that the response is a success and no data needs to be returned.

### Additional messages

In addition to responding to requests, the SFU will also send messages on certain events to the client.

#### pausedByProducingUser

Emitted when a track is paused by its producer (source):
```json
{
    "pausedSource": {
        "producerId": ProducerId,
        "paused": boolean
    }
}
```

#### pausedGlobally

Emitted when a track is paused by a teacher (globally):
```json 
{
    "pausedGlobally": {
        "producerId": ProducerId,
        "paused": boolean
    }
}
```

#### consumerClosed

Emitted when a consumer is closed:

```json
{
  "consumerClosed": ProducerId
}
```

#### producerClosed

Emitted when a producer is closed:

```json
{
  "producerClosed": ProducerId
}
```

#### consumerTransportClosed

Emitted when the WebRTC transport for a consumer is closed:

```json
{
  "consumerTransportClosed": {}
}
```

#### producerTransportClosed

Emitted when the WebRTC transport for a producer is closed:

```json
{
  "producerTransportClosed": {}
}
```
