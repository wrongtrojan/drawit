export const errorCodes = [
  "REVISION_CONFLICT",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "SCHEMA_INCOMPATIBLE",
  "EDITOR_NOT_RUNNING",
  "PATH_FORBIDDEN",
  "TRANSACTION_FAILED",
  "EXPORT_FAILED",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export class DrawitError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DrawitError";
    this.code = code;
    this.details = details;
  }
}

export function asDrawitError(error: unknown, fallback: ErrorCode = "TRANSACTION_FAILED"): DrawitError {
  if (error instanceof DrawitError) return error;
  const message = error instanceof Error ? error.message : "Unexpected failure";
  return new DrawitError(fallback, message);
}
