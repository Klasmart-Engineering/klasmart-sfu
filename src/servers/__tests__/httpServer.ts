import { HttpServer } from "../httpServer";
import request from "supertest";

describe("initializeServer", () => {
    it("Should not be able to be initialized twice", async () => {
        const server = new HttpServer();
        server.initializeServer();
        await expect(() => server.initializeServer()).toThrow();
    });

    it("Should be able to be initialized", async () => {
        const server = new HttpServer();
        await expect(() => server.initializeServer()).not.toThrow();
    });
});

let server: HttpServer;

beforeAll(async () => {
    server = new HttpServer();
});

describe("GET /metrics", () => {
    it("Should return 200 & valid response for metrics request", (done) => {
        request(server.app)
            .get("/metrics")
            .expect(200)
            .end((err, res) => {
                if (err) return done(err);
                expect(res.body).toMatchObject({});
                done();
            });
    });
});
