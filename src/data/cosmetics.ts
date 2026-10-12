import type { CosmeticItem, Rarity } from "@/types/gamification";
import { CLUB_COSMETICS } from "./clubCosmetics";
import { SEASON_AVATARS } from "./seasonCatalog";

export const COSMETICS: readonly CosmeticItem[] = [...CLUB_COSMETICS, ...SEASON_AVATARS];

const cosmeticsById = new Map(COSMETICS.map(item => [item.id, item]));
const rarityPools = new Map<Rarity, CosmeticItem[]>();
for (const item of COSMETICS) {
  // Season rewards are earned through missions; regular draws keep their pools.
  if (item.seasonId) continue;
  const pool = rarityPools.get(item.rarity) ?? [];
  pool.push(item);
  rarityPools.set(item.rarity, pool);
}
export const cosmeticsByRarity = (rarity: Rarity): readonly CosmeticItem[] => rarityPools.get(rarity) ?? [];
export const getCosmeticById = (id: string): CosmeticItem | undefined => cosmeticsById.get(id);
