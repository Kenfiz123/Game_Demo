import type { ArcadeSettings, EquipSlot, GameId, OpeningAttempt, TradeUpAttempt, XperienceState } from "./gamification";
import type { EconomyCommand, EconomyResult, PlayerEconomy } from "./economy";
import type { AccountIdentity, CollectorProfile, CollectorSnapshot } from "./collector";

export interface AnonymousPlayer { id: string; createdAt: string; }
export interface BackendSnapshot {
  player: AnonymousPlayer;
  state: XperienceState;
  revision: number;
  demoToolsEnabled: boolean;
  canImportLegacy: boolean;
  /** Optional only for compatibility with pre-economy clients/test fixtures. Server always sends it. */
  economy?: PlayerEconomy;
  account?: AccountIdentity | null;
  collector?: CollectorSnapshot;
  season?: import("./season").SeasonProgress;
}
export type BackendCommand =
  | { type: "play"; game: GameId }
  | { type: "trade-up"; itemIds: string[] }
  | { type: "equip"; itemId: string }
  | { type: "unequip"; slot: EquipSlot }
  | { type: "settings"; settings: ArcadeSettings }
  | { type: "grant-test-ex" }
  | { type: "reset-demo" }
  | { type: "import-legacy"; raw: string }
  | ({ type: "profile-update" } & CollectorProfile)
  | { type: "copy-lock"; copyId: string; locked: boolean }
  | { type: "wishlist-update"; itemId: string; wished: boolean }
  | EconomyCommand;
export interface BackendSimpleResult { success: boolean; reason?: string; }
export type BackendCommandResult = OpeningAttempt | TradeUpAttempt | BackendSimpleResult | EconomyResult;
export interface BackendCommandReply { snapshot: BackendSnapshot; result: BackendCommandResult; }
export type BackendErrorCode = "NO_SESSION" | "SESSION_CHANGED" | "INVALID_REQUEST" | "INVALID_LEGACY" |
  "IMPORT_NOT_ALLOWED" | "DEMO_DISABLED" | "IDEMPOTENCY_CONFLICT" | "FORBIDDEN" | "PAYLOAD_TOO_LARGE" |
  "RATE_LIMITED" | "STORAGE_UNAVAILABLE" | "ACCOUNT_EXISTS" | "INVALID_CREDENTIALS" | "ACCOUNT_REQUIRED" | "PROFILE_NOT_FOUND";
export interface BackendErrorBody { error: { code: BackendErrorCode; message: string }; }
