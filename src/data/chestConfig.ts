import type { ChestRarityConfig } from "@/types/gamification";

export const CHEST_COST = 100;
export const STARTING_EX_POINTS = 50_000;
export const TEST_EX_GRANT = 10_000;
// Duplicates are inventory copies that can be spent on trade-up contracts.
export const DUPLICATE_COMPENSATION = 0;

/** Default rarity percentages. Runtime settings may override these, still totaling 100. */
export const CHEST_RARITIES: readonly ChestRarityConfig[] = [
  { rarity: "COMMON", label: "Common", probability: 55, color: "#94a3b8", glow: "rgba(148, 163, 184, .42)" },
  { rarity: "UNCOMMON", label: "Uncommon", probability: 25, color: "#4ade80", glow: "rgba(74, 222, 128, .45)" },
  { rarity: "RARE", label: "Rare", probability: 12, color: "#22d3ee", glow: "rgba(34, 211, 238, .52)" },
  { rarity: "EPIC", label: "Epic", probability: 6, color: "#a78bfa", glow: "rgba(167, 139, 250, .58)" },
  { rarity: "LEGENDARY", label: "Legendary", probability: 1.8, color: "#fbbf24", glow: "rgba(251, 191, 36, .7)" },
  { rarity: "MYTHIC", label: "Mythic", probability: 0.2, color: "#fb7185", glow: "rgba(251, 113, 133, .8)" },
] as const;

export const getRarityConfig = (rarity: ChestRarityConfig["rarity"]) =>
  CHEST_RARITIES.find((entry) => entry.rarity === rarity) ?? CHEST_RARITIES[0];
