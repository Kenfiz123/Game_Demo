import type { ArcadeSettings, EquipSlot, GameId, OpeningAttempt, TradeUpAttempt, XperienceState } from "./gamification";

export interface AnonymousPlayer { id: string; createdAt: string; }
export interface BackendSnapshot {
  player: AnonymousPlayer;
  state: XperienceState;
  revision: number;
  demoToolsEnabled: boolean;
  canImportLegacy: boolean;
}
export type BackendCommand =
  | { type: "play"; game: GameId }
  | { type: "trade-up"; itemIds: string[] }
  | { type: "equip"; itemId: string }
  | { type: "unequip"; slot: EquipSlot }
  | { type: "settings"; settings: ArcadeSettings }
  | { type: "grant-test-ex" }
  | { type: "reset-demo" }
  | { type: "import-legacy"; raw: string };
export interface BackendSimpleResult { success: boolean; reason?: string; }
export type BackendCommandResult = OpeningAttempt | TradeUpAttempt | BackendSimpleResult;
export interface BackendCommandReply { snapshot: BackendSnapshot; result: BackendCommandResult; }
export type BackendErrorCode = "NO_SESSION" | "SESSION_CHANGED" | "INVALID_REQUEST" | "INVALID_LEGACY" |
  "IMPORT_NOT_ALLOWED" | "DEMO_DISABLED" | "IDEMPOTENCY_CONFLICT" | "FORBIDDEN" | "PAYLOAD_TOO_LARGE" |
  "RATE_LIMITED" | "STORAGE_UNAVAILABLE";
export interface BackendErrorBody { error: { code: BackendErrorCode; message: string }; }
