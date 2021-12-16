import WebSocket, { Server } from "ws";
import { HttpServer } from "./httpServer";
import { Logger } from "../logger";
import { IncomingMessage } from "http";
import cookie from "cookie";
import {
    checkAuthenticationToken,
    checkLiveAuthorizationToken,
    KidsloopAuthenticationToken
} from "kidsloop-token-validation";
import { SFU } from "../v2/sfu";
import {RequestMessage} from "../v2/client";

type AuthorizationMessage = {
    authorizationToken: string;
}

export class WsServer {
    private wss: Server;
    private httpServer: HttpServer = new HttpServer();

    public constructor(private sfu: SFU) {
        this.httpServer.initializeServer();
        this.wss = new Server({ server: this.httpServer.server });
        if(process.env.DISABLE_AUTH) {
            Logger.warn("RUNNING IN DEBUG MODE - SKIPPING AUTHENTICATION AND AUTHORIZATION");
            this.wss.on("connection", (ws) => this.sfu.addClient(ws, "test-room", true));
        } else {
            this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));
        }
    }

    private handleConnection(ws: WebSocket, req: IncomingMessage) {
        const authTimeout = setTimeout(() => ws.close(), 10000);
        if(!req.headers.cookie) {
            ws.close(4403, "Not authenticated; no cookies");
            return;
        }

        const cookies = cookie.parse(req.headers.cookie);
        if(!cookies.access) {
            ws.close(4403, "Not authenticated; no access cookie");
            return;
        }

        ws.once("message", async (data) => {
            clearTimeout(authTimeout);
            const authenticationToken = await checkAuthenticationToken(cookies.access);
            await this.handleAuthorization(ws, data, authenticationToken);
        });
    }

    private async handleAuthorization(ws: WebSocket, data: WebSocket.RawData, authenticationToken: KidsloopAuthenticationToken) {
        try {
            const message: AuthorizationMessage = JSON.parse(data.toString());
            const { authorizationToken: token } = message;
            const authorizationToken = await checkLiveAuthorizationToken(token);

            if (authorizationToken.userid !== authenticationToken.id) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Authentication and Authorization tokens are not for the same user");
            }
            const isTeacher = authorizationToken.teacher || false;
            await this.sfu.addClient(ws, authorizationToken.roomid, isTeacher);
        } catch (e: unknown) {
            Logger.error(e);
            ws.close(4403, "Not authorized");
        }
    }

    public startServer(ip: string) {
        this.httpServer.startServer(ip);
    }
}

type Timeout = ReturnType<typeof setTimeout>;

export type TransportState =
    | "not-connected"
    | "connected"
    | "connecting"
    | "error";

export class WSTransport {
    private receiveTimeoutReference?: Timeout;
    private sendTimeoutReference?: Timeout;

    private static parse(message: string): RequestMessage | undefined {
        const request = JSON.parse(message) as RequestMessage;
        if(typeof request !== "object") { console.error(`Received request of type '${typeof request}'`); return; }
        if(!request) { console.error("Received null request"); return; }
        if(!request.id) { console.error("Received request without id"); return; }
        return request;
    }

    constructor(
        private ws: WebSocket,
        private req: IncomingMessage,
        private receiveMessageTimeoutTime: number|null = 5000,
        private sendKeepAliveMessageInterval: number|null = 1000
    ) {
        ws.on("error", (e) => {
            console.error(e);
            this.onError();
        });
        ws.on("close", () => this.onClose());
        ws.on("message", (e) => this.onMessage(e));
        this.resetNetworkSendTimeout();
        this.resetNetworkReceiveTimeout();
    }

    public disconnect(code?: number | undefined, reason?: string): void {
        this.ws.close(code, reason);
        if (this.receiveTimeoutReference) {
            clearTimeout(this.receiveTimeoutReference);
        }
        if (this.sendTimeoutReference) {
            clearTimeout(this.sendTimeoutReference);
        }
    }

    // TODO: Check types
    public async send(data: string | ArrayBufferLike | ArrayBufferView) {
        this.ws.send(data);
        this.resetNetworkSendTimeout();
    }

    private onMessage(data: WebSocket.RawData) {
        if(!data) {return;}
        const messageString = data.toString();
        if(messageString.length <= 0) {return;}
        const message = WSTransport.parse(messageString);
        if(!message) { this.ws.close(4400, "Invalid request"); return;}

        this.resetNetworkReceiveTimeout();
    }

    private onClose() {
    }

    private onError() {
    }

    private resetNetworkReceiveTimeout(): void {
        if(this.receiveMessageTimeoutTime === null) { return; }
        if (this.receiveTimeoutReference) {
            clearTimeout(this.receiveTimeoutReference);
        }
        this.receiveTimeoutReference = setTimeout(
            () => this.disconnect(4400, "timeout"),
            this.receiveMessageTimeoutTime
        );
    }

    private resetNetworkSendTimeout(): void {
        if(this.sendKeepAliveMessageInterval === null) { return; }
        if (this.sendTimeoutReference) {
            clearTimeout(this.sendTimeoutReference);
        }
        this.sendTimeoutReference = setTimeout(
            () => this.send(new Uint8Array(0)),
            this.sendKeepAliveMessageInterval
        );
    }
}
