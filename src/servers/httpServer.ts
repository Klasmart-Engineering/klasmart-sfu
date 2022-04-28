import express, {Express} from "express";
import { createServer, IncomingMessage, Server } from "http";
import { Duplex } from "stream";
import { register } from "prom-client";
import { WebSocketServer } from "ws";

import { Logger } from "../logger";
import {newClientId,} from "../v2/client";
import { SFU } from "../v2/sfu";
import {decodeAuthError, handleAuth} from "./auth";
import {WSTransport} from "./wsTransport";

export class HttpServer {
    public readonly http: Server;
    public constructor(
        private readonly sfu: SFU,
    ) {

        this.app.get("/.well-known/health-check", async (_req, res) => {
            res.statusCode = 204;
            if(this.sfu.isRegistrarHealthy()){
                res.statusCode = 500;
            }
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
    Logger.debug(`headers: ${JSON.stringify(req.headers["sec-websocket-protocol"])}`);
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
    Logger.debug(clientId);
    return clientId;
}
