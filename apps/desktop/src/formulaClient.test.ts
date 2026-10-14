import { afterEach, expect, it, vi } from "vitest";
import { materializeNode } from "@drawit/core";
import { FormulaClient } from "./formulaClient.js";
afterEach(() => vi.useRealTimers());
it("terminates a blocked formula worker, clears jobs, and starts a fresh worker", async () => {
  vi.useFakeTimers(); const workers: any[] = [];
  const client = new FormulaClient(() => { const worker = { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null, onerror: null }; workers.push(worker); return worker as unknown as Worker; }, 50);
  const node = materializeNode({ type: "equation", latex: "x" }, "eq"); const first = client.render(node); const rejected = expect(first).rejects.toThrow("中止");
  await vi.advanceTimersByTimeAsync(51); await rejected; expect(workers[0].terminate).toHaveBeenCalledOnce(); expect(client.pendingCount).toBe(0);
  const next = client.render(node); workers[1].onmessage({ data: { id: workers[1].postMessage.mock.calls[0][0].id, markup: "<svg/>" } });
  expect(await next).toBe("<svg/>"); expect(client.pendingCount).toBe(0); expect(vi.getTimerCount()).toBe(0); client.close();
});
// @vitest-environment jsdom
