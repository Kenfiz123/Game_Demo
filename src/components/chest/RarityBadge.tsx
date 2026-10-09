import { getRarityConfig } from "@/data/chestConfig";
import type { Rarity } from "@/types/gamification";

interface RarityBadgeProps {
  rarity: Rarity;
  large?: boolean;
}

export function RarityBadge({ rarity, large = false }: RarityBadgeProps) {
  const config = getRarityConfig(rarity);
  return (
    <span
      className={`rarity-badge ${large ? "rarity-badge-large" : ""}`}
      style={{ "--rarity": config.color, "--rarity-glow": config.glow } as React.CSSProperties}
    >
      {rarity}
    </span>
  );
}
