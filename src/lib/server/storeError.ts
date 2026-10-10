import type { BackendErrorCode } from "@/types/backend";

/** Public errors contain no database paths, SQL, or session credentials. */
export class StoreError extends Error {
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode, message: string = code) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}
