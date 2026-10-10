import { CHEST_RARITIES } from "@/data/chestConfig";
import { TRADE_UP_PATHS, validateArcadeSettings } from "@/data/economyConfig";
import { EQUIP_SLOTS } from "@/lib/equipmentEngine";
import { parseStoredState } from "@/lib/storage";
import type { OpeningHistoryRecord, TradeUpHistoryRecord, XperienceState } from "@/types/gamification";
import { StoreError } from "./storeError";

export const MAX_LEGACY_BYTES = 1024 * 1024;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, length = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= length;
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown) => text(value, 64) && Number.isFinite(Date.parse(value));

/** Record validation is shared with SQLite reads; it has no import-only list/byte cap. */
export function isStoredOpeningRecord(value: unknown): value is OpeningHistoryRecord {
  if (!object(value)) return false;
  return text(value.id) && text(value.itemId) && text(value.itemName, 512) &&
    CHEST_RARITIES.some(entry => entry.rarity === value.rarity) && nonnegative(value.cost) &&
    nonnegative(value.compensation) && timestamp(value.timestamp) && typeof value.isDuplicate === "boolean" &&
    (value.game === undefined || value.game === "chest" || value.game === "orbit");
}

export function isStoredTradeRecord(value: unknown): value is TradeUpHistoryRecord {
  if (!object(value)) return false;
  const path = TRADE_UP_PATHS.find(entry => entry.inputRarity === value.inputRarity);
  return text(value.id) && Array.isArray(value.inputItemIds) && value.inputItemIds.length === 5 &&
    value.inputItemIds.every(id => text(id)) && !!path && path.targetRarity === value.targetRarity &&
    typeof value.chance === "number" && Number.isFinite(value.chance) && value.chance >= 0 && value.chance <= 100 &&
    typeof value.won === "boolean" && timestamp(value.timestamp) &&
    (value.rewardItemId === undefined || text(value.rewardItemId)) &&
    (value.rewardItemName === undefined || text(value.rewardItemName, 512)) &&
    (value.isDuplicate === undefined || typeof value.isDuplicate === "boolean") &&
    (!value.won || (text(value.rewardItemId) && text(value.rewardItemName, 512) && typeof value.isDuplicate === "boolean"));
}

/** Unlike the forgiving browser loader, an explicit import never silently discards invalid records. */
export function parseLegacyImport(raw: string): XperienceState {
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_LEGACY_BYTES) throw new Error();
    const value: unknown = JSON.parse(raw);
    if (!object(value) || (value.version !== undefined && value.version !== 1 && value.version !== 2) ||
      !nonnegative(value.exPoints) || !Array.isArray(value.ownedItemIds) || value.ownedItemIds.length > 20_000 ||
      !value.ownedItemIds.every(id => text(id)) || !Array.isArray(value.history) || value.history.length > 10_000 ||
      !value.history.every(isStoredOpeningRecord)) throw new Error();
    if (value.tradeHistory !== undefined && (!Array.isArray(value.tradeHistory) || value.tradeHistory.length > 10_000 ||
      !value.tradeHistory.every(isStoredTradeRecord))) throw new Error();
    if (value.settings !== undefined && !validateArcadeSettings(value.settings)) throw new Error();
    if (value.equipped !== undefined && (!object(value.equipped) || !Object.entries(value.equipped).every(([slot, id]) =>
      EQUIP_SLOTS.includes(slot as typeof EQUIP_SLOTS[number]) && text(id)))) throw new Error();
    // The existing migration deliberately deduplicates v1 sets, retains archived IDs,
    // and removes loadout references that are no longer equippable in this catalog.
    return parseStoredState(raw);
  } catch {
    throw new StoreError("INVALID_LEGACY", "Bản lưu cũ không hợp lệ hoặc quá lớn.");
  }
}
