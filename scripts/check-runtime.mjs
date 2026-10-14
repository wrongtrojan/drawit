import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const runtime = resolve(process.env.DRAWIT_RUNTIME ?? "apps/desktop/src-tauri/runtime");
const executable = join(runtime, process.platform === "win32" ? "node.exe" : "node");
const home = await mkdtemp(join(tmpdir(), "drawit-runtime-"));
const children = [];
let host, mcp;
try {
  const env = { ...process.env, PATH: "", DRAWIT_HOME: home, DRAWIT_MANAGED_SESSION: "1" };
  host = spawn(executable, [join(runtime, "session.cjs")], { env, stdio: "pipe" }); children.push(host);
  let errors = "";
  host.stderr.on("data", (data) => errors += String(data));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { JSON.parse(await readFile(join(home, "session.json"), "utf8")); ready = true; break; } catch { /* Wait for the private host. */ }
    if (host.exitCode !== null) throw new Error(errors);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, errors || "Session did not become ready");
  mcp = spawn(process.env.DRAWIT_MCP_COMMAND ?? executable, process.env.DRAWIT_MCP_COMMAND ? ["--mcp", "--runtime", runtime] : [join(runtime, "mcp.cjs")], { env, stdio: "pipe" }); children.push(mcp);
  mcp.stderr.on("data", (data) => errors += String(data));
  const pending = new Map(); let buffer = ""; let id = 0;
  mcp.stdout.on("data", (data) => {
    buffer += String(data);
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const response = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      pending.get(response.id)?.(response); pending.delete(response.id);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(errors || `Timeout ${method}`)); }, 10000);
    pending.set(requestId, (response) => { clearTimeout(timer); resolve(response); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
  });
  const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "runtime-smoke", version: "1" } });
  assert(!init.error, JSON.stringify(init));
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const tools = await call("tools/list"); assert(tools.result.tools.some((tool) => tool.name === "diagram_save"));
  const result = await call("tools/call", { name: "diagram_get", arguments: {} });
  const document = JSON.parse(result.result.content[0].text); assert.equal(document.document.title, "二分查找");
  const review = await call("tools/call", { name: "diagram_review_snapshot", arguments: {} });
  assert(review.result.content.some((content) => content.type === "image"));
  const exited = new Promise((resolve) => host.once("exit", resolve)); host.stdin.end();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Managed host did not exit on EOF")), 3000))]);
  const unavailable = await call("tools/call", { name: "diagram_open_editor", arguments: {} });
  assert.equal(JSON.parse(unavailable.result.content[0].text).code, "EDITOR_NOT_RUNNING");
  console.error("Private runtime smoke passed: no PATH Node, initialize, tools/list, live document, review PNG, host shutdown, offline editor error.");
} finally {
  for (const child of children) child.kill();
  await rm(home, { recursive: true, force: true });
}
