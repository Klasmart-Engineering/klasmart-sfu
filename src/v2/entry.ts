import { Logger } from "../logger";
process.on("uncaughtException",  (err) => { Logger.error("uncaughtException",err); });

import { getECSTaskENIPublicIP } from "../cloudUtils";
import { Sfu2HttpServer } from "../servers/sfu2HttpServer";
import { RedisRegistrar } from "./registrar";
import Redis, {Cluster, Redis as IORedis} from "ioredis";
import { SFU } from "./sfu";
import { getNetworkInterfacesAddresses } from "../networkInterfaces";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import checkIp from "check-ip";
import { types as MediaSoup } from "mediasoup";
import { hostname } from "os";
import { collectDefaultMetrics } from "prom-client";
import dotenv from "dotenv";

async function main() {
    dotenv.config();
    collectDefaultMetrics();
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
    Logger.info(JSON.stringify(webRtcAddress));
    const privateAddress =
        process.env.PRIVATE_ADDRESS ||
        privateAddresses[0] ||
        hostname();

    const redisMode: string = process.env.REDIS_MODE ?? "NODE";
    const port = Number(process.env.REDIS_PORT ?? 6379);
    const host = process.env.REDIS_HOST;
    const password = process.env.REDIS_PASS;
    const lazyConnect = true;
    let redis: IORedis | Cluster;

    if (redisMode === "CLUSTER") {
        redis = new Cluster([
            {
                port,
                host
            }
        ],
        {
            lazyConnect,
            redisOptions: {
                password
            }
        });
    } else {
        redis = new Redis({
            host,
            port,
            password,
            lazyConnect: true,
            reconnectOnError: (err) => err.message.includes("READONLY"),
        });
    }
    await redis.connect();
    Logger.info("🔴 Redis database connected");

    const sfu = new SFU(
        [webRtcAddress],
        privateAddress,
        new RedisRegistrar(redis),
    );
    const wsServer = new Sfu2HttpServer(sfu);
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
