import express, {Express} from "express";
import { createServer, IncomingMessage, Server } from "http";
import { Room } from "src/v2/room";
import { Duplex } from "stream";
import { register } from "prom-client";
import { WebSocketServer, WebSocket, RawData } from "ws";

import { Logger } from "../logger";
import {ClientV2, newClientId, RequestMessage, ResponseMessage} from "../v2/client";
import { SFU } from "../v2/sfu";
import {decodeAuthError, handleAuth} from "./auth";

export class Sfu2HttpServer {
    public readonly http: Server;
    public constructor(
        private readonly sfu: SFU,
    ) {

        this.app.get("/.well-known/health-check", async (_req, res) => {
            res.statusCode = 204;
            res.end();
        });

        this.app.get("/metrics", async (_req, res) => {
            try {
                res.set("Content-Type", register.contentType);
                const metrics = await register.metrics();
                res.end(metrics);
            } catch (e) {
                Logger.error(e);
                res.status(500).end(e instanceof Error ? e.toString() : "Error retrieving metrics");
            }
        });
        this.http = createServer(this.app);
        this.http.on("upgrade", (req, socket, head) => this.onUpgrade(req, socket, head));
    }

    private readonly app: Express = express();
    private readonly wss = new WebSocketServer({ noServer: true });

    private async onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
        try {
            Logger.info(`WS connection from [${req.socket.remoteFamily}](${req.socket.remoteAddress}:${req.socket.remotePort})`);
            const { roomId, isTeacher, userId } = await handleAuth(req);
            const clientId = getClientIdFromRequest(req);
            const client = clientId ?
                this.sfu.getClient(roomId, clientId) ??
                await this.sfu.createClient(userId, roomId, isTeacher) :
                await this.sfu.createClient(userId, roomId, isTeacher);

            const room = this.sfu.getRoom(roomId);

            this.wss.handleUpgrade(req, socket, head, (ws) =>  {
                ws.send(JSON.stringify({ clientId: client.id }));
                return new WSTransport(ws, client, room, null);
            });
        } catch (e) {
            Logger.error(JSON.stringify(e));
            try {
                const authError = decodeAuthError(<Error>e);
                this.wss.handleUpgrade(req, socket, head, ws => {
                    ws.send(JSON.stringify(authError));
                    ws.close(authError.code);
                });
            } catch (e) {
                const error = <Error> e;
                this.wss.handleUpgrade(req, socket, head, ws => {
                    ws.send(JSON.stringify({
                        error: error.name,
                        message: error.message,
                        code: 500,
                    }));
                    ws.close(500);
                });
            }

            if (socket.writable) { socket.end(); }
            if (socket.readable) { socket.destroy(); }
        }
    }
}

function getClientIdFromRequest(req: IncomingMessage) {
    Logger.warn(`headers: ${JSON.stringify(req.headers["sec-websocket-protocol"])}`);
    const rawClientId = req
        .headers["sec-websocket-protocol"]
        ?.split(",")
        .map(s => s.trim())
        .filter((s) => s.startsWith("clientId"))[0]
        ?.split("clientId")[1];
    let clientId;
    if (rawClientId) {
        clientId = newClientId(rawClientId);
    }
    Logger.warn(clientId);
    return clientId;
}

type Timeout = ReturnType<typeof setTimeout>;

export class WSTransport {
    private receiveTimeoutReference?: Timeout;
    private sendTimeoutReference?: Timeout;

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
        this.room.semaphoreQueue.process(() => this.client.onMessage(message));
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
