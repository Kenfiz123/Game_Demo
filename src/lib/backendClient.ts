import type { BackendCommand, BackendCommandReply, BackendErrorCode, BackendSnapshot } from "@/types/backend";
import { validateArcadeSettings } from "@/data/economyConfig";
import type { MarketListing, MarketPage, PlayerEconomy } from "@/types/economy";
import { EVENT_TASKS, MAX_ACTIVE_LISTINGS, MAX_MARKET_PRICE, forgeChance, isRecordedForgeChance } from "@/data/eventEconomy";
import type { AccountAction, AccountIdentity, CollectorSnapshot, ItemCopy, ItemPassport, PublicCollectorProfile } from "@/types/collector";
import { validCollectorProfile, validDisplayName, validUsername } from "@/lib/collectorValidation";
import { getChestPity, isValidChestPity } from "@/lib/chestPity";

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
  retry?: boolean;
}
const abortError = () => new DOMException("Request aborted", "AbortError");

/** A retry reuses the exact body and idempotency key; it never creates a second draw. */
export async function backendRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers = { ...(method === "POST" ? { "Content-Type": "application/json" } : {}), ...options.headers };
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = options.retry === false ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
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
        if (response.status === 503 && attempt === 0 && attempts > 1) continue;
        throw new BackendRequestError(message, response.status, code);
      }
      if (value === null) throw new BackendRequestError("Server trả về dữ liệu không hợp lệ.", 502);
      return value as T;
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      if (error instanceof BackendRequestError) throw error;
      if (attempt === attempts - 1) throw new BackendRequestError("Mất kết nối với backend. Kết quả đã lưu (nếu có) sẽ được tải lại khi kết nối lại.");
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
    ("chestPity" in value.state && !isValidChestPity(value.state.chestPity)) ||
    !Array.isArray(value.state.ownedItemIds) || !value.state.ownedItemIds.every(id => typeof id === "string") ||
    !Array.isArray(value.state.history) || !Array.isArray(value.state.tradeHistory) || !validateArcadeSettings(value.state.settings) ||
    !value.state.equipped || typeof value.state.equipped !== "object" || Array.isArray(value.state.equipped)) {
    throw new BackendRequestError("Dữ liệu lưu trên server chưa hợp lệ. Hãy kết nối lại.", 502);
  }
  if (value.economy !== undefined && !validEconomy(value.economy)) throw new BackendRequestError("Ví XCoin trên server chưa hợp lệ. Hãy kết nối lại.", 502);
  if (value.account !== undefined && value.account !== null && !validAccount(value.account)) throw new BackendRequestError("Tài khoản trên server chưa hợp lệ. Hãy kết nối lại.", 502);
  if (value.collector !== undefined && !validCollector(value.collector, value.state.ownedItemIds)) throw new BackendRequestError("Dấu ấn vật phẩm chưa hợp lệ. Hãy kết nối lại.", 502);
  // Older servers/saves have no counter; never replace the rest of their progress.
  return isValidChestPity(value.state.chestPity) ? value : { ...value, state: { ...value.state, chestPity: getChestPity(value.state) } };
}
const validUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validTimestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
function validAccount(value: AccountIdentity): boolean {
  return !!value && validUsername(value.username) && validDisplayName(value.displayName) && validTimestamp(value.createdAt);
}
function validCopy(value: ItemCopy): boolean {
  return !!value && validUuid(value.id) && validId(value.itemId) && validId(value.serial) &&
    ["CHEST", "ORBIT", "TRADE_UP", "FORGE", "LEGACY", "IMPORT"].includes(value.origin) &&
    (value.mintedAt === null || validTimestamp(value.mintedAt)) && validTimestamp(value.recordedAt) && validTimestamp(value.acquiredAt) &&
    (value.originalOwnerName === null || validDisplayName(value.originalOwnerName)) && Number.isSafeInteger(value.transferCount) && value.transferCount >= 0;
}
function validCollector(value: CollectorSnapshot, ownedIds: readonly string[]): boolean {
  if (!value || !validCollectorProfile(value.profile) || !Array.isArray(value.copies) || !value.copies.every(validCopy) ||
    !Array.isArray(value.discoveredItemIds) || !value.discoveredItemIds.every(validId) || new Set(value.discoveredItemIds).size !== value.discoveredItemIds.length ||
    new Set(value.copies.map(copy => copy.id)).size !== value.copies.length || new Set(value.copies.map(copy => copy.serial)).size !== value.copies.length || value.copies.length !== ownedIds.length) return false;
  const counts = new Map<string, number>();
  for (const id of ownedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const copy of value.copies) counts.set(copy.itemId, (counts.get(copy.itemId) ?? 0) - 1);
  return [...counts.values()].every(count => count === 0);
}
export async function sendAccountAction(action: AccountAction, playerId: string, signal?: AbortSignal): Promise<BackendSnapshot> {
  // Auth rotates cookies: never replay an uncertain request as a second login/logout.
  return verifySnapshot(await backendRequest<BackendSnapshot>("/api/auth", {
    method: "POST", body: action, signal, retry: false, timeoutMs: 15_000, headers: { "X-Xperience-Player": playerId },
  }));
}
export async function readPublicProfile(username: string, signal?: AbortSignal): Promise<PublicCollectorProfile> {
  const profile = await backendRequest<PublicCollectorProfile>(`/api/profiles/${encodeURIComponent(username)}`, { signal });
  if (!profile || !validUsername(profile.username) || !validDisplayName(profile.displayName) || !validTimestamp(profile.joinedAt) ||
    !validCollectorProfile({ ...profile, isPublic: true }) || !Array.isArray(profile.discoveredItemIds) || !profile.discoveredItemIds.every(validId) ||
    !profile.equipped || typeof profile.equipped !== "object" || Array.isArray(profile.equipped) ||
    !Object.entries(profile.equipped).every(([slot, id]) => ["AVATAR", "FRAME", "TITLE", "LOGO", "EFFECT"].includes(slot) && validId(id))) {
    throw new BackendRequestError("Hồ sơ chưa trả về dữ liệu hợp lệ.", 502);
  }
  return profile;
}
export async function readItemPassport(copyId: string, signal?: AbortSignal): Promise<ItemPassport> {
  const passport = await backendRequest<ItemPassport>(`/api/items/${encodeURIComponent(copyId)}`, { signal });
  if (!passport || !validCopy(passport.copy) || passport.copy.id !== copyId || !Array.isArray(passport.trail) ||
    !passport.trail.every(entry => !!entry && ["MINT", "TRANSFER", "LIST", "RETURN", "CONSUME"].includes(entry.kind) && validTimestamp(entry.timestamp) && (entry.ownerName === null || validDisplayName(entry.ownerName)))) {
    throw new BackendRequestError("Dấu ấn vật phẩm chưa trả về dữ liệu hợp lệ.", 502);
  }
  return passport;
}
function validEconomy(value: PlayerEconomy): boolean {
  if (!value || typeof value !== "object" || !Number.isSafeInteger(value.coinBalance) || value.coinBalance < 0 ||
    typeof value.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !validTimestamp(`${value.day}T00:00:00Z`) ||
    new Date(`${value.day}T00:00:00Z`).toISOString().slice(0, 10) !== value.day || !value.progress ||
    !Number.isSafeInteger(value.progress.chests) || value.progress.chests < 0 || !Number.isSafeInteger(value.progress.trades) || value.progress.trades < 0 ||
    !Array.isArray(value.claimedEventIds) || !value.claimedEventIds.every(id => EVENT_TASKS.some(task => task.id === id)) ||
    new Set(value.claimedEventIds).size !== value.claimedEventIds.length || !Array.isArray(value.forgeHistory) || value.forgeHistory.length > 100) return false;
  return value.forgeHistory.every(record => !!record && typeof record === "object" && validId(record.id) && validTimestamp(record.timestamp) &&
    Array.isArray(record.inputItemIds) && record.inputItemIds.length === 5 && record.inputItemIds.every(validId) &&
    isRecordedForgeChance(record.coins, record.chance, record.ruleVersion) && typeof record.won === "boolean" && (record.won ? validId(record.rewardItemId) : record.rewardItemId === undefined));
}
export async function readMarketplace(cursor?: string, signal?: AbortSignal): Promise<MarketPage> {
  const page = await backendRequest<MarketPage>(`/api/market${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });
  const validListing = (item: MarketListing) => !!item && validUuid(item.id) && validId(item.itemId) &&
    validUuid(item.sellerId) && validTimestamp(item.createdAt) && Number.isSafeInteger(item.price) && item.price > 0 && item.price <= MAX_MARKET_PRICE;
  if (!page || !Array.isArray(page.listings) || page.listings.length > 40 || !page.listings.every(validListing) || !Array.isArray(page.ownListings) || page.ownListings.length > MAX_ACTIVE_LISTINGS ||
      !page.ownListings.every(validListing) || (page.nextCursor !== null && !validUuid(page.nextCursor))) throw new BackendRequestError("Chợ chưa trả về dữ liệu hợp lệ. Hãy tải lại.", 502);
  return page;
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
  const confirmed = verifySnapshot(reply?.snapshot);
  if (!reply.result || typeof reply.result.success !== "boolean") throw new BackendRequestError("Server chưa xác nhận thao tác. Hãy kết nối lại.", 502);
  if (reply.result.success && (command.type === "play" || command.type === "trade-up")) {
    if (!("id" in reply.result) || typeof reply.result.id !== "string" || !("reward" in reply.result) ||
      (command.type === "play" && (!reply.result.reward || typeof reply.result.reward.item?.id !== "string")) ||
      (command.type === "trade-up" && (!("won" in reply.result) || typeof reply.result.won !== "boolean"))) {
      throw new BackendRequestError("Server chưa xác nhận đầy đủ kết quả. Hãy kết nối lại.", 502);
    }
  }
  if (command.type === "forge-mythic" && reply.result.success && (!("won" in reply.result) || typeof reply.result.won !== "boolean" ||
      !("chance" in reply.result) || reply.result.chance !== forgeChance(command.coins) || !("id" in reply.result) || !validUuid(reply.result.id) ||
      !("reward" in reply.result) || (reply.result.won ? (!reply.result.reward || !validId(reply.result.reward.item?.id) || reply.result.reward.item.rarity !== "MYTHIC") : reply.result.reward !== null))) {
    throw new BackendRequestError("Server chưa xác nhận kết quả luyện Mythic. Hãy tải lại dữ liệu.", 502);
  }
  return { ...reply, snapshot: confirmed };
}
