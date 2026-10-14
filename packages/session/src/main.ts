import { startSessionHost } from "./server.js";
import { drawitHome } from "@drawit/core/node";

const home = drawitHome();
const handle = await startSessionHost({ home, replace: process.env.DRAWIT_REPLACE_SESSION === "1" });
console.error(`drawit session listening on 127.0.0.1:${handle.port}`);
process.on("SIGINT", () => {
  void handle.close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void handle.close().then(() => process.exit(0));
});
