import {createWorker} from "mediasoup";
import {SFU} from "../sfu";

let sfu: SFU;

describe("room", () => {
    beforeEach(async () => {
        const worker = await createWorker({
            logLevel: "warn",
            rtcMinPort: 10000,
            rtcMaxPort: 59999,
        });

        const announcedIp = "127.0.0.1";

        sfu = new SFU(worker, [{ip: process.env.WEBRTC_INTERFACE_ADDRESS || "0.0.0.0", announcedIp }]);
    });
    afterEach(() => {
        sfu.shutdown();
    });

    it("should be able to add a track", () => {
        // TODO: this test
        // expect(false).toBeTruthy();
    });
});
