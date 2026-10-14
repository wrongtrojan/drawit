import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
const require = createRequire(new URL("../packages/session/package.json", import.meta.url));
const WebSocket = require("ws");
const args = Object.fromEntries(process.argv.slice(2).map((value) => { const [key, ...rest] = value.replace(/^--/, "").split("="); return [key, rest.join("=")]; }));
if (!args.home) throw new Error("Use --home=<isolated DRAWIT_HOME>; never target your working library");
const home = resolve(args.home), iterations = Number(args.iterations ?? 10000), duration = Number(args.duration ?? 1800);
if (!Number.isInteger(iterations) || iterations < 1 || duration < 0) throw new Error("Invalid stress options");
const meta = JSON.parse(await readFile(join(home, "session.json"), "utf8"));
const socket = new WebSocket(`ws://127.0.0.1:${meta.port}`);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let counter = 0; const pending = new Map(); const events = { revisions: 0 }; let lastDocument;
socket.on("message", (data) => {
  const message = JSON.parse(String(data));
  if (message.type === "event" && message.event === "revision") { events.revisions++; lastDocument = message.document; }
  if (message.type === "response") { pending.get(message.requestId)?.(message); pending.delete(message.requestId); }
});
async function call(body) {
  const requestId = `stress_${++counter}`;
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out ${body.type}`)); }, 15000);
    pending.set(requestId, (value) => { clearTimeout(timer); resolve(value); });
    socket.send(JSON.stringify({ ...body, token: meta.token, requestId }));
  });
  if (!response.ok) throw new Error(`${body.type}: ${response.code} ${response.message}`);
  return response;
}
const fixture = { schemaVersion: 1, documentId: "attention_stress", title: "多头注意力计算过程", revision: 0, canvas: { width: 1400, height: 900, background: "#ffffff" }, edges: [], nodes: [] };
fixture.nodes.push({ id: "outer", type: "container", title: "Transformer", x: 40, y: 40, width: 1320, height: 800 });
for (let i = 0; i < 4; i++) {
  fixture.nodes.push({ id: `block_${i}`, type: "container", title: `Head ${i}`, parentId: "outer", x: 30 + i * 315, y: 80, width: 300, height: 650 });
  fixture.nodes.push({ id: `nested_${i}`, type: "container", title: "Projection", parentId: `block_${i}`, x: 15, y: 40, width: 270, height: 250 });
  for (let j = 0; j < 4; j++) fixture.nodes.push({ id: `formula_${i * 4 + j}`, type: "equation", latex: ["Q=XW_Q", "K=XW_K", "V=XW_V", "\\operatorname{softmax}(QK^T/\\sqrt{d_k})V"][j], parentId: j < 2 ? `nested_${i}` : `block_${i}`, x: 20, y: 40 + (j % 2) * 110 + (j >= 2 ? 290 : 0), width: 230, height: 90 });
  fixture.nodes.push({ id: `matrix_${i}`, type: "matrix", cells: [["1", "0", "2"], ["0", "1", "3"], ["2", "1", "0"]], bracket: "square", parentId: `block_${i}`, x: 45, y: 510, width: 180, height: 120 });
}
const timings = []; const started = performance.now();
try {
  await call({ type: "subscribe" });
  await call({ type: "save" });
  let snapshot = (await call({ type: "import", json: fixture, source: "gui" })).document;
  for (let i = 0; i < iterations; i++) {
    const begin = performance.now();
    const expected = snapshot.revision + 1;
    const response = await call({ type: "apply", source: "mcp", expectedRevision: snapshot.revision, operations: [{ op: "updateNodes", updates: [{ id: `formula_${i % 16}`, patch: { latex: `Q_${i % 7}=XW_Q+\\frac{${i % 19}}{\\sqrt{d_k}}` } }] }] });
    snapshot = response.document;
    if (snapshot.revision !== expected) throw new Error("Unexpected revision");
    if (i % 20 === 0) await call({ type: "setView", selection: [`formula_${i % 16}`] });
    if (i % 250 === 249) {
      await call({ type: "undo", expectedRevision: snapshot.revision, source: "gui" });
      await call({ type: "redo", expectedRevision: snapshot.revision + 1, source: "gui" });
      snapshot = (await call({ type: "get" })).document;
      // Undo/redo revisions are monotonic; track them rather than asserting iteration count.
    }
    timings.push(performance.now() - begin);
    if (i % 1000 === 999) console.log(`Applied ${i + 1}/${iterations} revisions`);
    const sleep = duration * 1000 * (i + 1) / iterations - (performance.now() - started);
    if (sleep > 0) await new Promise((resolve) => setTimeout(resolve, sleep));
  }
  await call({ type: "save" });
  const current = (await call({ type: "get" })).document;
  const disk = JSON.parse(await readFile(join(home, "documents/attention_stress.drawit.json"), "utf8"));
  if (JSON.stringify(current) !== JSON.stringify(disk) || (lastDocument && lastDocument.revision !== current.revision)) throw new Error("Lost document data");
  timings.sort((a, b) => a - b);
  const report = { platform: process.platform, iterations, seconds: (performance.now() - started) / 1000, revisions: current.revision, events, nodes: current.nodes.length, p95RequestMs: timings[Math.floor(timings.length * .95)], pending: pending.size, status: "session-passed", installedWindowVisualAcceptance: "manual-required" };
  await mkdir(home, { recursive: true }); await writeFile(join(home, "stress-report.json"), JSON.stringify(report, null, 2)); console.log(report);
} finally { socket.close(); }
