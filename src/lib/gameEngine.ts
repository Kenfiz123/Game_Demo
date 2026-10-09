import { GAME_CONFIG, ORBIT_SECTORS } from "@/data/arcadeConfig";
import { validateChestOdds } from "@/data/economyConfig";
import { pickChestItem, pickItemOfRarity, secureRandom } from "./chestRandom";
import type { GameId, OpeningFailure, OpeningSuccess, XperienceState } from "@/types/gamification";

export function createOpening(state: XperienceState, game: GameId, random = secureRandom):
  OpeningFailure | (OpeningSuccess & { next: XperienceState }) {
  const cost = GAME_CONFIG[game].cost;
  if (state.exPoints < cost) return { success: false, reason: "INSUFFICIENT_EX" };
  const chestOdds = state.settings.chestOdds;
  if (game === "chest" && !validateChestOdds(chestOdds)) return { success: false, reason: "INVALID_SETTINGS" };
  const sectorIndex = game === "orbit" ? Math.floor(random() * ORBIT_SECTORS.length) : undefined;
  const item = sectorIndex === undefined ? pickChestItem(random, chestOdds) : pickItemOfRarity(ORBIT_SECTORS[sectorIndex], random);
  const isDuplicate = state.ownedItemIds.includes(item.id);
  const compensation = 0;
  const id = crypto.randomUUID();
  return {
    success: true, id, sectorIndex, reward: { item, isDuplicate, compensation },
    next: {
      ...state,
      exPoints: state.exPoints - cost,
      ownedItemIds: [...state.ownedItemIds, item.id],
      history: [{ id, game, itemId: item.id, itemName: item.name, rarity: item.rarity, cost,
        timestamp: new Date().toISOString(), isDuplicate, compensation }, ...state.history],
    },
  };
}
