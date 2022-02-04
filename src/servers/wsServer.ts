import cookie from "cookie";
import { IncomingMessage } from "http";
import { checkAuthenticationToken, checkLiveAuthorizationToken } from "kidsloop-token-validation";
import parseUrl from "parseurl";
import WebSocket, { Server } from "ws";

import { HttpServer } from "./httpServer";
import { Logger } from "../logger";
import { SFU } from "../v2/sfu";
import {ClientV2, RequestMessage, ResponseMessage} from "../v2/client";
import { newRoomId } from "../v2/room";

export class WsServer {
    private readonly wss: Server;
    private readonly httpServer: HttpServer = new HttpServer();

    public constructor(sfu: SFU) {
        this.httpServer.initializeServer();
        this.wss = new Server({ server: this.httpServer.server });
        this.wss.on("connection", (ws, req) => new WSTransport(sfu, ws, req, null));
    }

    public startServer(ip?: string) {
        return this.httpServer.startServer(ip);
    }
}

type Timeout = ReturnType<typeof setTimeout>;

export class WSTransport {
    private receiveTimeoutReference?: Timeout;
    private sendTimeoutReference?: Timeout;
    private readonly client: Promise<ClientV2>;

    constructor(
        private readonly sfu: SFU,
        private readonly ws: WebSocket,
        request: IncomingMessage,
        private receiveMessageTimeoutMs: number|null = 5000,
        private sendMessageTimeoutMs: number|null = 1000
    ) {
        const {promise, resolve} = createDecoupledPromise<ClientV2>();
        this.client = promise;
        ws.on("message", (e) => this.onMessage(e));
        ws.on("close", (code, reason) => this.onClose(code, reason));
        ws.on("error", (e) =>  this.onError(e));
        resolve(this.createClient(request));
    }

    private send(message: ResponseMessage) {
        Logger.info("Websocket tx", message);
        this.resetNetworkSendTimeout();
        const data = JSON.stringify(message);
        this.ws.send(data);
    }

    private async onMessage(data: WebSocket.RawData) {
        Logger.info("Websocket rx", data);
        this.resetNetworkReceiveTimeout();
        if(!data) {return;}
        const messageString = data.toString();
        if(messageString.length <= 0) {return;}
        const message = parse(messageString);
        if(!message) { this.ws.close(4400, "Invalid request"); return;}

        const client = await this.client;
        await client.onMessage(message);
    }

    private async onClose(code: number, reason: Buffer) {
        const client = await this.client;
        Logger.info(`Websocket closed(${code}, ${reason}) for Client(${client.id})`);
        client.onClose();
    }

    private async onError(e: Error) {
        const client = await this.client;
        Logger.error(`Websocket serving Client(${client.id}): ${e}`);
    }

    private async createClient(req: IncomingMessage) {
        try {
            this.resetNetworkSendTimeout();
            this.resetNetworkReceiveTimeout();
            const {roomId, isTeacher, userId} = await handleAuth(req);
            const client = await this.sfu.createClient(
                userId,
                roomId,
                isTeacher,
            );
            client.on("response", (response) => this.send({response}));
            
            client.on("pausedByProducingUser", (pausedSource) => this.send({pausedSource}));
            client.on("pausedGlobally", (pausedGlobally) => this.send({pausedGlobally}));
            
            client.on("consumerClosed", (consumerClosed) => this.send({consumerClosed}));
            client.on("producerClosed", (producerClosed) => this.send({producerClosed}));

            client.on("consumerTransportClosed", () => this.send({consumerTransportClosed: {}}));
            client.on("producerTransportClosed", () => this.send({producerTransportClosed: {}}));
            return client;
        } catch (e: unknown) {
            Logger.error(e);
            this.ws.close(4403, "Not authenticated or not authorized");
            throw e;
        }
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
    if(typeof request !== "object") { console.error(`Received request of type '${typeof request}'`); return; }
    if(!request) { console.error("Received null request"); return; }
    if(!request.id) { console.error("Received request without id"); return; }
    return request;
}

async function handleAuth(req: IncomingMessage) {
    if(process.env.DISABLE_AUTH) {
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
    if(!url || !url.query) { throw new Error("No authorization; no query params"); }
    if(typeof url.query === "string") { 
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

type DecoupledPromise<T> = {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (e?:unknown) => void;
};

export function createDecoupledPromise<T>(): DecoupledPromise<T> {
    let resolve: ((value:T | PromiseLike<T>) => void) | undefined = undefined;
    let reject: ((e?:unknown) => void) | undefined = undefined;

    const promise = new Promise<T>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });

    // With the current Promise implmentation 'reject' will always have been set
    // as such the following line should never throw, unless the behavior of Promise changes
    if(!resolve || !reject) { throw new Error("Could not extract callbacks from promise"); }

    return {
        promise,
        resolve,
        reject,
    };
}
