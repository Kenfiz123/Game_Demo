"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, CopyPlus, ShieldCheck } from "lucide-react";
import { CHEST_RARITIES } from "@/data/chestConfig";
import { useXperience } from "@/hooks/useXperience";
import { ORBIT_RARITIES } from "@/data/arcadeConfig";
import { DropRates } from "@/components/chest/DropRates";
import { TestCredits } from "./TestCredits";
import type { GameId } from "@/types/gamification";
export function GameAside({ game }: { game: GameId }) {
  const { state } = useXperience();
  const rates = CHEST_RARITIES.map(config => ({ ...config, probability: state.settings.chestOdds[config.rarity] }));
  return <aside className="game-aside"><div><DropRates rates={game === "chest" ? rates : ORBIT_RARITIES}/>{game === "chest" && <Link className="odds-edit-link" href="/settings">Chỉnh tỷ lệ mở rương <ArrowUpRight size={13}/></Link>}</div>
    <TestCredits/>
    <div className="reward-guarantees"><h3><ShieldCheck size={15}/> Good to know</h3>
      <p><Check size={14}/> A cosmetic on every play</p><p><CopyPlus size={14}/> Đồ trùng vẫn được cất vào kho</p>
      <p><Check size={14}/> Đổi 5 món cùng bậc tại game Đổi đồ</p>
      <p><Check size={14}/> EX earned through campus activities</p>
      <small>{game === "orbit" ? "8 equal sectors, each with a 12.5% chance. Receive a random cosmetic of the landed rarity. Mythic is exclusive to Mystery Chest." : "Mythic rewards appear as a mystery vault. Discover the cosmetic after the reel stops."}</small>
    </div>
    <Link className="game-promo" href={game === "chest" ? "/orbit" : "/chest"}>
      <Image src={game === "chest" ? "/assets/orbit-observatory.webp" : "/assets/chest-premium.webp"} alt="" fill sizes="300px"/>
      <div><span>{game === "chest" ? "A NEW WAY TO PLAY" : "KEEP EXPLORING"}</span><strong>{game === "chest" ? "Meet Lucky Orbit" : "Unlock the unknown"} <ArrowUpRight size={18}/></strong></div>
    </Link>
  </aside>;
}
