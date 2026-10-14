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
