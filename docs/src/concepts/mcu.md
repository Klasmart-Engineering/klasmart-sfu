# Multipoint Control Units (MCU)

An important thing to note about the previous section on [SFUs](./sfu.md) is that the SFU does not itself do *any* decoding or encoding of the media streams.  This is because these operations are extremely computationally expensive.  To decode or encode media typically has a 1:1 ratio with the length of the media (1s of computation to encode 1s of video).  

A multipoint control unit (MCU) is a server that decodes the received media and re-encodes (transcodes) it for consumption for another client or service.  An MCU can focus solely on transcoding media or can also function like an SFU, routing the transcoded media to the appropriate clients.  

While the extra expense of an MCU is high, there are a number of scenarios where it can assist in scaling an online videoconference.  

## Low Capability Hardware

The first scenario is the situation where some participants possess significantly low capability hardware, such as a 5-7 year old smart phone.  In developing nations, it is extremely common for older generation or very cheap technology to be widely used.  To better serve these users, we can use an MCU to take more advanced codecs from other users and transcode them down into a resolution and format more usable on lower-spec devices.  

Additionally, we can use an MCU to combine multiple video streams into one, which can be separated on the client side to reduce the amount of decoding required.  This can better compress the video and reduce both computational and network resource usage.  