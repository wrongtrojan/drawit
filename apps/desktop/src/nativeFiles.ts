import type { SessionResponse } from "@drawit/session/protocol";
type Requester = { request: (body: Record<string, unknown>) => Promise<SessionResponse> };
export type NativeInvoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;
export function nativeInvoke(): NativeInvoke | undefined { return (window as unknown as { __TAURI_INTERNALS__?: { invoke: NativeInvoke } }).__TAURI_INTERNALS__?.invoke; }
export async function confirmAction(message: string): Promise<boolean> { const invoke = nativeInvoke(); return invoke ? invoke<boolean>("drawit_confirm_action", { message }) : window.confirm(message); }
type Choice = { handle: string; path: string };
type Receipt = { path: string; revision: number };
const checked = (response: SessionResponse) => { if (!response.ok) throw new Error(response.message ?? "文件操作失败"); return response; };

export async function saveDocument(client: Requester, documentId: string, force = false, invoke = nativeInvoke()): Promise<{ response?: SessionResponse; receipt?: Receipt; cancelled?: boolean }> {
  if (!invoke) return { response: checked(await client.request({ type: "save", expectedDocumentId: documentId })) };
  const choice = await invoke<Choice | null>("drawit_choose_directory", { documentId, format: "document", force });
  if (!choice) return { cancelled: true };
  const snapshot = checked(await client.request({ type: "prepareSave", expectedDocumentId: documentId }));
  if (!snapshot.snapshotId || !snapshot.document) throw new Error("会话未提供保存快照");
  let completed = false;
  try {
    const receipt = await invoke<Receipt | null>("drawit_write_artifact", { handle: choice.handle, documentId, revision: snapshot.document.revision, format: "document", payload: JSON.stringify(snapshot.document, null, 2) + "\n" });
    if (!receipt) return { cancelled: true };
    const response = checked(await client.request({ type: "completeSave", expectedDocumentId: documentId, snapshotId: snapshot.snapshotId }));
    completed = true; return { response, receipt };
  } finally { if (!completed) await client.request({ type: "cancelSave", snapshotId: snapshot.snapshotId }).catch(() => undefined); }
}

export async function exportDocument(client: Requester, documentId: string, format: "svg" | "png", invoke = nativeInvoke()): Promise<{ response?: SessionResponse; receipt?: Receipt; cancelled?: boolean }> {
  const choice = invoke ? await invoke<Choice | null>("drawit_choose_directory", { documentId, format, force: true }) : null;
  if (invoke && !choice) return { cancelled: true };
  const response = checked(await client.request({ type: "render", expectedDocumentId: documentId, format, ...(invoke ? {} : { fileName: `${documentId}.${format}` }) }));
  if (!invoke) return { response };
  const receipt = await invoke<Receipt | null>("drawit_write_artifact", { handle: choice!.handle, documentId, revision: response.revision, format, payload: format === "svg" ? response.svg : response.pngBase64 });
  return receipt ? { response, receipt } : { cancelled: true };
}

export async function externalFile(documentId: string, read = false, ack?: string) {
  return nativeInvoke()?.<{ changed: boolean; payload?: string; path?: string; fingerprint?: string }>("drawit_external_file", { documentId, read, ack: ack ?? null });
}
