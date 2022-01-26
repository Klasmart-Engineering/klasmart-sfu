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

async function main() {
    const worker = await createWorker({ logLevel: "debug" });

    const allAddresses = getNetworkInterfacesAddresses();
    const privateAddresses = allAddresses.filter(x => checkIp(x).isRfc1918);
    const publicAddresses = allAddresses.filter(x => checkIp(x).isPublicIp);
    const awsPublicAddress = await getECSTaskENIPublicIP();
    
    const webRtcAddress: MediaSoup.TransportListenIp = {
        ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0",
        announcedIp: 
            process.env.WEBRTC_ANNOUCE_IP ||
            awsPublicAddress ||
            publicAddresses[0] ||
            privateAddresses[0],
    };
    console.log(webRtcAddress);
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
    console.log("🔴 Redis database connected");

    const sfu = new SFU(
        worker,
        [webRtcAddress],
        privateAddress,
        new RedisRegistrar(redis),
    );
    const wsServer = new WsServer(sfu);
    const address = wsServer.startServer(); 
    sfu.endpoint = address;
}
main();