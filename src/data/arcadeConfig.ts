import { CHEST_COST, CHEST_RARITIES } from "./chestConfig";
import type { GameId, Rarity } from "@/types/gamification";

export const GAME_CONFIG: Record<GameId, { name: string; cost: number }> = {
  chest: { name: "Mystery Chest", cost: CHEST_COST },
  orbit: { name: "Lucky Orbit", cost: 150 },
};
// Every sector has exactly 1/8 probability. Geometry and sampling share this array.
export const ORBIT_SECTORS: readonly Rarity[] = [
  "LEGENDARY", "COMMON", "UNCOMMON", "RARE", "COMMON", "EPIC", "UNCOMMON", "COMMON",
];
export const ORBIT_RARITIES = CHEST_RARITIES.map((entry) => ({
  ...entry,
  probability: ORBIT_SECTORS.filter((rarity) => rarity === entry.rarity).length / ORBIT_SECTORS.length * 100,
})).filter((entry) => entry.probability > 0);
export const MOTION = { charge: 450, reel: 4480, orbit: 5200, settle: 650 } as const;
export const REEL_CARD_WIDTH = 144;
export const REEL_GAP = 12;
export const REEL_WINNER_INDEX = 23;
export function orbitLandingRotation(sectorIndex: number): number {
  const sectorAngle = 360 / ORBIT_SECTORS.length;
  return 360 * 6 + ((360 - (sectorIndex + .5) * sectorAngle) % 360);
}
