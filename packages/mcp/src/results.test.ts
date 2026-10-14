import { expect, it, vi } from "vitest";
import { registerDrawitTools } from "./tools.js";
const response = vi.hoisted(() => ({ ok: true }));
vi.mock("./invoke.js", () => ({ invoke: vi.fn(async () => response), compactResult: (value: unknown) => value }));
it.each(["diagram_create", "diagram_get", "diagram_open_editor"])("reports actual success and failure for %s", async (name) => {
  const handlers = new Map<string, (input: object) => Promise<{ isError: boolean }>>();
  registerDrawitTools({ registerTool: (id: string, _config: unknown, handler: (input: object) => Promise<{ isError: boolean }>) => handlers.set(id, handler) } as never);
  response.ok = true; expect((await handlers.get(name)!({ title: "test" })).isError).toBe(false);
  response.ok = false; expect((await handlers.get(name)!({ title: "test" })).isError).toBe(true);
});
