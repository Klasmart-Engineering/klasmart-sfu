import newrelic from "newrelic";
import dotenv from "dotenv";
import { SFU } from "./sfu";
import { checkIssuers } from "./auth";
import { reportConferenceStats } from "./reporting";
import { collectDefaultMetrics } from "prom-client";
import { Logger } from "./logger";
import { createGauges, getECSTaskENIPublicIP, getIPAddress } from "./cloudUtils";
import { ApolloNetworkInterface } from "./servers/apollo";
import { HttpServer } from "./servers/httpServer";
import { WsServer } from "./servers/wsServer";
import { createWorker } from "mediasoup";
import { SFU as SFU2 } from "./v2/sfu";

function attachSignalHandlers() {
    /* Add shutdown listeners to forward New Relic metrics prior to app death */
    process.on("SIGTERM", () => {
        newrelic.shutdown({
            collectPendingData: true
        });
    });
    process.on("exit", () => {
        newrelic.shutdown({
            collectPendingData: true
        });
    });
}

async function main() {
    dotenv.config();
    collectDefaultMetrics({});
    checkIssuers();

    const ip = (await getECSTaskENIPublicIP()) || getIPAddress();
    if (!ip) {
        Logger.error("No network interface found");
        process.exit(-4);
    }
    Logger.info(`ip address ${ip}`);
    attachSignalHandlers();

    const useApollo = process.env.USE_APOLLO;
    if (useApollo) {
        Logger.info("USE_APOLLO is set, using Apollo Server");
        const sfu = await SFU.create(ip);
        setTimeout(() => {
            reportConferenceStats(sfu);
        }, 10000);

        createGauges(sfu);

        const httpServer = new HttpServer();
        const apolloNetworkInterface = new ApolloNetworkInterface(sfu, httpServer);

        const uri = httpServer.startServer(ip, apolloNetworkInterface.server.graphqlPath);

        await sfu.claimRoom(uri);
    } else {
        Logger.warn("USE_APOLLO is not set, using websocket server");
        const worker = await createWorker({
            logLevel: "warn",
            rtcMinPort: getConfigPortNumber("RTC_PORT_RANGE_MIN", 10000),
            rtcMaxPort: getConfigPortNumber("RTC_PORT_RANGE_MAX", 59999),
        });
        const announcedIp = process.env.WEBRTC_ANNOUCE_IP || process.env.PUBLIC_ADDRESS || ip;
        const sfu = new SFU2(worker, [{ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0", announcedIp }]);
        const wsServer = new WsServer(sfu);
        wsServer.startServer(ip);
    }
}

main().catch(e => {
    Logger.error(e);
    process.exit(-1);
});

function getConfigPortNumber<T=undefined>(variableName:string, defaultValue: T) {
    const variableValue = process.env[variableName];
    if(variableValue) {
        const port = Number.parseInt(variableValue);
        if(port > 0 && port < 65535) {
            Logger.info(`'${variableName}': ${port}`);
            return port;
        }
        Logger.warn(`Warning attempted to set '${variableName}' to invalid value '${variableValue}'`);
    }
    Logger.warn(`'${variableName}' set to default value '${defaultValue}'`);
    return defaultValue;
}
