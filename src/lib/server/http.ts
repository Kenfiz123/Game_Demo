import type { BackendErrorBody, BackendErrorCode } from "../../types/backend";
import { getServerConfig, type ServerConfig } from "./config";
import { getStore } from "./database";
import type { XperienceStore } from "./store";
import { CommandValidationError, isUuid, validateCommand } from "./validation";

export const MAX_BODY_BYTES = 1_048_576;
const BODY_TIMEOUT_MS = 10_000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const errorMessages: Record<BackendErrorCode, string> = {
  NO_SESSION: "Phiên đã hết hạn. Vui lòng kết nối lại.",
  SESSION_CHANGED: "Phiên đã thay đổi. Vui lòng tải lại dữ liệu trước khi tiếp tục.",
  INVALID_REQUEST: "Yêu cầu không hợp lệ.",
  INVALID_LEGACY: "Bản lưu cũ không hợp lệ hoặc quá lớn.",
  IMPORT_NOT_ALLOWED: "Chỉ có thể nhập bản lưu cũ vào phiên mới chưa chơi.",
  DEMO_DISABLED: "Công cụ thử nghiệm đang tắt.",
  IDEMPOTENCY_CONFLICT: "Mã thao tác đã được dùng cho một yêu cầu khác.",
  FORBIDDEN: "Nguồn gửi yêu cầu không được phép.",
  PAYLOAD_TOO_LARGE: "Yêu cầu vượt quá giới hạn dung lượng.",
  RATE_LIMITED: "Có quá nhiều yêu cầu. Vui lòng thử lại sau.",
  STORAGE_UNAVAILABLE: "Chưa thể kết nối kho dữ liệu. Vui lòng thử lại.",
};
const errorStatuses: Record<BackendErrorCode, number> = {
  NO_SESSION: 401, SESSION_CHANGED: 409, INVALID_REQUEST: 400, INVALID_LEGACY: 400,
  IMPORT_NOT_ALLOWED: 409, DEMO_DISABLED: 403, IDEMPOTENCY_CONFLICT: 409,
  FORBIDDEN: 403, PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429, STORAGE_UNAVAILABLE: 503,
};
class HttpError extends Error {
  constructor(readonly code: BackendErrorCode) { super(errorMessages[code]); }
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const combined = new Headers(responseHeaders);
  combined.set("Content-Type", "application/json; charset=utf-8");
  if (headers) new Headers(headers).forEach((value, key) => combined.set(key, value));
  return new Response(JSON.stringify(value), { status, headers: combined });
}

function failure(error: unknown): Response {
  let code: BackendErrorCode = "STORAGE_UNAVAILABLE";
  if (error instanceof CommandValidationError) code = "INVALID_REQUEST";
  else if (error && typeof error === "object" && "code" in error &&
           typeof error.code === "string" && Object.hasOwn(errorMessages, error.code)) {
    code = error.code as BackendErrorCode;
  }
  const body: BackendErrorBody = { error: { code, message: errorMessages[code] } };
  return json(body, errorStatuses[code]);
}

function assertSameOrigin(request: Request): void {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  let origin = requestUrl.origin;
  if (host !== null) {
    // Next's internal URL uses its bind hostname, not necessarily the browser's
    // localhost/127.0.0.1/LAN Host. Never replace this authority with forwarded headers.
    if (host.length > 255 || !/^(?:\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+)(?::[0-9]{1,5})?$/.test(host)) {
      throw new HttpError("FORBIDDEN");
    }
    const port = host.match(/:(\d+)$/)?.[1];
    if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) throw new HttpError("FORBIDDEN");
    try { origin = new URL(`${requestUrl.protocol}//${host}`).origin; }
    catch { throw new HttpError("FORBIDDEN"); }
  }
  const site = request.headers.get("sec-fetch-site");
  // Direct local HTTP/HTTPS only. A reverse proxy needs a separately trusted TLS/origin configuration.
  if ((requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") || request.headers.get("origin") !== origin ||
      (site !== null && site !== "same-origin" && site !== "none")) throw new HttpError("FORBIDDEN");
}

function readToken(request: Request, cookieName: string): string | undefined {
  const values = (request.headers.get("cookie") || "").split(";")
    .map(entry => entry.trim()).filter(entry => entry.startsWith(`${cookieName}=`));
  // Ambiguous duplicate cookies are not accepted as an identity.
  if (values.length !== 1) return undefined;
  const token = values[0].slice(cookieName.length + 1);
  return SESSION_TOKEN_PATTERN.test(token) ? token : undefined;
}

/** Bound bytes while streaming, not just the untrusted Content-Length header. */
async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError("INVALID_REQUEST");
  }
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new HttpError("INVALID_REQUEST");
    if (Number(length) > MAX_BODY_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) throw new HttpError("INVALID_REQUEST");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let complete = false;
  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    onAbort = () => reject(new HttpError("INVALID_REQUEST"));
    request.signal.addEventListener("abort", onAbort, { once: true });
  });
  const expiration = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new HttpError("INVALID_REQUEST")), BODY_TIMEOUT_MS);
    timeout.unref?.();
  });
  try {
    while (true) {
      if (request.signal.aborted) throw new HttpError("INVALID_REQUEST");
      const chunk = await Promise.race([reader.read(), expiration, cancellation]);
      if (chunk.done) break;
      byteCount += chunk.value.byteLength;
      if (byteCount > MAX_BODY_BYTES) throw new HttpError("PAYLOAD_TOO_LARGE");
      chunks.push(chunk.value);
    }
    complete = true;
    if (!byteCount) throw new HttpError("INVALID_REQUEST");
    const buffer = new Uint8Array(byteCount);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
    catch { throw new HttpError("INVALID_REQUEST"); }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("INVALID_REQUEST");
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

type StoreApi = Pick<XperienceStore, "bootstrapSession" | "getSnapshot" | "execute" | "health"> & Partial<Pick<XperienceStore, "getMarket">>;
interface ApiDependencies { getStore?: () => StoreApi; getConfig?: () => ServerConfig; }

export function createApiHandlers(dependencies: ApiDependencies = {}) {
  const resolveStore = dependencies.getStore ?? getStore;
  const resolveConfig = dependencies.getConfig ?? getServerConfig;
  return {
    session: async (request: Request): Promise<Response> => {
      try {
        assertSameOrigin(request);
        const body = await readJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) {
          throw new HttpError("INVALID_REQUEST");
        }
        const config = resolveConfig();
        const { token, snapshot } = resolveStore().bootstrapSession(readToken(request, config.sessionCookie));
        const headers = new Headers();
        if (token) {
          const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
          headers.set("Set-Cookie", `${config.sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(config.sessionLifetimeMs / 1_000)}${secure}`);
        }
        return json(snapshot, 200, headers);
      } catch (error) { return failure(error); }
    },
    state: async (request: Request): Promise<Response> => {
      try {
        const token = readToken(request, resolveConfig().sessionCookie);
        if (!token) throw new HttpError("NO_SESSION");
        const snapshot = resolveStore().getSnapshot(token);
        if (!snapshot) throw new HttpError("NO_SESSION");
        return json(snapshot);
      } catch (error) { return failure(error); }
    },
    commands: async (request: Request): Promise<Response> => {
      try {
        assertSameOrigin(request);
        const token = readToken(request, resolveConfig().sessionCookie);
        if (!token) throw new HttpError("NO_SESSION");
        const requestId = request.headers.get("idempotency-key");
        const playerId = request.headers.get("x-xperience-player");
        if (!isUuid(requestId) || !isUuid(playerId)) throw new HttpError("INVALID_REQUEST");
        const command = validateCommand(await readJson(request));
        return json(resolveStore().execute(token, requestId, command, playerId));
      } catch (error) { return failure(error); }
    },
    market: async (request: Request): Promise<Response> => {
      try {
        const token = readToken(request, resolveConfig().sessionCookie);
        if (!token) throw new HttpError("NO_SESSION");
        const params = new URL(request.url).searchParams;
        const cursor = params.get("cursor");
        if ([...params.keys()].some(key => key !== "cursor") || params.getAll("cursor").length > 1 || (cursor !== null && !isUuid(cursor))) throw new HttpError("INVALID_REQUEST");
        const store = resolveStore();
        if (!store.getMarket) throw new HttpError("STORAGE_UNAVAILABLE");
        const page = store.getMarket(token, cursor?.toLowerCase());
        if (!page) throw new HttpError("NO_SESSION");
        return json(page);
      } catch (error) { return failure(error); }
    },
    health: async (): Promise<Response> => {
      try {
        if (!resolveStore().health()) throw new HttpError("STORAGE_UNAVAILABLE");
        return json({ ok: true, storage: "sqlite" });
      } catch (error) { return failure(error); }
    },
  };
}
