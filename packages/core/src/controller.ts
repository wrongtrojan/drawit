import { cloneDocument } from "./document.js";
import { asDrawitError, DrawitError } from "./errors.js";
import { createId } from "./ids.js";
import { applyOperationsToDraft, summarizeChanges, type ChangeSummary, type DiagramOperation } from "./operations.js";
import type { DiagramDocument } from "./schema.js";
import { validateDocument, type Issue } from "./validate.js";

export type ChangeSource = "gui" | "mcp" | "system";

export interface OperationRecord {
  operationId: string;
  revision: number;
  source: ChangeSource;
  summary: string;
  at: string;
}

export interface ApplyRequest {
  expectedRevision: number;
  operations: DiagramOperation[];
  source: ChangeSource;
}

export type ApplySuccess = {
  ok: true;
  operationId: string;
  documentId: string;
  revision: number;
  summary: ChangeSummary;
  warnings: Issue[];
  document: DiagramDocument;
};

export type ApplyFailure = {
  ok: false;
  code: DrawitError["code"];
  message: string;
  currentRevision?: number;
  issues?: Issue[];
};

export type ApplyResult = ApplySuccess | ApplyFailure;

const HISTORY_LIMIT = 100;

export class DocumentController {
  private document: DiagramDocument;
  private savedJson: string;
  private undoStack: DiagramDocument[] = [];
  private redoStack: DiagramDocument[] = [];
  private tail: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(document: DiagramDocument, record: OperationRecord | null, dirty: boolean) => void>();
  private records: OperationRecord[] = [];
  private filePath: string | null;

  constructor(document: DiagramDocument, filePath: string | null = null) {
    this.document = document;
    this.savedJson = JSON.stringify(document);
    this.filePath = filePath;
  }

  get path(): string | null {
    return this.filePath;
  }

  enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  subscribe(listener: (document: DiagramDocument, record: OperationRecord | null, dirty: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): Promise<DiagramDocument> {
    return this.enqueue(() => cloneDocument(this.document));
  }

  isDirty(): Promise<boolean> {
    return this.enqueue(() => JSON.stringify(this.document) !== this.savedJson);
  }

  getRecords(): Promise<OperationRecord[]> {
    return this.enqueue(() => [...this.records]);
  }

  peekHistory(): { undo: boolean; redo: boolean } {
    return { undo: this.undoStack.length > 0, redo: this.redoStack.length > 0 };
  }

  markSaved(filePath = this.filePath): Promise<void> {
    return this.enqueue(() => {
      this.filePath = filePath;
      this.savedJson = JSON.stringify(this.document);
    });
  }

  markSavedSnapshot(snapshot: DiagramDocument, filePath: string): Promise<void> {
    return this.enqueue(() => {
      if (snapshot.documentId !== this.document.documentId || snapshot.revision > this.document.revision) throw new DrawitError("REVISION_CONFLICT", "Saved snapshot no longer belongs to this document");
      this.filePath = filePath;
      this.savedJson = JSON.stringify(snapshot);
    });
  }

  replace(document: DiagramDocument, filePath: string | null, source: ChangeSource): Promise<ApplySuccess> {
    return this.enqueue(() => {
      this.document = cloneDocument(document);
      this.filePath = filePath;
      this.savedJson = JSON.stringify(this.document);
      this.undoStack = [];
      this.redoStack = [];
      const record = this.pushRecord(source, "opened document");
      const snapshot = cloneDocument(this.document);
      this.emit(snapshot, record);
      return {
        ok: true as const,
        operationId: record.operationId,
        documentId: snapshot.documentId,
        revision: snapshot.revision,
        summary: { addedNodeIds: [], updatedNodeIds: [], deletedNodeIds: [], addedEdgeIds: [], updatedEdgeIds: [], deletedEdgeIds: [] },
        warnings: validateDocument(snapshot).filter((item) => item.severity !== "error"),
        document: snapshot,
      };
    });
  }

  apply(request: ApplyRequest): Promise<ApplyResult> {
    return this.enqueue(() => this.commit(request));
  }

  preview(request: ApplyRequest): Promise<ApplyResult> {
    return this.enqueue(() => {
      const result = this.evaluate(request);
      if (!result.ok) return result;
      const document = cloneDocument(result.document);
      document.revision = this.document.revision;
      return { ...result, revision: this.document.revision, document };
    });
  }

  undo(expectedRevision: number, source: ChangeSource): Promise<ApplyResult> {
    return this.enqueue(() => this.restore("undo", expectedRevision, source));
  }

  redo(expectedRevision: number, source: ChangeSource): Promise<ApplyResult> {
    return this.enqueue(() => this.restore("redo", expectedRevision, source));
  }

  private restore(direction: "undo" | "redo", expectedRevision: number, source: ChangeSource): ApplyResult {
    if (this.document.revision !== expectedRevision) {
      return this.conflict();
    }
    const stack = direction === "undo" ? this.undoStack : this.redoStack;
    const previous = stack.pop();
    if (!previous) {
      return { ok: false, code: "TRANSACTION_FAILED", message: direction === "undo" ? "Nothing to undo" : "Nothing to redo", currentRevision: this.document.revision };
    }
    const opposite = direction === "undo" ? this.redoStack : this.undoStack;
    opposite.push(cloneDocument(this.document));
    const restored = cloneDocument(previous);
    restored.revision = this.document.revision + 1;
    this.document = restored;
    const record = this.pushRecord(source, direction);
    const snapshot = cloneDocument(this.document);
    this.emit(snapshot, record);
    return {
      ok: true,
      operationId: record.operationId,
      documentId: snapshot.documentId,
      revision: snapshot.revision,
      summary: { addedNodeIds: [], updatedNodeIds: [], deletedNodeIds: [], addedEdgeIds: [], updatedEdgeIds: [], deletedEdgeIds: [] },
      warnings: validateDocument(snapshot).filter((item) => item.severity !== "error"),
      document: snapshot,
    };
  }

  private commit(request: ApplyRequest): ApplyResult {
    const evaluated = this.evaluate(request);
    if (!evaluated.ok) return evaluated;
    this.undoStack.push(cloneDocument(this.document));
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.document = evaluated.document;
    const record = this.pushRecord(request.source, summarizeChanges(evaluated.summary));
    const snapshot = cloneDocument(this.document);
    this.emit(snapshot, record);
    return { ...evaluated, operationId: record.operationId, document: snapshot };
  }

  private evaluate(request: ApplyRequest): ApplyResult {
    if (this.document.revision !== request.expectedRevision) return this.conflict();
    const draft = cloneDocument(this.document);
    try {
      const summary = applyOperationsToDraft(draft, request.operations);
      const issues = validateDocument(draft);
      const errors = issues.filter((item) => item.severity === "error");
      if (errors.length > 0) {
        return { ok: false, code: "VALIDATION_ERROR", message: errors.map((item) => item.message).join("; "), currentRevision: this.document.revision, issues: errors };
      }
      draft.revision += 1;
      return {
        ok: true,
        operationId: "preview",
        documentId: draft.documentId,
        revision: draft.revision,
        summary,
        warnings: issues.filter((item) => item.severity !== "error"),
        document: draft,
      };
    } catch (error) {
      const wrapped = asDrawitError(error, "VALIDATION_ERROR");
      return {
        ok: false,
        code: wrapped.code,
        message: wrapped.message,
        currentRevision: this.document.revision,
        issues: Array.isArray(wrapped.details) ? (wrapped.details as Issue[]) : undefined,
      };
    }
  }

  private conflict(): ApplyFailure {
    return {
      ok: false,
      code: "REVISION_CONFLICT",
      message: `Revision conflict. Read the document again and retry with expectedRevision ${this.document.revision}.`,
      currentRevision: this.document.revision,
    };
  }

  private pushRecord(source: ChangeSource, summary: string): OperationRecord {
    const record: OperationRecord = {
      operationId: createId("op"),
      revision: this.document.revision,
      source,
      summary,
      at: new Date().toISOString(),
    };
    this.records.push(record);
    if (this.records.length > HISTORY_LIMIT) this.records.shift();
    return record;
  }

  private emit(document: DiagramDocument, record: OperationRecord | null): void {
    const dirty = JSON.stringify(document) !== this.savedJson;
    for (const listener of this.listeners) listener(document, record, dirty);
  }
}
