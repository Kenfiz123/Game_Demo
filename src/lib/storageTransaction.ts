import { STORAGE_KEY } from "./storage";

export const STORAGE_TRANSACTION_LOCK = STORAGE_KEY + "-mutation-lock";
export interface StorageLockManager {
  request<T>(name: string, options: { mode: "exclusive"; signal?: AbortSignal }, operation: () => T | Promise<T>): Promise<T>;
}
export type StorageTransactionResult<T> = { success: true; value: T } | { success: false };

/**
 * One origin-scoped Web Lock protects the entire read→modify→save transaction.
 * No unlocked fallback: unsupported/blocked storage must never risk item loss.
 * https://www.w3.org/TR/web-locks/ — the browser releases the lock when its callback settles.
 */
export async function withStorageTransaction<T>(
  operation: () => T | Promise<T>,
  options: { lockManager?: StorageLockManager | null; signal?: AbortSignal } = {},
): Promise<StorageTransactionResult<T>> {
  try {
    const manager = options.lockManager === undefined
      ? (typeof navigator !== "undefined" ? navigator.locks : undefined)
      : options.lockManager;
    if (!manager || typeof manager.request !== "function" || options.signal?.aborted) return { success: false };
    const value = await manager.request(STORAGE_TRANSACTION_LOCK, { mode: "exclusive", signal: options.signal }, () => {
      if (options.signal?.aborted) throw new Error("Storage transaction cancelled");
      return operation();
    });
    return { success: true, value };
  } catch {
    return { success: false };
  }
}
