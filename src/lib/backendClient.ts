import type { BackendCommand, BackendCommandReply, BackendErrorCode, BackendSnapshot } from "@/types/backend";
import { validateArcadeSettings } from "@/data/economyConfig";

const REQUEST_TIMEOUT_MS = 10_000;
export class BackendRequestError extends Error {
  constructor(message: string, readonly status = 0, readonly code?: BackendErrorCode) {
    super(message);
    this.name = "BackendRequestError";
  }
  get uncertain() { return this.status === 0 || this.status >= 500; }
}
interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}
const abortError = () => new DOMException("Request aborted", "AbortError");

/** A retry reuses the exact body and idempotency key; it never creates a second draw. */
export async function backendRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers = { ...(method === "POST" ? { "Content-Type": "application/json" } : {}), ...options.headers };
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.signal?.aborted) throw abortError();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(path, { method, body, headers, signal: controller.signal, credentials: "same-origin", cache: "no-store" });
      const value: unknown = await response.json().catch(() => null);
      if (options.signal?.aborted) throw abortError();
      if (controller.signal.aborted) throw new TypeError("Backend request timed out");
      if (!response.ok) {
        const error = value && typeof value === "object" && "error" in value ? value.error : null;
        const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code as BackendErrorCode : undefined;
        const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.length <= 500
          ? error.message : "Không thể kết nối bộ lưu dữ liệu. Hãy thử kết nối lại.";
        if (response.status === 503 && attempt === 0) continue;
        throw new BackendRequestError(message, response.status, code);
      }
      if (value === null) throw new BackendRequestError("Server trả về dữ liệu không hợp lệ.", 502);
      return value as T;
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      if (error instanceof BackendRequestError) throw error;
      if (attempt === 1) throw new BackendRequestError("Mất kết nối với backend. Kết quả đã lưu (nếu có) sẽ được tải lại khi kết nối lại.");
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  throw new BackendRequestError("Không thể kết nối bộ lưu dữ liệu.");
}
function verifySnapshot(value: BackendSnapshot): BackendSnapshot {
  if (!value || typeof value !== "object" || !value.player || typeof value.player.id !== "string" || typeof value.player.createdAt !== "string" ||
    !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.demoToolsEnabled !== "boolean" || typeof value.canImportLegacy !== "boolean" ||
    !value.state || value.state.version !== 2 || !Number.isSafeInteger(value.state.exPoints) || value.state.exPoints < 0 ||
    !Array.isArray(value.state.ownedItemIds) || !value.state.ownedItemIds.every(id => typeof id === "string") ||
    !Array.isArray(value.state.history) || !Array.isArray(value.state.tradeHistory) || !validateArcadeSettings(value.state.settings) ||
    !value.state.equipped || typeof value.state.equipped !== "object" || Array.isArray(value.state.equipped)) {
    throw new BackendRequestError("Dữ liệu lưu trên server chưa hợp lệ. Hãy kết nối lại.", 502);
  }
  return value;
}
export function reconcileBackendSnapshot(current: BackendSnapshot | null, next: BackendSnapshot, allowPlayerChange = false): BackendSnapshot {
  if (current && current.player.id !== next.player.id && !allowPlayerChange) throw new BackendRequestError("Phiên lưu dữ liệu đã thay đổi. Hãy kết nối lại trước khi chơi.", 409, "SESSION_CHANGED");
  return current?.player.id === next.player.id && next.revision < current.revision ? current : next;
}
export async function bootstrapBackend(signal?: AbortSignal): Promise<BackendSnapshot> {
  return verifySnapshot(await backendRequest<BackendSnapshot>("/api/session", { method: "POST", body: {}, signal }));
}
export async function readBackend(signal?: AbortSignal): Promise<BackendSnapshot> {
  return verifySnapshot(await backendRequest<BackendSnapshot>("/api/state", { signal }));
}
export async function sendBackendCommand(command: BackendCommand, playerId: string, signal?: AbortSignal): Promise<BackendCommandReply> {
  const reply = await backendRequest<BackendCommandReply>("/api/commands", {
    method: "POST", body: command, signal,
    headers: { "Idempotency-Key": crypto.randomUUID(), "X-Xperience-Player": playerId },
  });
  verifySnapshot(reply?.snapshot);
  if (!reply.result || typeof reply.result.success !== "boolean") throw new BackendRequestError("Server chưa xác nhận thao tác. Hãy kết nối lại.", 502);
  if (reply.result.success && (command.type === "play" || command.type === "trade-up")) {
    if (!("id" in reply.result) || typeof reply.result.id !== "string" || !("reward" in reply.result) ||
      (command.type === "play" && (!reply.result.reward || typeof reply.result.reward.item?.id !== "string")) ||
      (command.type === "trade-up" && (!("won" in reply.result) || typeof reply.result.won !== "boolean"))) {
      throw new BackendRequestError("Server chưa xác nhận đầy đủ kết quả. Hãy kết nối lại.", 502);
    }
  }
  return reply;
}
