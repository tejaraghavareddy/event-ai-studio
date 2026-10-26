import type { ErrorCode } from "./schemas";

/** A failure that maps to a specific HTTP status and JSON error code. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}
