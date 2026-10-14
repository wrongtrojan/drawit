import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentController } from "./controller.js";
import { createDocument, parseDocument } from "./document.js";
import { DrawitError } from "./errors.js";
import { createBinarySearchExample } from "./example.js";
import { assertInsideRoot, readDocumentFile, safeExportPath, writeDocumentFile } from "./node.js";
import type { DiagramOperation } from "./operations.js";
import { validateDocument } from "./validate.js";

function applyOps(controller: DocumentController, revision: number, operations: DiagramOperation[]) {
  return controller.apply({ expectedRevision: revision, operations, source: "gui" });
}

describe("document schema", () => {
  it("creates and parses a valid document", () => {
    const created = createDocument("流程图");
    const parsed = parseDocument(created);
    expect(parsed.title).toBe("流程图");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.revision).toBe(0);
    expect(validateDocument(parsed).some((issue) => issue.severity === "error")).toBe(false);
  });

  it("parses the binary search example", () => {
    const example = createBinarySearchExample();
    expect(example.nodes).toHaveLength(8);
    expect(example.edges).toHaveLength(8);
    expect(example.documentId).toBe("doc_binary_search");
  });

  it("keeps unknown fields in meta", () => {
    const document = parseDocument({ ...createDocument("保留"), vendor: "drawit-test" });
    expect(document.meta?.vendor).toBe("drawit-test");
  });

  it("rejects an illegal node", () => {
    const raw = createDocument("坏节点");
    expect(() => parseDocument({ ...raw, nodes: [{ id: "n1", type: "cloud", x: 0, y: 0, width: 10, height: 10 }] })).toThrow(/Invalid/);
  });

  it("rejects duplicate ids", () => {
    const raw = {
      ...createDocument("重复"),
      nodes: [
        { id: "n1", type: "rectangle", x: 0, y: 0, width: 40, height: 40, text: "A" },
        { id: "n1", type: "text", x: 80, y: 0, width: 40, height: 40, text: "B" },
      ],
    };
    expect(() => parseDocument(raw)).toThrow(/Duplicate id/);
  });

  it("rejects a missing edge endpoint", () => {
    const raw = {
      ...createDocument("悬空"),
      nodes: [{ id: "n1", type: "rectangle", x: 0, y: 0, width: 80, height: 40, text: "A" }],
      edges: [{ id: "e1", source: "n1", target: "missing" }],
    };
    expect(() => parseDocument(raw)).toThrow(/missing node/);
  });

  it("rejects an incompatible schema version", () => {
    try {
      parseDocument({ ...createDocument("版本"), schemaVersion: 99 });
      expect.fail("expected schema error");
    } catch (error) {
      expect(error).toBeInstanceOf(DrawitError);
      expect((error as DrawitError).code).toBe("SCHEMA_INCOMPATIBLE");
    }
  });
});

describe("document controller", () => {
  it("adds, updates, and deletes nodes with related edges", async () => {
    const controller = new DocumentController(createDocument("编辑"));
    const added = await applyOps(controller, 0, [
      { op: "addNodes", nodes: [{ type: "rectangle", id: "a", text: "A" }, { type: "rectangle", id: "b", text: "B", x: 240 }] },
    ]);
    expect(added.ok).toBe(true);
    const connected = await applyOps(controller, 1, [{ op: "connect", edges: [{ id: "e1", source: "a", target: "b" }] }]);
    expect(connected.ok).toBe(true);
    const updated = await applyOps(controller, 2, [{ op: "updateNodes", updates: [{ id: "a", patch: { text: "开始" } }] }]);
    expect(updated.ok).toBe(true);
    const removed = await applyOps(controller, 3, [{ op: "deleteElements", nodeIds: ["a"], edgeIds: [] }]);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.document.nodes.map((node) => node.id)).toEqual(["b"]);
    expect(removed.document.edges).toEqual([]);
    expect(validateDocument(removed.document).some((issue) => issue.severity === "error")).toBe(false);
  });

  it("commits a batch and rolls back a failed batch", async () => {
    const controller = new DocumentController(createDocument("事务"));
    const ok = await applyOps(controller, 0, [
      { op: "addNodes", nodes: [{ type: "rectangle", id: "a", text: "A" }, { type: "rectangle", id: "b", text: "B", x: 220 }] },
      { op: "connect", edges: [{ id: "e1", source: "a", target: "b", label: "next" }] },
    ]);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.revision).toBe(1);
    const before = await controller.getSnapshot();
    const failed = await applyOps(controller, 1, [
      { op: "addNodes", nodes: [{ type: "text", id: "c", text: "C" }] },
      { op: "connect", edges: [{ source: "c", target: "missing" }] },
    ]);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.code).toBe("VALIDATION_ERROR");
    const after = await controller.getSnapshot();
    expect(after).toEqual(before);
  });

  it("rejects a stale revision and supports undo and redo", async () => {
    const controller = new DocumentController(createDocument("版本"));
    await applyOps(controller, 0, [{ op: "addNodes", nodes: [{ type: "text", id: "a", text: "第一版" }] }]);
    const conflict = await applyOps(controller, 0, [{ op: "updateNodes", updates: [{ id: "a", patch: { text: "过期" } }] }]);
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.code).toBe("REVISION_CONFLICT");
    expect(conflict.currentRevision).toBe(1);
    const undone = await controller.undo(1, "gui");
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.document.nodes).toEqual([]);
    expect(undone.revision).toBe(2);
    const redone = await controller.redo(2, "gui");
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.document.nodes).toHaveLength(1);
    expect(validateDocument(redone.document).some((issue) => issue.severity === "error")).toBe(false);
  });

  it("previews without committing", async () => {
    const controller = new DocumentController(createDocument("预览"));
    const preview = await controller.preview({
      expectedRevision: 0,
      source: "mcp",
      operations: [{ op: "addNodes", nodes: [{ type: "note", id: "n1", text: "只是预览" }] }],
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.document.nodes).toHaveLength(1);
    expect(preview.revision).toBe(0);
    const snapshot = await controller.getSnapshot();
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.revision).toBe(0);
  });
});

describe("files", () => {
  it("round-trips a document and rejects paths outside the root", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-"));
    const file = join(home, "documents", "doc_sample.drawit.json");
    const document = createBinarySearchExample();
    await writeDocumentFile(file, document);
    const loaded = await readDocumentFile(file);
    expect(loaded).toEqual(document);
    const text = await readFile(file, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(() => assertInsideRoot(home, join(home, "..", "secret.txt"))).toThrow(DrawitError);
    expect(() => safeExportPath(home, "..\\secret.png")).toThrow(DrawitError);
  });
});
