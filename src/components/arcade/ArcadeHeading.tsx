import Link from "next/link";
import { Box, Layers3, Orbit, Sparkles } from "lucide-react";
import type { GameId } from "@/types/gamification";
export function ArcadeHeading({ game }: { game: GameId }) {
  return <><div className="page-heading arcade-heading"><div><div className="section-kicker"><Sparkles size={13}/> THE REWARD ARCADE</div>
    <h1>Your next <span>discovery.</span></h1><p>Turn your campus moments into something uniquely yours.</p></div>
    <span className="season-tag"><i/> CLUB COLLECTION <span> / </span> FPTU XPERIENCE</span></div>
    <nav className="game-tabs" aria-label="Choose a mini game">
      <Link href="/chest" aria-current={game === "chest" ? "page" : undefined}><Box size={17}/> Mystery Chest <span>100 EX</span></Link>
      <Link href="/orbit" aria-current={game === "orbit" ? "page" : undefined}><Orbit size={17}/> Lucky Orbit <em>NEW</em></Link>
      <Link href="/trade-up"><Layers3 size={17}/> Đổi đồ <span>5 → 1</span></Link>
    </nav></>;
}
