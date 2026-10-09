import { STARTING_EX_POINTS, CHEST_RARITIES } from "@/data/chestConfig";
import { copyArcadeSettings, createDefaultSettings, TRADE_UP_PATHS, validateArcadeSettings } from "@/data/economyConfig";
import { sanitizeEquipped, validateEquipped } from "./equipmentEngine";
import type { OpeningHistoryRecord, TradeUpHistoryRecord, XperienceState } from "@/types/gamification";
export const STORAGE_KEY = "fptu-xperience-demo-state";
export const STORAGE_V1_BACKUP_KEY = STORAGE_KEY + "-v1-backup";
export const createDemoState = (): XperienceState => ({
  version: 2, exPoints: STARTING_EX_POINTS, ownedItemIds: [], history: [], tradeHistory: [], settings: createDefaultSettings(), equipped: {},
});
const isRecord = (value: unknown): value is OpeningHistoryRecord => {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<OpeningHistoryRecord>;
  return typeof r.id === "string" && typeof r.itemId === "string" && typeof r.itemName === "string" &&
    CHEST_RARITIES.some((entry) => entry.rarity === r.rarity) &&
    typeof r.cost === "number" && Number.isFinite(r.cost) && r.cost >= 0 &&
    typeof r.timestamp === "string" && Number.isFinite(Date.parse(r.timestamp)) &&
    typeof r.isDuplicate === "boolean" && typeof r.compensation === "number" &&
    Number.isFinite(r.compensation) && r.compensation >= 0 &&
    (r.game === undefined || r.game === "chest" || r.game === "orbit");
};
const isTradeRecord = (value: unknown): value is TradeUpHistoryRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<TradeUpHistoryRecord>;
  const path = TRADE_UP_PATHS.find(path => path.inputRarity === record.inputRarity);
  return typeof record.id === "string" && Array.isArray(record.inputItemIds) && record.inputItemIds.length === 5 &&
    record.inputItemIds.every(id => typeof id === "string") && !!path && path.targetRarity === record.targetRarity &&
    typeof record.chance === "number" && Number.isFinite(record.chance) && record.chance >= 0 && record.chance <= 100 &&
    typeof record.won === "boolean" && typeof record.timestamp === "string" && Number.isFinite(Date.parse(record.timestamp)) &&
    (!record.won || (typeof record.rewardItemId === "string" && typeof record.rewardItemName === "string" && typeof record.isDuplicate === "boolean"));
};
export function parseStoredState(raw: string | null): XperienceState {
  if (!raw) return createDemoState();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return createDemoState();
    if (Array.isArray(value)) return createDemoState();
    const candidate = value as Omit<Partial<XperienceState>, "version"> & { version?: number };
    if (candidate.version !== undefined && candidate.version !== 1 && candidate.version !== 2) return createDemoState();
    if (typeof candidate.exPoints !== "number" || !Number.isSafeInteger(candidate.exPoints) || candidate.exPoints < 0 ||
      !Array.isArray(candidate.ownedItemIds) || !Array.isArray(candidate.history)) return createDemoState();
    const ids = candidate.ownedItemIds.filter((id): id is string => typeof id === "string");
    return {
      version: 2,
      exPoints: candidate.exPoints,
      // v1 owned a set, not stacks. Do not infer copies from its compensated history.
      // Keep obsolete IDs in the archive; current UI decides which are displayed.
      ownedItemIds: candidate.version === 2 ? ids : [...new Set(ids)],
      history: candidate.history.filter(isRecord),
      tradeHistory: Array.isArray(candidate.tradeHistory) ? candidate.tradeHistory.filter(isTradeRecord) : [],
      settings: validateArcadeSettings(candidate.settings) ? copyArcadeSettings(candidate.settings) : createDefaultSettings(),
      equipped: sanitizeEquipped(candidate.equipped, ids),
    };
  } catch { return createDemoState(); }
}
// Browser-only prototype adapter. Replace with an authoritative API for production.
type StateStorage = Pick<Storage, "getItem" | "setItem">;
export function loadXperienceState(storage?: StateStorage): XperienceState {
  if (!storage && typeof window === "undefined") return createDemoState();
  try { return parseStoredState((storage ?? window.localStorage).getItem(STORAGE_KEY)); }
  catch { return createDemoState(); }
}
export function saveXperienceState(state: XperienceState, storage?: StateStorage): boolean {
  if (!storage && typeof window === "undefined") return false;
  if (state.version !== 2 || !validateArcadeSettings(state.settings) ||
    !Number.isSafeInteger(state.exPoints) || state.exPoints < 0 ||
    !Array.isArray(state.ownedItemIds) || !state.ownedItemIds.every(id => typeof id === "string") ||
    !Array.isArray(state.history) || !state.history.every(isRecord) ||
    !Array.isArray(state.tradeHistory) || !state.tradeHistory.every(isTradeRecord) ||
    !validateEquipped(state.equipped, state.ownedItemIds)) return false;
  try {
    const target = storage ?? window.localStorage;
    const previous = target.getItem(STORAGE_KEY);
    if (previous !== null) {
      let version: unknown;
      try { version = (JSON.parse(previous) as { version?: unknown } | null)?.version; } catch { /* Preserve malformed legacy data too. */ }
      if (version !== 2) {
        // Never overwrite a future schema or a v1 save whose backup cannot be secured.
        if (version !== undefined && version !== 1) return false;
        if (target.getItem(STORAGE_V1_BACKUP_KEY) === null) target.setItem(STORAGE_V1_BACKUP_KEY, previous);
      }
    }
    target.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  }
  catch { return false; }
}
