import { CHEST_RARITIES } from "@/data/chestConfig";
import { Info } from "lucide-react";
import { CHEST_PITY_LIMIT } from "@/lib/chestPity";
import type { ChestRarityConfig, GameId } from "@/types/gamification";
export function DropRates({ rates = CHEST_RARITIES, game = "chest" }: { rates?: readonly ChestRarityConfig[]; game?: GameId }) {
  return <section className="drop-rates panel" aria-labelledby="drop-rates-title"><div className="section-header"><h2 id="drop-rates-title">Tỷ lệ khám phá</h2><Info size={15}/></div>
    <p>{game === "chest" ? "Tỷ lệ cơ bản · chưa tính bảo hiểm pity." : "Minh bạch trong từng lượt mở."}</p><div className="rates-list">{rates.map((entry) =>
      <div className="rate-row" key={entry.rarity}><div className="rate-label"><i style={{ background: entry.color }}/>{entry.label}</div>
      <strong>{entry.probability}%</strong><div className="rate-meter"><span style={{ width: entry.probability + "%", background: entry.color }}/></div></div>)}</div>
    <small className="odds-note">{game === "chest" ? `Bảo hiểm ở lượt ${CHEST_PITY_LIMIT}: 100% Mythic. Ra Mythic từ rương sẽ reset pity về 0.` : "Mỗi lượt độc lập. Kết quả hoàn toàn ngẫu nhiên."}</small>
  </section>;
}
