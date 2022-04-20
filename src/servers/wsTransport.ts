import {RawData, WebSocket} from "ws";
import {ClientV2, RequestMessage, ResponseMessage} from "../v2/client";
import {Room} from "../v2/room";
import {Logger} from "../logger";

export class WSTransport {
    private receiveTimeoutReference?: NodeJS.Timeout;
    private sendTimeoutReference?: NodeJS.Timeout;

    constructor(
        private readonly ws: WebSocket,
        private readonly client: ClientV2,
        private readonly room: Room,
        private receiveMessageTimeoutMs: number | null = 5000,
        private sendMessageTimeoutMs: number | null = 1000
    ) {
        ws.on("close", (code, reason) => this.onClose(code, reason));
        ws.on("error", (e) => this.onError(e));
        ws.on("message", (e) => this.onMessage(e));

        this.client.clearClose();
        this.client.on("response", (response) => this.send({ response }));
        this.client.on("pausedByProducingUser", (pausedSource) => this.send({ pausedSource }));
        this.client.on("pausedGlobally", (pausedGlobally) => this.send({ pausedGlobally }));
        this.client.on("consumerClosed", (consumerClosed) => this.send({ consumerClosed }));
        this.client.on("producerClosed", (producerClosed) => this.send({ producerClosed }));
        this.client.on("consumerTransportClosed", () => this.send({ consumerTransportClosed: {} }));
        this.client.on("producerTransportClosed", () => this.send({ producerTransportClosed: {} }));

        this.resetNetworkSendTimeout();
        this.resetNetworkReceiveTimeout();
    }

    private send(message: ResponseMessage) {
        this.resetNetworkSendTimeout();
        const data = JSON.stringify(message);
        this.ws.send(data);
    }

    private async onMessage(data: RawData) {
        this.resetNetworkReceiveTimeout();
        if (!data) { return; }
        const messageString = data.toString();
        if (messageString.length <= 0) { return; }
        const message = parse(messageString);
        if (!message) { this.ws.close(4400, "Invalid request"); return; }
        await this.room.semaphoreQueue.runExclusive(() => this.client.onMessage(message));
    }

    private async onClose(code: number, reason: Buffer) {
        Logger.info(`Websocket closed(${code}, ${reason}) for Client(${this.client.id})`);
        this.client.onClose();
    }

    private async onError(e: Error) {
        Logger.error(`Websocket serving Client(${this.client.id}): ${e}`);
    }

    private disconnect(code?: number | undefined, reason?: string): void {
        if (this.receiveTimeoutReference) { clearTimeout(this.receiveTimeoutReference); }
        if (this.sendTimeoutReference) { clearTimeout(this.sendTimeoutReference); }
        this.ws.close(code, reason);
    }

    private resetNetworkReceiveTimeout(): void {
        if (this.receiveMessageTimeoutMs === null) { return; }
        if (this.receiveTimeoutReference) { clearTimeout(this.receiveTimeoutReference); }
        this.receiveTimeoutReference = setTimeout(
            () => this.disconnect(4400, "timeout"),
            this.receiveMessageTimeoutMs
        );
    }

    private resetNetworkSendTimeout(): void {
        if (this.sendMessageTimeoutMs === null) { return; }
        if (this.sendTimeoutReference) { clearTimeout(this.sendTimeoutReference); }
        this.sendTimeoutReference = setTimeout(
            () => this.ws.send(""),
            this.sendMessageTimeoutMs
        );
    }
}

function parse(message: string): RequestMessage | undefined {
    const request = JSON.parse(message) as RequestMessage;
    if (typeof request !== "object") { Logger.error(`Received request of type '${typeof request}'`); return; }
    if (!request) { Logger.error("Received null request"); return; }
    if (!request.id) { Logger.error("Received request without id"); return; }
    return request;
}
