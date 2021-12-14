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

    private async handleConnection(ws: WebSocket, req: IncomingMessage) {
        if(!req.headers.cookie) {
            ws.close(4403, "Not authenticated; no cookies");
            return;
        }

        const cookies = cookie.parse(req.headers.cookie);
        if(!cookies.access) {
            ws.close(4403, "Not authenticated; no access cookie");
            return;
        }

        const authenticationToken = await checkAuthenticationToken(cookies.access);

        ws.once("message", async (data) => await this.handleAuthorization(ws, data, authenticationToken));
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
