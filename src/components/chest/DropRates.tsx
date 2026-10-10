import { CHEST_RARITIES } from "@/data/chestConfig";
import { Info } from "lucide-react";
import type { ChestRarityConfig } from "@/types/gamification";
export function DropRates({ rates = CHEST_RARITIES }: { rates?: readonly ChestRarityConfig[] }) {
  return <section className="drop-rates panel" aria-labelledby="drop-rates-title"><div className="section-header"><h2 id="drop-rates-title">Tỷ lệ khám phá</h2><Info size={15}/></div>
    <p>Minh bạch trong từng lượt mở.</p><div className="rates-list">{rates.map((entry) =>
      <div className="rate-row" key={entry.rarity}><div className="rate-label"><i style={{ background: entry.color }}/>{entry.label}</div>
      <strong>{entry.probability}%</strong><div className="rate-meter"><span style={{ width: entry.probability + "%", background: entry.color }}/></div></div>)}</div>
    <small className="odds-note">Mỗi lượt độc lập. Kết quả hoàn toàn ngẫu nhiên.</small>
  </section>;
}
