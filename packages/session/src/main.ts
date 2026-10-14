import { startSessionHost } from "./server.js";
import { drawitHome } from "@drawit/core/node";

async function main() {
const home = drawitHome();
const handle = await startSessionHost({ home, replace: process.env.DRAWIT_REPLACE_SESSION === "1" });
console.error(`drawit session listening on 127.0.0.1:${handle.port}`);
process.on("SIGINT", () => {
  void handle.close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void handle.close().then(() => process.exit(0));
});

// Desktop owns stdin. Closing the pipe shuts down its host without orphaning it.
if (process.env.DRAWIT_MANAGED_SESSION === "1") {
  process.stdin.resume();
  process.stdin.on("end", () => void handle.close().then(() => process.exit(0)));
}
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
