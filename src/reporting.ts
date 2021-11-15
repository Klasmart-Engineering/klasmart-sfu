import Cloudwatch from "aws-sdk/clients/cloudwatch"
import { Logger } from "./entry";
import newrelic from 'newrelic';
import {
    types as MediaSoup,
} from "mediasoup";
import {SFU} from "./sfu";
const CloudwatchClient = new Cloudwatch({
    region: process.env.AWS_REGION
})

let _dockerId = "UnknownDockerId"
export function setDockerId(dockerId: string) {
    _dockerId = dockerId
}

let _cluster = "UknownClusterId"
export function setClusterId(clusterId: string) {
    _cluster = clusterId
}

let _graphQlConnections: number = 0
export function setGraphQLConnections(count: number) {
    _graphQlConnections = count
}

let producersCreated: number = 0
export function incrementProducerCount() { producersCreated++ }
export function decrementProducerCount() { producersCreated-- }

let consumersCreated: number = 0
export function incrementConsumerCount() { consumersCreated++ }
export function decrementConsumerCount() { consumersCreated-- }


//Used for autoscaling to know how many servers are standing by available to be assigned to a class
let _available = 0
export function setAvailable(available: boolean) {
    _available = available ? 1 : 0
}


const reportIntervalMs = 5000
async function reporting(invokeTime = Date.now()) {
    try {

        newrelic.recordMetric('producersCreated', producersCreated);
        newrelic.recordMetric('consumersCreated', consumersCreated);
        newrelic.recordMetric('graphQlConnections', _graphQlConnections);
        newrelic.recordMetric('available', _available);
        newrelic.recordMetric('online', 1)

        await CloudwatchClient.putMetricData({
            Namespace: "kidsloop/live/sfu", MetricData: [
                {
                    MetricName: "producers",
                    Value: producersCreated,
                    Unit: "Count",
                    Dimensions: [
                        { Name: 'ClusterId', Value: _cluster },
                    ]
                },
                {
                    MetricName: "consumers",
                    Value: consumersCreated,
                    Unit: "Count",
                    Dimensions: [
                        { Name: 'ClusterId', Value: _cluster },
                    ]
                },
                {
                    MetricName: "graphql_connections",
                    Value: _graphQlConnections,
                    Unit: "Count",
                    Dimensions: [
                        { Name: 'ClusterId', Value: _cluster },
                    ]
                },
                {
                    MetricName: "available",
                    Value: _available,
                    Unit: "Count",
                    Dimensions: [
                        { Name: 'ClusterId', Value: _cluster },
                    ]
                },
                {
                    MetricName: "online",
                    Value: 1,
                    Unit: "Count",
                    Dimensions: [
                        { Name: 'ClusterId', Value: _cluster },
                    ]
                },
            ]
        }).promise()



    } catch (e) {
        Logger.error(e)
    } finally {
        const waitTime = (invokeTime + reportIntervalMs) - Date.now()
        setTimeout(() => reporting(), Math.max(0, waitTime))
    }
}

function extractMetrics(stats: MediaSoup.WebRtcTransportStat, clientId: string, metricData: Cloudwatch.MetricDatum[], direction: string) {
    const bytesSent: Cloudwatch.MetricDatum = {
        MetricName: `Bytes Sent (${direction})`,
        Unit: "Bytes",
        Value: stats.bytesSent,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const bytesReceived: Cloudwatch.MetricDatum = {
        MetricName: `Bytes Received (${direction})`,
        Unit: "Bytes",
        Value: stats.bytesReceived,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const receivingBitrate: Cloudwatch.MetricDatum = {
        MetricName: `Receiving Bitrate (${direction})`,
        Unit: "Bits/Second",
        Value: stats.recvBitrate,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const sendingBitrate: Cloudwatch.MetricDatum = {
        MetricName: `Sending Bitrate (${direction})`,
        Unit: "Bits/Second",
        Value: stats.sendBitrate,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtpBytesReceived: Cloudwatch.MetricDatum = {
        MetricName: `RTP Bytes Received (${direction})`,
        Unit: "Bytes",
        Value: stats.rtpBytesReceived,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtpBytesSent: Cloudwatch.MetricDatum = {
        MetricName: `RTP Bytes Sent (${direction})`,
        Unit: "Bytes",
        Value: stats.rtpBytesSent,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtpRecvBitrate: Cloudwatch.MetricDatum = {
        MetricName: `RTP Receiving Bitrate (${direction})`,
        Unit: "Bits/Second",
        Value: stats.rtpRecvBitrate,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtpSendBitrate: Cloudwatch.MetricDatum = {
        MetricName: `RTP Sending Bitrate (${direction})`,
        Unit: "Bits/Second",
        Value: stats.rtpSendBitrate,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtxBytesReceived: Cloudwatch.MetricDatum = {
        MetricName: `RTX Bytes Received (${direction})`,
        Unit: "Bytes",
        Value: stats.rtxBytesReceived,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtxBytesSent: Cloudwatch.MetricDatum = {
        MetricName: `RTX Bytes Sent (${direction})`,
        Unit: "Bytes",
        Value: stats.rtxBytesSent,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtxRecvBitrate: Cloudwatch.MetricDatum = {
        MetricName: `RTX Receiving Bitrate (${direction})`,
        Unit: "Bits/Second",
        Value: stats.rtxRecvBitrate,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const rtxSendBitrate: Cloudwatch.MetricDatum = {
        MetricName: `RTX Sending Bitrate (${direction})`,
        Unit: "Bits/Second",
        Value: stats.rtxSendBitrate,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const probationBytesSent: Cloudwatch.MetricDatum = {
        MetricName: `Probation Bytes Sent (${direction})`,
        Unit: "Bytes",
        Value: stats.probationBytesSent,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    const probationSendBitrate: Cloudwatch.MetricDatum = {
        MetricName: `Probation Send Bitrate (${direction})`,
        Unit: "Bits/Second",
        Value: stats.probationSendBitrate,
        Dimensions: [
            {Name: "Client Id", Value: clientId},
            {Name: "Docker Id", Value: _dockerId},
            {Name: "Cluster Id", Value: _cluster},
            {Name: "Transport Id", Value: stats.transportId},
            {Name: "Direction", Value: direction}
        ]
    }
    metricData.push(
        bytesSent,
        bytesReceived,
        receivingBitrate,
        sendingBitrate,
        rtpBytesReceived,
        rtpBytesSent,
        rtpRecvBitrate,
        rtpSendBitrate,
        rtxBytesReceived,
        rtxBytesSent,
        rtxRecvBitrate,
        rtxSendBitrate,
        probationBytesSent,
        probationSendBitrate
    )
}

export async function reportConferenceStats(sfu: SFU) {
    if (!process.env.REPORT_CLOUDWATCH_METRICS) {
        Logger.warn("Cloudwatch metrics are not enabled")
        return
    }

    try {
        let MetricData: Cloudwatch.MetricDatum[] = []

        if (sfu.roomId === undefined) {
            return
        }

        for (const client of sfu.clients.values()) {
            Logger.debug(`Reporting client ${client.id} connection stats`)

            const producerStats = await client.producerTransport.getStats()
            const consumerStats = await client.consumerTransport.getStats()

            for (const stats of producerStats){
                extractMetrics(stats, client.id, MetricData, "Producer")
            }

            CloudwatchClient.putMetricData({
                Namespace: "kidsloop/live/sfu",
                MetricData
            })
            MetricData = []

            for (const stats of consumerStats) {
                extractMetrics(stats, client.id, MetricData, "Consumer")
            }

            CloudwatchClient.putMetricData({
                Namespace: "kidsloop/live/sfu",
                MetricData
            })
            MetricData = []
        }

        if (MetricData.length > 0) {
            await CloudwatchClient.putMetricData({
                Namespace: "kidsloop/live/sfu",
                MetricData
            }).promise()
        }
    } catch(e) {
        Logger.error(e)
    } finally {
        const waitTime = (reportIntervalMs) - Date.now()
        setTimeout(() => reportConferenceStats(sfu), Math.max(0, waitTime))
    }
}

if (process.env.REPORT_CLOUDWATCH_METRICS) {
    setTimeout(() => reporting(), reportIntervalMs)
}
