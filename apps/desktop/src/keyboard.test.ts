// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isEditingTarget, shortcut } from "./keyboard.js";

const event = (key: string, changes = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...changes });
describe("editor shortcuts", () => {
  it.each([false, true])("uses the platform modifier (mac=%s)", (mac) => {
    const modifier = mac ? { metaKey: true } : { ctrlKey: true };
    const expected = { z: "undo", y: "redo", s: "save", c: "copy", x: "cut", v: "paste", d: "duplicate", a: "selectAll", g: "group", "0": "fit", "+": "zoomIn", "-": "zoomOut" };
    for (const [key, action] of Object.entries(expected)) expect(shortcut(event(key, modifier), mac)).toBe(action);
    expect(shortcut(event("z", { ...modifier, shiftKey: true }), mac)).toBe("redo");
    expect(shortcut(event("s", mac ? { ctrlKey: true } : { metaKey: true }), mac)).toBeNull();
  });
  it("supports delete, backspace, movement and deselection", () => {
    for (const [key, action] of Object.entries({ Delete: "delete", Backspace: "delete", Escape: "escape", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" })) expect(shortcut(event(key), false)).toBe(action);
  });
  it("protects form controls and nested editable content", () => {
    for (const tag of ["input", "textarea", "select"]) expect(isEditingTarget(document.createElement(tag))).toBe(true);
    const editable = document.createElement("div"); editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span"); editable.append(child);
    expect(isEditingTarget(child)).toBe(true);
    expect(isEditingTarget(document.createElement("button"))).toBe(false);
  });
});
