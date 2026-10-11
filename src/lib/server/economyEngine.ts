import { EVENT_TASKS, FORGE_COIN_STEP, FORGE_MIN_COINS, FORGE_MAX_COINS, FORGE_RULE_VERSION, emptyEconomy, economyDay, forgeChance, isRecordedForgeChance } from "@/data/eventEconomy";
import { getCosmeticById } from "@/data/cosmetics";
import { pickItemOfRarity, secureRandom } from "@/lib/chestRandom";
import type { EconomyResult, EventId, PlayerEconomy } from "@/types/economy";
import type { XperienceState } from "@/types/gamification";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const itemId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
const keys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
export const validForgeCoins = (value: unknown): value is number => integer(value) && value >= FORGE_MIN_COINS && value <= FORGE_MAX_COINS && value % FORGE_COIN_STEP === 0;

/** Unlike legacy browser imports, invalid authoritative balances never fall back to zero. */
export function isPersistedEconomy(value: unknown): value is PlayerEconomy {
  if (!object(value) || !keys(value, ["coinBalance", "day", "progress", "claimedEventIds", "forgeHistory"]) ||
    !integer(value.coinBalance) || typeof value.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) ||
    !Number.isFinite(Date.parse(`${value.day}T00:00:00Z`)) ||
    new Date(`${value.day}T00:00:00Z`).toISOString().slice(0, 10) !== value.day ||
    !object(value.progress) || !keys(value.progress, ["chests", "trades"]) ||
    !integer(value.progress.chests) || !integer(value.progress.trades) ||
    !Array.isArray(value.claimedEventIds) || new Set(value.claimedEventIds).size !== value.claimedEventIds.length ||
    !value.claimedEventIds.every(id => EVENT_TASKS.some(task => task.id === id)) ||
    !Array.isArray(value.forgeHistory) || value.forgeHistory.length > 100) return false;
  return value.forgeHistory.every(record => object(record) &&
    keys(record, ["id", "timestamp", "inputItemIds", "coins", "chance", "won", "rewardItemId", "ruleVersion"]) &&
    itemId(record.id) && typeof record.timestamp === "string" && record.timestamp.length <= 64 && Number.isFinite(Date.parse(record.timestamp)) &&
    Array.isArray(record.inputItemIds) && record.inputItemIds.length === 5 && record.inputItemIds.every(itemId) &&
    isRecordedForgeChance(record.coins, record.chance, record.ruleVersion) && typeof record.won === "boolean" &&
    (record.won ? itemId(record.rewardItemId) : record.rewardItemId === undefined));
}

export function normalizeEconomyDay(economy: PlayerEconomy, now: number): PlayerEconomy {
  return economy.day === economyDay(now) ? economy : { ...emptyEconomy(now), coinBalance: economy.coinBalance, forgeHistory: economy.forgeHistory };
}

/** Remove exact inventory copies, preserving duplicate copies and still-owned equipment. */
export function consumeOwnedCopies(state: XperienceState, ids: readonly string[]): XperienceState | null {
  const remainingCounts = new Map<string, number>();
  for (const id of state.ownedItemIds) remainingCounts.set(id, (remainingCounts.get(id) ?? 0) + 1);
  for (const id of ids) {
    const available = remainingCounts.get(id) ?? 0;
    if (!available) return null;
    remainingCounts.set(id, available - 1);
  }
  const consumed = new Map<string, number>();
  for (const id of ids) consumed.set(id, (consumed.get(id) ?? 0) + 1);
  const ownedItemIds = state.ownedItemIds.filter(id => {
    const count = consumed.get(id) ?? 0;
    if (!count) return true;
    consumed.set(id, count - 1);
    return false;
  });
  const owned = new Set(ownedItemIds);
  const equipped = Object.fromEntries(Object.entries(state.equipped).filter(([, id]) => owned.has(id)));
  return { ...state, ownedItemIds, equipped };
}

export function claimEvent(economy: PlayerEconomy, eventId: EventId): { economy: PlayerEconomy; result: EconomyResult } {
  const task = EVENT_TASKS.find(task => task.id === eventId);
  if (!task) return { economy, result: { success: false, reason: "INVALID_EVENT" } };
  if (economy.claimedEventIds.includes(eventId)) return { economy, result: { success: false, reason: "ALREADY_CLAIMED" } };
  const progress = task.metric === "visit" ? 1 : economy.progress[task.metric];
  if (progress < task.target) return { economy, result: { success: false, reason: "EVENT_NOT_READY" } };
  if (!Number.isSafeInteger(economy.coinBalance + task.reward)) return { economy, result: { success: false, reason: "COIN_LIMIT" } };
  return {
    economy: { ...economy, coinBalance: economy.coinBalance + task.reward, claimedEventIds: [...economy.claimedEventIds, eventId] },
    result: { success: true, coinsAwarded: task.reward },
  };
}

export function forgeMythic(state: XperienceState, economy: PlayerEconomy, ids: readonly string[], coins: number,
  now: number, random = secureRandom): { state: XperienceState; economy: PlayerEconomy; result: EconomyResult } {
  const failed = (reason: string) => ({ state, economy, result: { success: false, reason } });
  if (!validForgeCoins(coins)) return failed("INVALID_COINS");
  if (ids.length !== 5 || ids.some(id => getCosmeticById(id)?.rarity !== "LEGENDARY")) return failed("INVALID_SELECTION");
  const remaining = consumeOwnedCopies(state, ids);
  if (!remaining) return failed("INSUFFICIENT_ITEMS");
  if (economy.coinBalance < coins) return failed("INSUFFICIENT_COINS");
  const chance = forgeChance(coins);
  const won = random() * 100 < chance;
  const item = won ? pickItemOfRarity("MYTHIC", random) : null;
  const reward = item ? { item, isDuplicate: remaining.ownedItemIds.includes(item.id), compensation: 0 } : null;
  const id = crypto.randomUUID();
  return {
    state: reward ? { ...remaining, ownedItemIds: [...remaining.ownedItemIds, reward.item.id] } : remaining,
    economy: {
      ...economy, coinBalance: economy.coinBalance - coins,
      forgeHistory: [{ id, timestamp: new Date(now).toISOString(), inputItemIds: [...ids], coins, chance, won, ruleVersion: FORGE_RULE_VERSION,
        ...(reward ? { rewardItemId: reward.item.id } : {}) }, ...economy.forgeHistory].slice(0, 100),
    },
    result: { success: true, id, won, chance, reward },
  };
}
