type Context = { documentId?: string; revision?: number; nodeId?: string; operations?: string[] };
let context: Context = {};
const records: unknown[] = [];
export function diagnosticContext(value: Context) { context = value; }
export function reportError(error: unknown, componentStack?: string, extra: Context = {}) {
  const record = { at: new Date().toISOString(), name: error instanceof Error ? error.name : "Error", stack: error instanceof Error ? error.stack?.split("\n").slice(1, 10).join("\n") : undefined, componentStack: componentStack?.slice(0, 3000), ...context, ...extra };
  records.push(record); if (records.length > 200) records.shift();
  const invoke = (window as unknown as { __TAURI_INTERNALS__?: { invoke: (command: string, args: object) => Promise<unknown> } }).__TAURI_INTERNALS__?.invoke;
  if (invoke) void invoke("drawit_diagnostic", { record }).catch(() => undefined);
  else console.error("drawit diagnostic", record);
}
export function diagnosticRecords() { return [...records]; }
