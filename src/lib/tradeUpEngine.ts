import { TRADE_UP_ITEM_COUNT, TRADE_UP_PATHS, validateTradeUpOdds } from "@/data/economyConfig";
import { getCosmeticById } from "@/data/cosmetics";
import { pickItemOfRarity, secureRandom } from "./chestRandom";
import type { TradeUpFailure, TradeUpHistoryRecord, TradeUpSuccess, XperienceState } from "@/types/gamification";

export function createTradeUp(state: XperienceState, inputItemIds: readonly string[], random = secureRandom):
  TradeUpFailure | (TradeUpSuccess & { next: XperienceState }) {
  if (inputItemIds.length !== TRADE_UP_ITEM_COUNT) return { success: false, reason: "INVALID_SELECTION" };
  const items = inputItemIds.map(getCosmeticById);
  const first = items[0];
  if (!first || items.some(item => !item || item.rarity !== first.rarity)) return { success: false, reason: "INVALID_SELECTION" };
  const path = TRADE_UP_PATHS.find(path => path.inputRarity === first.rarity);
  if (!path) return { success: false, reason: "UNSUPPORTED_RARITY" };
  const available = new Map<string, number>();
  for (const id of state.ownedItemIds) available.set(id, (available.get(id) ?? 0) + 1);
  for (const id of inputItemIds) {
    const count = available.get(id) ?? 0;
    if (count < 1) return { success: false, reason: "INSUFFICIENT_ITEMS" };
    available.set(id, count - 1);
  }
  if (!validateTradeUpOdds(state.settings.tradeUpOdds)) return { success: false, reason: "INVALID_SETTINGS" };
  const chance = state.settings.tradeUpOdds[path.inputRarity];
  const won = random() * 100 < chance;
  const consumed = new Map<string, number>();
  for (const id of inputItemIds) consumed.set(id, (consumed.get(id) ?? 0) + 1);
  const remaining = state.ownedItemIds.filter(id => {
    const count = consumed.get(id) ?? 0;
    if (!count) return true;
    consumed.set(id, count - 1);
    return false;
  });
  const item = won ? pickItemOfRarity(path.targetRarity, random) : null;
  const reward = item ? { item, isDuplicate: remaining.includes(item.id), compensation: 0 } : null;
  const id = crypto.randomUUID();
  const record: TradeUpHistoryRecord = {
    id, inputItemIds: [...inputItemIds], inputRarity: path.inputRarity, targetRarity: path.targetRarity,
    chance, won, timestamp: new Date().toISOString(),
    ...(reward ? { rewardItemId: reward.item.id, rewardItemName: reward.item.name, isDuplicate: reward.isDuplicate } : {}),
  };
  return {
    success: true, id, won, inputRarity: path.inputRarity, targetRarity: path.targetRarity, chance, reward,
    next: {
      ...state,
      ownedItemIds: reward ? [...remaining, reward.item.id] : remaining,
      tradeHistory: [record, ...state.tradeHistory],
    },
  };
}
