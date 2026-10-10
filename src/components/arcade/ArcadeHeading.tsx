import Link from "next/link";
import { Box, Layers3, Orbit, Sparkles } from "lucide-react";
import type { GameId } from "@/types/gamification";
import { CLUBS } from "@/data/clubs";
import { COSMETICS } from "@/data/cosmetics";
export function ArcadeHeading({ game }: { game: GameId }) {
  return <><div className="page-heading arcade-heading"><div><div className="section-kicker"><Sparkles size={13}/> FPTU · BỘ SƯU TẬP CLB</div>
    <h1>Khám phá. <span>Lưu dấu ấn.</span></h1><p>Mỗi vật phẩm là một câu chuyện. Câu chuyện tiếp theo thuộc về bạn.</p></div>
    <div className="arcade-collection-stats" aria-label="Quy mô bộ sưu tập"><div><strong>{CLUBS.length}</strong><span>Câu lạc bộ</span></div><div><strong>{COSMETICS.length}</strong><span>Vật phẩm</span></div></div></div>
    <nav className="game-tabs" aria-label="Chọn mini game">
      <Link href="/chest" aria-current={game === "chest" ? "page" : undefined}><Box size={17}/> Rương bí ẩn <span>100 EX</span></Link>
      <Link href="/orbit" aria-current={game === "orbit" ? "page" : undefined}><Orbit size={17}/> Lucky Orbit <em>NEW</em></Link>
      <Link href="/trade-up"><Layers3 size={17}/> Đổi đồ <span>5 → 1</span></Link>
    </nav></>;
}
