import type { CosmeticItem, Rarity } from "@/types/gamification";
import { CLUB_COSMETICS } from "./clubCosmetics";

export const COSMETICS: readonly CosmeticItem[] = CLUB_COSMETICS;

const cosmeticsById = new Map(COSMETICS.map(item => [item.id, item]));
const rarityPools = new Map<Rarity, CosmeticItem[]>();
for (const item of COSMETICS) {
  const pool = rarityPools.get(item.rarity) ?? [];
  pool.push(item);
  rarityPools.set(item.rarity, pool);
}
export const cosmeticsByRarity = (rarity: Rarity): readonly CosmeticItem[] => rarityPools.get(rarity) ?? [];
export const getCosmeticById = (id: string): CosmeticItem | undefined => cosmeticsById.get(id);
