"use client";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { ChestVisual } from "./ChestVisual";
import { RewardReveal } from "./RewardReveal";
import { RewardReel } from "./RewardReel";
import { useRewardGame } from "@/hooks/useRewardGame";
import { ArcadeHeading } from "@/components/arcade/ArcadeHeading";
import { GameAside } from "@/components/arcade/GameAside";
import { RewardCatalog } from "@/components/arcade/RewardCatalog";
import { COSMETICS } from "@/data/cosmetics";
export function ChestOpening() {
  const game = useRewardGame("chest");
  const router = useRouter();
  const rolling = game.phase === "rolling" || game.phase === "settling";
  return <div className="page-wrap arcade-page"><ArcadeHeading game="chest"/>
    <div className="game-layout"><section ref={game.panelRef} className="game-panel chest-panel" aria-label="Mystery Chest">
      <div className="panel-topline"><span><LockKeyhole size={13}/> THE ORIGINAL EXPERIENCE</span><span>01 — MYSTERY CHEST</span></div>
      {game.phase !== "result" && <div className="game-intro"><h2 id="chest-title">Unlock the extraordinary.</h2><p>One chest. A world of possibilities.</p></div>}
      <div className={"game-stage phase-" + game.phase} aria-busy={game.disabled}>
        {game.phase === "result" && game.opening ?
          <RewardReveal reward={game.opening.reward} cost={game.cost} onOpenAgain={game.start} onInventory={() => router.push("/inventory")} onClose={game.close}/> :
          <>{rolling && game.opening ? <RewardReel key={game.opening.id} reward={game.opening.reward} settled={game.phase === "settling"} onLanded={game.onLanded}/> : <ChestVisual charging={game.phase === "charging"}/>}
            <div className="game-controls"><div className="cost-label"><span className="ex-symbol">EX</span><strong>{game.cost}</strong><span>per chest</span></div>
              <button className="primary-button play-button" onClick={game.start} disabled={game.disabled}>
                {game.disabled ? <><span className="button-spinner"/>{game.phase === "charging" ? "Unlocking…" : game.phase === "settling" ? "Revealing…" : "Discovering…"}</> : <><Sparkles size={17}/> Open Mystery Chest <ArrowRight size={17}/></>}
              </button><span className="control-note">{game.canAfford ? "Your next favorite could be one chest away." : "Earn more EX through campus activities to play."}</span></div></>}
      </div>
      {game.error && <div className="notice" role="alert"><AlertCircle size={16}/>{game.error}</div>}
      <div className="panel-bottomline"><span><i/> {COSMETICS.length} COSMETICS TO DISCOVER</span><span>6 RARITIES · 1 GUARANTEED REWARD</span></div>
    </section><GameAside game="chest"/></div><RewardCatalog/></div>;
}
