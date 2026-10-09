import { CHEST_RARITIES } from "@/data/chestConfig";
import { cosmeticsByRarity } from "@/data/cosmetics";
import { DEFAULT_CHEST_ODDS, validateChestOdds } from "@/data/economyConfig";
import type { CosmeticItem, Rarity } from "@/types/gamification";
export function secureRandom(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] / 4294967296;
}
export function pickWeightedRarity(random = secureRandom, odds: Record<Rarity, number> = DEFAULT_CHEST_ODDS): Rarity {
  if (!validateChestOdds(odds)) throw new Error("Chest probabilities must be finite percentages totaling 100");
  let value = random() * 100;
  let lastEnabled: Rarity = "COMMON";
  for (const entry of CHEST_RARITIES) {
    const probability = odds[entry.rarity];
    if (probability === 0) continue;
    lastEnabled = entry.rarity;
    value -= probability;
    if (value < 0) return entry.rarity;
  }
  return lastEnabled;
}
export function pickItemOfRarity(rarity: Rarity, random = secureRandom): CosmeticItem {
  const options = cosmeticsByRarity(rarity);
  if (!options.length) throw new Error("No cosmetics configured for " + rarity);
  return options[Math.floor(random() * options.length)];
}
export function pickChestItem(random = secureRandom, odds: Record<Rarity, number> = DEFAULT_CHEST_ODDS): CosmeticItem {
  return pickItemOfRarity(pickWeightedRarity(random, odds), random);
}
