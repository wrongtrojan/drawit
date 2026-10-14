import { mkdtemp, mkdir, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDocument, materializeNode, parseDocument, DocumentController } from "./index.js";
import { safeExportPath, readDocumentFile, writeDocumentFile, writeExportFile } from "./node.js";

/** Windows often blocks symlinks without developer mode; skip the case instead of failing CI locally. */
async function symlinkUnlessWin32Blocked(target: string, path: string, type?: "dir"): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (process.platform === "win32" && (code === "EPERM" || code === "ENOENT")) return false;
    throw error;
  }
}

describe("filesystem and document safety", () => {
  it.each(["../escape.svg", "a/b.png", "a\\b.svg", "C:stream.svg", "CON.png", "aux.svg", "LPT1.svg", "COM¹.png", "trail. ", "", "nul", "a\u0000.svg"])("rejects unsafe file name %s", (name) => expect(() => safeExportPath("/tmp/test", name)).toThrow());
  it("rejects linked files and linked export directories without changing the destination", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-links-")); await mkdir(join(home, "documents")); await mkdir(join(home, "exports"));
    const original = join(home, "original.drawit.json"); await writeDocumentFile(original, createDocument("original"));
    const before = await readFile(original, "utf8"); const linked = join(home, "documents/linked.drawit.json");
    if (!(await symlinkUnlessWin32Blocked(original, linked))) return;
    await expect(writeDocumentFile(linked, createDocument("attack"))).rejects.toThrow("regular file"); await expect(readDocumentFile(linked)).rejects.toThrow("regular file");
    const linkedDirectory = join(home, "other");
    if (!(await symlinkUnlessWin32Blocked(join(home, "exports"), linkedDirectory, "dir"))) return;
    await expect(writeExportFile(join(linkedDirectory, "attack.svg"), "attack")).rejects.toThrow("symbolic link");
    expect(await readFile(original, "utf8")).toBe(before);
  });
  it("rolls back unsafe inline SVG and extreme coordinates", async () => {
    const controller = new DocumentController(createDocument()); const before = await controller.getSnapshot();
    for (const input of [{ type: "image" as const, src: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+" }, { type: "text" as const, x: 1e300 }]) {
      const result = await controller.apply({ source: "mcp", expectedRevision: 0, operations: [{ op: "addNodes", nodes: [input] }] });
      expect(result.ok).toBe(false); expect(await controller.getSnapshot()).toEqual(before);
    }
  });
  it("rejects deep trees before recursive parsing or rendering", () => {
    let root = { label: "end", children: [] as any[] }; for (let i = 0; i < 250; i++) root = { label: "branch", children: [root] };
    const document = createDocument(); expect(() => parseDocument({ ...document, nodes: [{ ...materializeNode({ type: "text" }, "tree"), type: "tree", root }] })).toThrow("budget");
  });
});
