/** Shared, finite budgets for untrusted documents and rendering. */
export const LIMITS = Object.freeze({ messageBytes: 8 * 1024 * 1024, nodes: 2000, edges: 1000, treeDepth: 64, treeNodes: 5000, cells: 40000, textLength: 16000, coordinate: 1_000_000, renderPixels: 16_000_000, renderSide: 8192, renderTimeoutMs: 10000, formulaTimeoutMs: 5000 });

export function checkInputBudget(input: unknown): void {
  const stack = [{ value: input, depth: 0 }];
  let count = 0;
  let characters = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++count > 200000 || depth > LIMITS.treeDepth * 3) throw new Error("Document exceeds structural budget");
    if (typeof value === "string" && value.length > 500000) throw new Error("Document string exceeds budget");
    if (typeof value === "string") { characters += value.length; if (characters > LIMITS.messageBytes) throw new Error("Document exceeds text budget"); }
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
    }
  }
}
