"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Orbit, Sparkles } from "lucide-react";
import { useRewardGame } from "@/hooks/useRewardGame";
import { ArcadeHeading } from "@/components/arcade/ArcadeHeading";
import { GameAside } from "@/components/arcade/GameAside";
import { RewardCatalog } from "@/components/arcade/RewardCatalog";
import { RewardReveal } from "@/components/chest/RewardReveal";
import { OrbitWheel } from "./OrbitWheel";
export function LuckyOrbit() {
  const game = useRewardGame("orbit"); const router = useRouter();
  const spinning = game.phase === "rolling" || game.phase === "settling";
  return <div className="page-wrap arcade-page"><ArcadeHeading game="orbit"/>
    <div className="game-layout"><section ref={game.panelRef} className="game-panel orbit-panel" aria-label="Lucky Orbit">
      <Image className="orbit-scene" src="/assets/orbit-observatory.webp" alt="" fill sizes="(max-width: 760px) 100vw, 800px"/>
      <div className="panel-topline"><span><Orbit size={14}/> LEAVE IT TO THE UNIVERSE</span><span>02 — LUCKY ORBIT</span></div>
      {game.phase !== "result" && <div className="game-intro"><h2>A little spin. A new possibility.</h2><p>Eight equal sectors. Let luck take the lead.</p></div>}
      <div className={"game-stage phase-" + game.phase} aria-busy={game.disabled}>
        {game.phase === "result" && game.opening ?
          <RewardReveal reward={game.opening.reward} cost={game.cost} onOpenAgain={game.start} onInventory={() => router.push("/inventory")} onClose={game.close}/> :
          <><OrbitWheel key={game.opening?.id ?? "idle"} spinning={spinning} settled={game.phase === "settling"} sectorIndex={game.opening?.sectorIndex} onLanded={game.onLanded}/>
          <div className="orbit-status" role="status">{game.phase === "charging" ? "Setting your orbit…" : game.phase === "rolling" ? "Letting the universe decide…" : game.phase === "settling" ? "Your orbit has landed." : "1 IN 8 CHANCE · EVERY SECTOR"}</div>
          <div className="game-controls"><div className="cost-label"><span className="ex-symbol">EX</span><strong>{game.cost}</strong><span>per spin</span></div>
            <button className="primary-button play-button" onClick={game.start} disabled={game.disabled}>{game.disabled ? <><span className="button-spinner"/> Spinning…</> : <><Sparkles size={17}/> Spin Lucky Orbit <ArrowRight size={17}/></>}</button>
            <span className="control-note">{game.canAfford ? "Pure chance. No timing or skill advantage." : "Earn more EX through campus activities to play."}</span>
          </div></>}
      </div>
      {game.error && <div className="notice" role="alert"><AlertCircle size={16}/>{game.error}</div>}
      <div className="panel-bottomline"><span><i/> A COSMETIC ON EVERY SPIN</span><span>5 RARITIES · 8 EQUAL SECTORS</span></div>
    </section><GameAside game="orbit"/></div><RewardCatalog/></div>;
}
