import { REEL_WINNER_INDEX } from "@/data/arcadeConfig";
import { pickChestItem, secureRandom } from "./chestRandom";
import { DEFAULT_CHEST_ODDS } from "@/data/economyConfig";
import type { CosmeticItem, Rarity } from "@/types/gamification";
export type RewardReelEntry =
  | { kind: "COSMETIC"; item: CosmeticItem }
  | { kind: "MYTHIC_VAULT"; id: "mythic-vault" };
function toReelEntry(item: CosmeticItem): RewardReelEntry {
  return item.rarity === "MYTHIC" ? { kind: "MYTHIC_VAULT", id: "mythic-vault" } : { kind: "COSMETIC", item };
}
// Decorative cards follow the real odds. No class identifies the winning card.
// All Mythic items use the same anonymous vault artwork, including decorative slots.
export function buildRewardReel(winner: CosmeticItem, random = secureRandom, odds: Record<Rarity, number> = DEFAULT_CHEST_ODDS): RewardReelEntry[] {
  const entries = Array.from({ length: REEL_WINNER_INDEX + 5 }, () => toReelEntry(pickChestItem(random, odds)));
  entries[REEL_WINNER_INDEX] = toReelEntry(winner);
  return entries;
}
