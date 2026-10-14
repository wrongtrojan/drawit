import { expect, it, vi } from "vitest";
import { registerDrawitTools } from "./tools.js";
const response = vi.hoisted(() => ({ ok: true, document: undefined as unknown }));
vi.mock("./invoke.js", async (importOriginal) => { const original = await importOriginal<typeof import("./invoke.js")>(); return { ...original, invoke: vi.fn(async () => response) }; });
it.each(["diagram_create", "diagram_get", "diagram_open_editor"])("reports actual success and failure for %s", async (name) => {
  const handlers = new Map<string, (input: object) => Promise<{ isError: boolean }>>();
  registerDrawitTools({ registerTool: (id: string, _config: unknown, handler: (input: object) => Promise<{ isError: boolean }>) => handlers.set(id, handler) } as never);
  response.ok = true; expect((await handlers.get(name)!({ title: "test" })).isError).toBe(false);
  response.ok = false; expect((await handlers.get(name)!({ title: "test" })).isError).toBe(true);
});
it("returns the whole document from diagram_get, including title and semantic styles", async () => {
  const { createDocument } = await import("@drawit/core");
  const document = createDocument("structured read"); response.ok = true; response.document = document;
  const handlers = new Map<string, (input: object) => Promise<{ content: Array<{ text: string }> }>>();
  registerDrawitTools({ registerTool: (id: string, _config: unknown, handler: (input: object) => Promise<{ content: Array<{ text: string }> }>) => handlers.set(id, handler) } as never);
  const result = await handlers.get("diagram_get")!({});
  expect(JSON.parse(result.content[0]!.text).document).toEqual(document); response.document = undefined;
});
