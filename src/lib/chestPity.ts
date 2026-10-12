import type { OpeningHistoryRecord } from "@/types/gamification";

/** Hard guarantee: the 200th chest after 199 non-Mythic chests is Mythic. */
export const CHEST_PITY_LIMIT = 200;
export const isValidChestPity = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < CHEST_PITY_LIMIT;

function validHistoryRecord(value: unknown): value is OpeningHistoryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<OpeningHistoryRecord>;
  return typeof record.id === "string" && typeof record.itemId === "string" && typeof record.itemName === "string" &&
    ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].includes(record.rarity ?? "") &&
    typeof record.cost === "number" && Number.isFinite(record.cost) && record.cost >= 0 &&
    typeof record.timestamp === "string" && Number.isFinite(Date.parse(record.timestamp)) &&
    typeof record.isDuplicate === "boolean" && typeof record.compensation === "number" && Number.isFinite(record.compensation) && record.compensation >= 0 &&
    (record.game === undefined || record.game === "chest" || record.game === "orbit");
}

/** Old saves use newest-first history. Orbit rewards never advance or reset chest pity. */
export function getChestPity(state: { chestPity?: unknown; history?: unknown }): number {
  if (isValidChestPity(state.chestPity)) return state.chestPity;
  if (!Array.isArray(state.history)) return 0;
  let count = 0;
  for (const record of state.history) {
    if (!validHistoryRecord(record) || record.game === "orbit") continue;
    if (record.rarity === "MYTHIC") break;
    count += 1;
    // Old prototypes had no guarantee; never claim their overdue counter is >199.
    if (count === CHEST_PITY_LIMIT - 1) break;
  }
  return count;
}
