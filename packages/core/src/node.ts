import { mkdir, readFile, rename, rm, writeFile, realpath, lstat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { LIMITS } from "./limits.js";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DrawitError } from "./errors.js";
import { parseDocument } from "./document.js";
import type { DiagramDocument } from "./schema.js";

export { drawitHome } from "./home.js";
import { drawitHome } from "./home.js";

export function documentsDir(home = drawitHome()): string {
  return join(home, "documents");
}

export function exportsDir(home = drawitHome()): string {
  return join(home, "exports");
}

export function assertInsideRoot(root: string, target: string): string {
  const rootResolved = resolve(root);
  const targetResolved = resolve(target);
  const rel = relative(rootResolved, targetResolved);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return targetResolved;
  throw new DrawitError("PATH_FORBIDDEN", "Path is outside the allowed drawit directories");
}

export async function readDocumentFile(filePath: string): Promise<DiagramDocument> {
  await assertSafeFile(filePath);
  if ((await lstat(filePath)).size > LIMITS.messageBytes) throw new DrawitError("VALIDATION_ERROR", "Document file exceeds size budget");
  const text = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DrawitError("VALIDATION_ERROR", "Document file is not valid JSON");
  }
  return parseDocument(parsed);
}

export async function writeDocumentFile(filePath: string, document: DiagramDocument): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
  await assertSafeFile(filePath);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const backup = `${filePath}.bak`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rm(backup, { force: true });
  try {
    await rename(filePath, backup);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
  }
  try {
    await rename(temporary, filePath);
  } catch (error) {
    try {
      await rename(backup, filePath);
    } catch {
      // The original file could not be restored; the temp file remains beside it.
    }
    throw error;
  }
  await rm(backup, { force: true });
}

export function safeDocumentPath(home: string, documentId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(documentId)) {
    throw new DrawitError("PATH_FORBIDDEN", "Document id cannot be used as a file name");
  }
  return assertInsideRoot(documentsDir(home), join(documentsDir(home), `${documentId}.drawit.json`));
}

export function safeExportPath(home: string, fileName: string): string {
  if (!fileName || fileName.length > 180 || /[<>:"/\\|?*\x00-\x1f]/.test(fileName) || fileName.includes("..") || /[. ]$/.test(fileName) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(fileName)) {
    throw new DrawitError("PATH_FORBIDDEN", "Export file name cannot contain a path");
  }
  return assertInsideRoot(exportsDir(home), join(exportsDir(home), fileName));
}

/** Refuse linked files and linked directory segments at every IO boundary. */
export async function assertSafeFile(filePath: string): Promise<void> {
  const directory = resolve(dirname(filePath));
  // /tmp and /var on macOS are OS aliases; resolve the configured directory first.
  const canonical = await realpath(directory);
  const leaf = await lstat(filePath).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
  if (leaf?.isSymbolicLink() || (leaf && !leaf.isFile())) throw new DrawitError("PATH_FORBIDDEN", "Target must be a regular file");
  const parent = await lstat(directory);
  if (parent.isSymbolicLink()) throw new DrawitError("PATH_FORBIDDEN", "Target directory cannot be a symbolic link");
  // The last directory is documents/exports. Its canonical parent must match its configured parent.
  if (canonical !== join(await realpath(dirname(directory)), basename(directory))) throw new DrawitError("PATH_FORBIDDEN", "Target directory resolves outside its configured parent");
}

export async function writeExportFile(filePath: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await assertSafeFile(filePath);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, { flag: "wx", mode: 0o600 }); await rename(temporary, filePath); }
  finally { await rm(temporary, { force: true }); }
}
