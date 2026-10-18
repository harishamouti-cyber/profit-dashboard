import { pollOnce, startWorker } from "./worker.server";

process.env.DISABLE_EMBEDDED_WORKER = "0";
startWorker();
void pollOnce().catch((error) => console.error("initial job poll failed", error));
