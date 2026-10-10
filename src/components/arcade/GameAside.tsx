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
    <div className="reward-guarantees"><h3><ShieldCheck size={15}/> Trước khi khám phá</h3>
      <p><Check size={14}/> Luôn nhận 1 vật phẩm mỗi lượt</p><p><CopyPlus size={14}/> Đồ trùng vẫn được cất vào kho</p>
      <p><Check size={14}/> Đổi 5 món cùng bậc tại game Đổi đồ</p>
      <p><Check size={14}/> EX không có giá trị quy đổi tiền</p>
      <small>{game === "orbit" ? "8 ô bằng nhau, mỗi ô có 12,5% cơ hội. Nhận đồ ngẫu nhiên theo bậc đã quay trúng. Mythic chỉ có trong rương." : "Mythic được giấu trong ô niêm phong. Vật phẩm chỉ lộ diện sau khi dải thẻ dừng lại."}</small>
    </div>
    <Link className="game-promo" href={game === "chest" ? "/orbit" : "/chest"}>
      <Image src={game === "chest" ? "/assets/orbit-observatory.webp" : "/assets/chest-premium.webp"} alt="" fill sizes="300px"/>
      <div><span>{game === "chest" ? "MỘT CÁCH CHƠI KHÁC" : "TIẾP TỤC KHÁM PHÁ"}</span><strong>{game === "chest" ? "Thử vận may với Lucky Orbit" : "Mở rương bí ẩn"} <ArrowUpRight size={18}/></strong></div>
    </Link>
  </aside>;
}
