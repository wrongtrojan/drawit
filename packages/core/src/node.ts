import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DrawitError } from "./errors.js";
import { parseDocument } from "./document.js";
import type { DiagramDocument } from "./schema.js";

export function drawitHome(): string {
  if (process.env.DRAWIT_HOME) return resolve(process.env.DRAWIT_HOME);
  const base = process.env.APPDATA ?? join(homedir(), ".drawit");
  return join(base, "drawit");
}

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
  const temporary = `${filePath}.${process.pid}.tmp`;
  const backup = `${filePath}.bak`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
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
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    throw new DrawitError("PATH_FORBIDDEN", "Export file name cannot contain a path");
  }
  return assertInsideRoot(exportsDir(home), join(exportsDir(home), fileName));
}
