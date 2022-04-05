import {Logger} from "./logger";
import fetch from "node-fetch";
import {setClusterId} from "./reporting";
import ECS from "aws-sdk/clients/ecs";
import EC2 from "aws-sdk/clients/ec2";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import checkIp from "check-ip";

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
