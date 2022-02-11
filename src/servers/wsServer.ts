import cookie from "cookie";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { checkAuthenticationToken, checkLiveAuthorizationToken } from "kidsloop-token-validation";
import parseUrl from "parseurl";
import { Duplex } from "stream";
import { WebSocketServer, WebSocket, RawData } from "ws";

import { Logger } from "../logger";
import { ClientV2, RequestMessage, ResponseMessage } from "../v2/client";
import { newRoomId } from "../v2/room";
import { SFU } from "../v2/sfu";

export class WsServer {
    public constructor(
        private readonly sfu: SFU,
        public readonly http = createServer((req, res) => this.onRequest(req, res)),
    ) {
        this.wss = new WebSocketServer({ noServer: true });
        this.http.on("upgrade", (req, socket, head) => this.onUpgrade(req, socket, head));
    }

    private readonly wss: WebSocketServer;

    private onRequest(req: IncomingMessage, res: ServerResponse) {
        Logger.info(`Ignoring HTTP Request(${req.method}, ${req.url}) from ${req.socket.remoteAddress}`);
        res.statusCode = 400;
        res.end();
    }

    private async onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
        try {
            Logger.info(`WS connection from [${req.socket.remoteFamily}](${req.socket.remoteAddress}:${req.socket.remotePort})`);
            const { roomId, isTeacher, userId } = await handleAuth(req);
            const client = await this.sfu.createClient(userId, roomId, isTeacher);
            this.wss.handleUpgrade(req, socket, head, ws => new WSTransport(ws, client, null));
        } catch (e) {
            Logger.error(e);
            if (socket.writable) { socket.end(); }
            if (socket.readable) { socket.destroy(); }
        }

    }
}

type Timeout = ReturnType<typeof setTimeout>;

export class WSTransport {
    private receiveTimeoutReference?: Timeout;
    private sendTimeoutReference?: Timeout;

    constructor(
        private readonly ws: WebSocket,
        private readonly client: ClientV2,
        private receiveMessageTimeoutMs: number | null = 5000,
        private sendMessageTimeoutMs: number | null = 1000
    ) {
        ws.on("close", (code, reason) => this.onClose(code, reason));
        ws.on("error", (e) => this.onError(e));
        ws.on("message", (e) => this.onMessage(e));

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
        Logger.info("Websocket tx", message);
        this.resetNetworkSendTimeout();
        const data = JSON.stringify(message);
        this.ws.send(data);
    }

    private async onMessage(data: RawData) {
        Logger.info("Websocket rx", data);
        this.resetNetworkReceiveTimeout();
        if (!data) { return; }
        const messageString = data.toString();
        if (messageString.length <= 0) { return; }
        const message = parse(messageString);
        if (!message) { this.ws.close(4400, "Invalid request"); return; }

        await this.client.onMessage(message);
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

async function handleAuth(req: IncomingMessage) {
    if (process.env.DISABLE_AUTH) {
        Logger.warn("RUNNING IN DEBUG MODE - SKIPPING AUTHENTICATION AND AUTHORIZATION");
        return {
            userId: debugUserId(),
            roomId: newRoomId("test-room"),
            isTeacher: true
        };
    }

    const authentication = getAuthenticationJwt(req);
    const authorization = getAuthorizationJwt(req);

    const authenticationToken = await checkAuthenticationToken(authentication);
    const authorizationToken = await checkLiveAuthorizationToken(authorization);
    if (authorizationToken.userid !== authenticationToken.id) {
        throw new Error("Authentication and Authorization tokens are not for the same user");
    }

    return {
        userId: authorizationToken.userid,
        roomId: newRoomId(authorizationToken.roomid),
        isTeacher: authorizationToken.teacher || false,
    };
}

const getAuthenticationJwt = (req: IncomingMessage) => {
    if (!req.headers.cookie) { throw new Error("No authentication; no cookies"); }
    const cookies = cookie.parse(req.headers.cookie);

    const access = cookies.access;
    if (!access) { throw new Error("No authentication; no access cookie"); }
    return access;
};

const getAuthorizationJwt = (req: IncomingMessage) => {
    const url = parseUrl(req);
    if (!url) { throw new Error(`No authorization; no url(${req.url},${url})`); }
    if (!url.query) { throw new Error("No authorization; no query params"); }
    if (typeof url.query === "string") {
        const queryParams = new URLSearchParams(url.query);
        const authorization = queryParams.get("authorization");
        if (!authorization) { throw new Error("No authorization; no authorization query param"); }
        return authorization;
    } else {
        const authorization = url.query["authorization"] instanceof Array ? url.query["authorization"][0] : url.query["authorization"];
        if (!authorization) { throw new Error("No authorization; no authorization query param"); }
        return authorization;
    }

};

let _debugUserCount = 0;
function debugUserId() { return `debugUser${_debugUserCount++}`; }