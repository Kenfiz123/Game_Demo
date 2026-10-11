import type { EventId, PlayerEconomy } from "@/types/economy";

export const EVENT_TASKS: readonly { id: EventId; name: string; description: string; reward: number; target: number; metric: "visit" | "chests" | "trades" }[] = [
  { id: "daily-visit", name: "Điểm danh hoàng gia", description: "Ghé Xperience mỗi ngày để nhận XCoin.", reward: 20, target: 1, metric: "visit" },
  { id: "open-three", name: "Ba lần khám phá", description: "Mở 3 rương trong ngày.", reward: 35, target: 3, metric: "chests" },
  { id: "open-ten", name: "Thợ săn di sản", description: "Mở 10 rương trong ngày.", reward: 80, target: 10, metric: "chests" },
  { id: "trade-once", name: "Nhà luyện kim", description: "Thực hiện 1 lượt đổi đồ thường trong ngày, không cần thành công.", reward: 25, target: 1, metric: "trades" },
];
export const MAX_MARKET_PRICE = 1_000_000;
export const MAX_ACTIVE_LISTINGS = 20;
export const FORGE_BASE_CHANCE = 0;
export const FORGE_MAX_CHANCE = 25;
export const FORGE_MIN_COINS = 10;
export const FORGE_MAX_COINS = 250;
export const FORGE_COIN_STEP = 10;
export const FORGE_RULE_VERSION = 2 as const;
export function forgeChance(coins: number): number {
  if (!Number.isFinite(coins)) return 0;
  return Math.min(FORGE_MAX_CHANCE, FORGE_BASE_CHANCE + Math.floor(Math.max(0, coins) / FORGE_COIN_STEP));
}
/** Historical receipts keep the odds that applied when their materials were spent. */
export function isRecordedForgeChance(coins: unknown, chance: unknown, ruleVersion: unknown): boolean {
  if (typeof coins !== "number" || !Number.isSafeInteger(coins) || coins % FORGE_COIN_STEP !== 0) return false;
  if (ruleVersion === undefined) return coins >= 0 && coins <= 750 && chance === Math.min(80, 5 + coins / FORGE_COIN_STEP);
  return ruleVersion === FORGE_RULE_VERSION && coins >= FORGE_MIN_COINS && coins <= FORGE_MAX_COINS && chance === forgeChance(coins);
}
export function economyDay(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function emptyEconomy(now = Date.now()): PlayerEconomy {
  return { coinBalance: 0, day: economyDay(now), progress: { chests: 0, trades: 0 }, claimedEventIds: [], forgeHistory: [] };
}
