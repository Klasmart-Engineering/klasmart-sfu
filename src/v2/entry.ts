import { getECSTaskENIPublicIP } from "../cloudUtils";
import { WsServer } from "../servers/wsServer";
import { RedisRegistrar } from "./registrar";
import Redis from "ioredis";
import { SFU } from "./sfu";
import { getNetworkInterfacesAddresses } from "../networkInterfaces";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import checkIp from "check-ip";
import { createWorker, types as MediaSoup } from "mediasoup";
import { hostname } from "os";
import { Logger } from "../logger";

async function main() {
    const worker = await createWorker({ logLevel: "debug" });

    const interfaceAddresses = getNetworkInterfacesAddresses();
    const privateAddresses = interfaceAddresses.filter(x => checkIp(x).isRfc1918);
    const publicAddresses = interfaceAddresses.filter(x => checkIp(x).isPublicIp);
    const awsPublicAddress = await getECSTaskENIPublicIP();

    const webRtcAddress: MediaSoup.TransportListenIp = {
        ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0",
        announcedIp:
            process.env.WEBRTC_ANNOUCE_IP ||
            awsPublicAddress ||
            publicAddresses[0] ||
            privateAddresses[0],
    };
    Logger.info(webRtcAddress);
    const privateAddress =
        process.env.PRIVATE_ADDRESS ||
        privateAddresses[0] ||
        hostname();

    const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT) || undefined,
        password: process.env.REDIS_PASS || undefined,
        lazyConnect: true,
        // TODO: reconnectOnError
    });
    await redis.connect();
    Logger.info("🔴 Redis database connected");

    const sfu = new SFU(
        worker,
        [webRtcAddress],
        privateAddress,
        new RedisRegistrar(redis),
    );
    const wsServer = new WsServer(sfu);
    wsServer.http.listen({ port: process.env.PORT }, () => {
        const address = wsServer.http.address();
        Logger.info(`🌎 Server available at (${JSON.stringify(address)})`);
        if (!address || typeof address === "string") { throw new Error("Unexpected address format"); }
        const host = process.env.HTTP_ANNOUNCE_ADDRESS ||
            process.env.HOSTNAME_OVERRIDE ||
            (process.env.USE_IP === "1" ? privateAddresses[0] : undefined) ||
            hostname();
        const uri = `${host}:${address.port}`;
        Logger.info(`Announcing address HTTP traffic for webRTC signaling via redis: ${uri}`);
        sfu.endpoint = uri;
    });

}
main();
