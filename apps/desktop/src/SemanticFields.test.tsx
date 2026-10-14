// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createDocument, DocumentController, materializeNode, type DiagramNode, type NodePatch } from "@drawit/core";
import { SemanticFields } from "./SemanticFields.js";
afterEach(cleanup);
describe("editing semantic fields", () => {
  it.each([
    ["class", "类名", "Customer", "name"], ["entity", "名称", "客户", "name"], ["relationship", "名称", "购买", "name"],
    ["tensor", "形状", "[32, 128, 768]", "shape"], ["timeline", "里程碑", "验收完成", "milestones"],
  ])("edits %s through fields and the document controller", async (type, label, value, field) => {
    const document = createDocument("属性编辑");
    const node = materializeNode({ type, ...(type === "timeline" ? { milestones: [{ date: "2026-01-01", label: "开始" }] } : {}) }, "selected");
    document.nodes = [node]; const controller = new DocumentController(document);
    let pending = Promise.resolve();
    render(<SemanticFields node={node} onPatch={(patch: NodePatch) => { pending = controller.apply({ expectedRevision: 0, source: "gui", operations: [{ op: "updateNodes", updates: [{ id: node.id, patch }] }] }).then((result) => { expect(result.ok).toBe(true); }); }} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value } }); await pending;
    const saved = (await controller.getSnapshot()).nodes[0]! as DiagramNode & Record<string, unknown>;
    expect(saved.id).toBe("selected"); expect(saved.type).toBe(type);
    if (field === "milestones") expect(saved.milestones).toEqual([{ date: "2026-01-01", label: value }]); else expect(saved[field]).toBe(value);
  });
  it.each([["state", "状态类型", "final", "kind"], ["swimlane", "方向", "vertical", "direction"]])("edits %s selectors", async (type, label, value, field) => {
    const node = materializeNode({ type }, "selected"); let patch: NodePatch = {};
    render(<SemanticFields node={node} onPatch={(next) => patch = next} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(patch).toEqual({ [field]: value });
  });
  it("edits axis ticks and class lists as semantic values", () => {
    const axis = materializeNode({ type: "axis" }, "axis"); let patch: NodePatch = {};
    render(<SemanticFields node={axis} onPatch={(next) => patch = next} />);
    fireEvent.change(screen.getAllByLabelText("刻度标签")[0]!, { target: { value: "原点" } });
    expect(patch.ticks?.[0]).toEqual({ value: 0, label: "原点" });
    cleanup();
    render(<SemanticFields node={materializeNode({ type: "class" }, "class")} onPatch={(next) => patch = next} />);
    fireEvent.change(screen.getByLabelText("属性（每行一项）"), { target: { value: "+ id: string\n+ name: string" } });
    expect(patch.attributes).toEqual(["+ id: string", "+ name: string"]);
  });
});
