"use client";
import { useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { cosmeticTypeLabels } from "@/components/ui/CosmeticIcon";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { MythicVault } from "@/components/ui/MythicVault";
import { RarityBadge } from "./RarityBadge";
import { buildRewardReel } from "@/lib/rewardReel";
import { useXperience } from "@/hooks/useXperience";
import { MOTION, REEL_CARD_WIDTH, REEL_GAP, REEL_WINNER_INDEX } from "@/data/arcadeConfig";
import { cosmeticsByRarity } from "@/data/cosmetics";
import type { ChestReward } from "@/types/gamification";
export function RewardReel({ reward, settled, onLanded }: { reward: ChestReward; settled: boolean; onLanded: () => void }) {
  const { state } = useXperience();
  const [entries] = useState(() => buildRewardReel(reward.item, undefined, state.settings.chestOdds));
  const style = {
    "--reel-distance": "-" + REEL_WINNER_INDEX * (REEL_CARD_WIDTH + REEL_GAP) + "px",
    "--reel-duration": MOTION.reel + "ms", "--card-width": REEL_CARD_WIDTH + "px", "--card-gap": REEL_GAP + "px",
  } as CSSProperties;
  return <section className={"reward-reel" + (settled ? " is-settled" : "")} style={style} aria-label="Reward carousel">
    <div className="reel-heading">{settled ? "LOCKED IN. YOUR DISCOVERY AWAITS." : "A LITTLE ANTICIPATION. A NEW POSSIBILITY."}</div>
    <div className="reel-window" aria-hidden="true"><ChevronDown className="reel-marker"/><div className="reel-guide"/>
      <div className="reel-track" onAnimationEnd={(event) => { if (event.target === event.currentTarget && event.animationName === "reel-roll") onLanded(); }}>
        {entries.map((entry, index) => entry.kind === "MYTHIC_VAULT" ?
          <article className="reel-card mythic-vault-card" key={index}><MythicVault/><RarityBadge rarity="MYTHIC"/><h3>Di sản niêm phong</h3><p>{cosmeticsByRarity("MYTHIC").length} bí mật bên trong</p></article> :
          <article className="reel-card" key={index}><CosmeticArt item={entry.item} compact animated={false}/><RarityBadge rarity={entry.item.rarity}/><h3>{entry.item.name}</h3><p>{cosmeticTypeLabels[entry.item.type]}</p></article>)}
      </div>
    </div><p className="reel-status" role="status">{settled ? "Revealing your cosmetic…" : "Let the possibilities roll."}</p>
  </section>;
}
