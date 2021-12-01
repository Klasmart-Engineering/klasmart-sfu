import {Logger} from "./logger";
import fetch from "node-fetch";
import {setClusterId, setDockerId} from "./reporting";
import ECS from "aws-sdk/clients/ecs";
import EC2 from "aws-sdk/clients/ec2";
import {NetworkInterfaceInfo} from "os";
import {getNetworkInterfaceInfo} from "./networkInterfaces";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import checkIp from "check-ip";
import {SFU} from "./sfu";
import {Gauge} from "prom-client";

export async function getECSTaskENIPublicIP() {
    const ECSClient = new ECS();
    const EC2Client = new EC2();

    const ecsMetadataURI = process.env.ECS_CONTAINER_METADATA_URI_V4 || process.env.ECS_CONTAINER_METADATA_URI;
    if (!ecsMetadataURI) {
        return;
    }
    Logger.info(ecsMetadataURI);
    const response = await fetch(`${ecsMetadataURI}`);
    // TODO: Type this response
    const ecsMetadata: any = await response.json();
    setDockerId(ecsMetadata.DockerId);
    const clusterARN = ecsMetadata.Labels && ecsMetadata.Labels["com.amazonaws.ecs.cluster"] as string;
    setClusterId(clusterARN);
    const taskARN = ecsMetadata.Labels && ecsMetadata.Labels["com.amazonaws.ecs.task-arn"] as string;
    if (!taskARN) {
        return;
    }
    const tasks = await ECSClient.describeTasks({ cluster: clusterARN, tasks: [taskARN] }).promise();
    if (!tasks.tasks) {
        return;
    }
    for (const task of tasks.tasks) {
        if (!task.attachments) {
            continue;
        }
        for (const attachment of task.attachments) {
            if (attachment.type !== "ElasticNetworkInterface") {
                continue;
            }
            if (attachment.status === "DELETED") {
                continue;
            }
            if (!attachment.details) {
                continue;
            }
            for (const detail of attachment.details) {
                if (detail.name !== "networkInterfaceId") {
                    continue;
                }
                if (!detail.value) {
                    continue;
                }
                const enis = await EC2Client.describeNetworkInterfaces({ NetworkInterfaceIds: [detail.value] }).promise();
                if (!enis.NetworkInterfaces) {
                    continue;
                }
                for (const eni of enis.NetworkInterfaces) {
                    if (!eni.Association) {
                        continue;
                    }
                    if (!eni.Association.PublicIp) {
                        continue;
                    }
                    return eni.Association.PublicIp;
                }
            }
        }
    }
    return;
}

export function getIPAddress() {
    //Sort network interfaces to prioritize external and IPv4 addresses
    function scoreInterface(info: NetworkInterfaceInfo) {
        const check: any = checkIp(info.address);
        let score = 0;
        if (check.isPublic) {
            score += 4;
        }
        if (!info.internal) {
            score += 2;
        }
        if (info.family === "IPv4") {
            score += 1;
        }
        return score;
    }

    const interfaces = getNetworkInterfaceInfo();
    interfaces.sort((a, b) => scoreInterface(b) - scoreInterface(a));
    Logger.info(JSON.stringify(interfaces));
    if (interfaces.length <= 0) {
        return;
    }
    return interfaces[0].address;
}

export function createGauges(sfu: SFU) {
    return new Gauge({
        name: "sfuCount",
        help: "Number of SFUs currently connected to the same redis db (shard?)",
        labelNames: ["type"],
        async collect() {
            try {
                const {
                    availableCount,
                    otherCount,
                } = await sfu.sfuStats();
                this.labels("available").set(availableCount);
                this.labels("unavailable").set(otherCount);
                this.labels("total").set(availableCount + otherCount);
            } catch (e) {
                this.labels("available").set(-1);
                this.labels("unavailable").set(-1);
                this.labels("total").set(-1);
                console.log(e);
            }
        },
    });
}
