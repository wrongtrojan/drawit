import { spawn } from "node:child_process";

const env = { ...process.env, DRAWIT_REPLACE_SESSION: "1" };
const session = spawn("pnpm --filter @drawit/session dev", { env, stdio: "inherit", shell: true });
const vite = spawn("pnpm --filter @drawit/desktop dev", { env, stdio: "inherit", shell: true });

function shutdown() {
  session.kill();
  vite.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
session.on("exit", (code) => {
  if (code && code !== 0) vite.kill();
});
