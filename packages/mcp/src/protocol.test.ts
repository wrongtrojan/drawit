import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { serveDrawitStdio } from "./stdio.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); });

function wire(input: { write: (data: string) => unknown }, output: NodeJS.ReadableStream) {
  let buffer = "";
  let nextId = 0;
  const pending = new Map<number, (message: any) => void>();
  output.on("data", (data) => {
    buffer += String(data);
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  return {
    notify: (method: string) => input.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n"),
    request: (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 5000);
      pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
      input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    }),
  };
}

async function verify(client: ReturnType<typeof wire>, version: string, modern = false) {
  const meta = modern ? { _meta: { "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} } } : {};
  const init = await client.request("initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "drawit-test", version: "1" }, ...meta });
  expect(init.error).toBeUndefined();
  expect(init.result.instructions).toContain("Tool success only means an image was generated");
  if (!modern) client.notify("notifications/initialized");
  const list = await client.request("tools/list", meta);
  expect(list.error).toBeUndefined();
  expect(list.result.tools.map((tool: any) => tool.name)).toEqual(expect.arrayContaining(["diagram_catalog", "diagram_save", "diagram_review_snapshot"]));
  const catalog = await client.request("tools/call", { name: "diagram_catalog", arguments: {}, ...meta });
  expect(catalog.error).toBeUndefined();
  const payload = JSON.parse(catalog.result.content.find((item: any) => item.type === "text").text);
  expect(payload.components.some((component: any) => component.type === "table" && component.propertySchema)).toBe(true);
}

describe("stdio protocol compatibility", () => {
  it.each(["2024-11-05", "2025-03-26", "2025-06-18"])("initializes legacy %s and discovers tools", async (version) => {
    const input = new PassThrough(); const output = new PassThrough();
    const handle = serveDrawitStdio({ transport: new StdioServerTransport(input, output) });
    closers.push(() => handle.close());
    await verify(wire(input, output), version);
  });
  it("accepts modern envelopes with initialize", async () => {
    const input = new PassThrough(); const output = new PassThrough();
    const handle = serveDrawitStdio({ transport: new StdioServerTransport(input, output) });
    closers.push(() => handle.close());
    await verify(wire(input, output), "2026-07-28", true);
  });
  it("starts the actual tsx entry with clean stdout", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-stdio-"));
    const child = spawn(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("src/index.ts")], { env: { ...process.env, DRAWIT_HOME: home }, stdio: "pipe" });
    closers.push(async () => { child.kill(); await rm(home, { recursive: true, force: true }); });
    await verify(wire(child.stdin, child.stdout), "2025-06-18");
  });
});

it("starts the quiet development MCP configuration without stdout logs", async () => {
  const home = await mkdtemp(join(tmpdir(), "drawit-pnpm-"));
  const child = spawn(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--silent", "--dir", resolve("../.."), "mcp"], { env: { ...process.env, DRAWIT_HOME: home }, stdio: "pipe", shell: process.platform === "win32" });
  closers.push(async () => { child.kill(); await rm(home, { recursive: true, force: true }); });
  await verify(wire(child.stdin, child.stdout), "2025-06-18");
}, 15000);
