export type EditorAction = "undo" | "redo" | "save" | "copy" | "cut" | "paste" | "duplicate" | "selectAll" | "group" | "delete" | "fit" | "zoomIn" | "zoomOut" | "escape" | "left" | "right" | "up" | "down";
export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
export const modifierLabel = () => isMac() ? "⌘" : "Ctrl+";

export function shortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac: boolean): EditorAction | null {
  if (event.altKey) return null;
  const modifier = mac ? event.metaKey : event.ctrlKey;
  const key = event.key.toLowerCase();
  if (modifier) {
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y") return "redo";
    const actions: Record<string, EditorAction> = { s: "save", c: "copy", x: "cut", v: "paste", d: "duplicate", a: "selectAll", g: "group", "0": "fit", "+": "zoomIn", "=": "zoomIn", "-": "zoomOut" };
    return actions[key] ?? null;
  }
  if (event.metaKey || event.ctrlKey) return null;
  const actions: Record<string, EditorAction> = { delete: "delete", backspace: "delete", escape: "escape", arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down" };
  return actions[key] ?? null;
}

export function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'));
}
