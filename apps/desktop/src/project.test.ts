import { createDocument } from "@drawit/core";
import { describe, expect, it } from "vitest";
import { duplicateElements, orderNodes, toFlowNodes } from "./project.js";

describe("editor projection", () => {
  it("orders parents before children and preserves selection", () => {
    const document = createDocument("投影");
    document.nodes = [
      { id: "child", type: "rectangle", text: "子", x: 10, y: 10, width: 80, height: 40, parentId: "box" },
      { id: "box", type: "container", title: "容器", x: 0, y: 0, width: 200, height: 160 },
    ];
    expect(orderNodes(document.nodes).map((node) => node.id)).toEqual(["box", "child"]);
    const flow = toFlowNodes(document, ["child"]);
    expect(flow[1]?.selected).toBe(true);
    expect(flow[1]?.parentId).toBe("box");
  });

  it("duplicates nodes with new ids", () => {
    const document = createDocument("复制");
    document.nodes = [{ id: "a", type: "text", text: "标题", x: 10, y: 20, width: 80, height: 32 }];
    const operations = duplicateElements(document, ["a"]);
    expect(operations[0]?.op).toBe("addNodes");
    if (operations[0]?.op !== "addNodes") return;
    expect(operations[0].nodes[0]?.id).not.toBe("a");
    expect(operations[0].nodes[0]?.x).toBe(34);
  });
});

it("copies group descendants and rewrites internal semantic references", async () => {
  const { materializeNode, DocumentController } = await import("@drawit/core");
  const { captureElements, pasteElements } = await import("./project.js");
  const document = createDocument("分组复制");
  document.nodes = [
    materializeNode({ id: "group", type: "container", x: 100, y: 100, width: 600, height: 480 }, "group"),
    materializeNode({ id: "client", type: "lifeline", parentId: "group", x: 40, y: 40 }, "client"),
    materializeNode({ id: "server", type: "lifeline", parentId: "group", x: 300, y: 40 }, "server"),
    materializeNode({ id: "request", type: "message", parentId: "group", sourceId: "client", targetId: "server", y: 120 }, "request"),
  ];
  const clipboard = captureElements(document, ["group"]);
  expect(clipboard.nodes).toHaveLength(4);
  const controller = new DocumentController(createDocument("粘贴"));
  const result = await controller.apply({ source: "gui", expectedRevision: 0, operations: pasteElements(clipboard) });
  expect(result.ok).toBe(true);
  const pasted = await controller.getSnapshot();
  expect(pasted.nodes[0]?.x).toBe(124);
  expect(pasted.nodes[1]?.x).toBe(40);
  const message = pasted.nodes.find((node) => node.type === "message");
  if (message?.type !== "message") throw new Error("Missing message");
  expect(message.sourceId).toBe(pasted.nodes[1]?.id);
  expect(message.targetId).toBe(pasted.nodes[2]?.id);
});
