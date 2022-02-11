import express, {Express} from "express";
import {register} from "prom-client";
import {createServer, Server} from "http";
import {Logger} from "../logger";
import {hostname} from "os";
import newrelic from "newrelic";

export class HttpServer {
    public readonly app: Express = express();
    public _server?: Server;
    constructor() {
        this.app.use((req, _res, next) => {
            newrelic.startWebTransaction(req.path, next);
        });

        this.app.get("/metrics", async (_req, res) => {
            try {
                res.set("Content-Type", register.contentType);
                const metrics = await register.metrics();
                res.end(metrics);
            } catch (ex: unknown) {
                Logger.error(ex);
                res.status(500).end(ex instanceof Error ? ex.toString() : "Error retrieving metrics");
            }
        });
    }

    public initializeServer() {
        this.server = createServer(this.app);
    }

    public startServer(ip?: string, subscriptionsPath?: string) {
        this.server.listen({ port: process.env.PORT }, () => { Logger.info("🌎 Server available"); });
        const address = this.server.address();
        if (!address || typeof address === "string") { throw new Error("Unexpected address format"); }

        const host = process.env.HTTP_ANNOUNCE_ADDRESS ||
            process.env.HOSTNAME_OVERRIDE ||
            (process.env.USE_IP === "1" ? ip : undefined) ||
            hostname();

        const uri = `${host}:${address.port}${subscriptionsPath ?? ""}`;
        Logger.info(`Announcing address HTTP traffic for webRTC signaling via redis: ${uri}`);
        return uri;
    }

    public get server() {
        if (!this._server) {
            throw new Error("Server not initialized");
        }
        return this._server;
    }

    private set server(server: Server) {
        if (this._server) {
            throw new Error("Server already initialized");
        }
        this._server = server;
    }
}
