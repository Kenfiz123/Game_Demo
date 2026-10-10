"use client";
import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import { getMythicVariant } from "@/data/mythicCatalog";
import type { CosmeticItem, MythicVariant } from "@/types/gamification";

const exactChance = (chance: number) => chance > 0 && chance < .000001 ? "< 0,000001" : chance.toLocaleString("vi-VN", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const EMPTY_OWNED: readonly string[] = [];

export function MythicSpotlight({ items, chance, rarityChance, ownedItemIds = EMPTY_OWNED }: {
  items: readonly CosmeticItem[]; chance: number; rarityChance: number; ownedItemIds?: readonly string[];
}) {
  const [paused, setPaused] = useState(false);
  const [variant, setVariant] = useState<MythicVariant>("SOVEREIGN");
  const owned = useMemo(() => new Set(ownedItemIds), [ownedItemIds]);
  const item = items.find(item => item.mythicVariant === variant) ?? items[0];
  if (!item) return null;
  const edition = getMythicVariant(item.mythicVariant);
  const avatars = items.filter(candidate => candidate.type === "AVATAR" && (candidate.mythicVariant === "AURORA" || candidate.mythicVariant === "CELESTIAL"));
  const achievement = items.find(candidate => candidate.mythicVariant === "LEGACY" && candidate.type === "TITLE");
  return <section className="mythic-spotlight royal-mythic-spotlight" aria-label="Xem trước bộ Mythic vương giả">
    <div className="royal-spotlight-intro"><div><h3>Bộ Mythic vương giả</h3><p>Tám bảo vật. Tám chuyển động. Một dấu ấn không thể nhầm lẫn.</p></div><span>{items.filter(item => owned.has(item.id)).length} / {items.length} đã sở hữu</span></div>
    <section className="club-mythic-set" aria-label="Avatar và thành tích Mythic của CLB">
      {avatars.length ? <div className="club-mythic-set-entry">
        <h4>Avatar Mythic</h4><p>Chọn Cực Quang hoặc Thiên Hà cho cùng vị trí avatar. Cả hai giữ biểu trưng Mythic riêng của CLB.</p>
        <div className="club-mythic-set-actions" role="group" aria-label="Xem avatar Mythic">{avatars.map(candidate => {
          const config = getMythicVariant(candidate.mythicVariant);
          return <button type="button" key={candidate.id} data-preview-variant={config.variant} data-preview-item={candidate.id} aria-label={"Xem avatar Mythic " + candidate.name} aria-pressed={item.id === candidate.id} onClick={() => setVariant(config.variant)}>{config.label}{owned.has(candidate.id) ? <small>Đã có</small> : null}</button>;
        })}</div>
      </div> : null}
      {achievement ? <div className="club-mythic-set-entry">
        <h4>Thành tích Mythic</h4><p className="club-mythic-achievement-name">{achievement.name}</p><small>Danh hiệu cosmetic Truyền Nhân, không phải thành tích được công nhận ngoài đời.</small>
        <div className="club-mythic-set-actions"><button type="button" data-preview-variant="LEGACY" data-preview-item={achievement.id} aria-label={"Xem thành tích Mythic " + achievement.name} aria-pressed={item.id === achievement.id} onClick={() => setVariant("LEGACY")}>Xem danh hiệu{owned.has(achievement.id) ? <small>Đã có</small> : null}</button></div>
      </div> : null}
    </section>
    <div className="royal-variant-selector" role="group" aria-label="Chọn biến thể Mythic">{items.map(candidate => {
      const config = getMythicVariant(candidate.mythicVariant);
      return <button type="button" key={candidate.id} aria-pressed={item.id === candidate.id} onClick={() => setVariant(config.variant)}><span>{config.label}</span><small>{config.type === "TITLE" ? "Danh hiệu di sản" : config.type === "AVATAR" ? "Avatar" : config.type === "FRAME" ? "Khung" : config.type === "LOGO" ? "Biểu trưng" : "Hiệu ứng"}{owned.has(candidate.id) ? " · Đã có" : ""}</small></button>;
    })}</div>
    <div className="royal-spotlight-stage">
      <div className="mythic-spotlight-art royal-spotlight-art"><CosmeticArt key={item.id} item={item} animated={!paused}/></div>
      <div className="mythic-spotlight-copy royal-spotlight-copy">
        <div className="royal-spotlight-edition"><RarityBadge rarity="MYTHIC"/><span>{edition.label}</span></div>
        <h4 aria-live="polite">{item.name}</h4>
        {item.heritage ? <p className="royal-heritage">Di sản {item.heritage}</p> : null}
        <p>{item.description}</p>
        <div className="mythic-facts royal-mythic-facts"><span><strong>{rarityChance.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}%</strong>Trúng bậc Mythic</span><span><strong>{exactChance(chance)}%</strong>Riêng bảo vật này / rương</span></div>
        <div className="royal-preview-controls"><button type="button" className="secondary-button mythic-motion-toggle" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={13}/> : <Pause size={13}/>} {paused ? "Tiếp tục hiệu ứng xem trước" : "Tạm dừng hiệu ứng xem trước"}</button><span>{owned.has(item.id) ? "Đã có trong kho — có thể trang bị" : "Chỉ nhận từ rương"}</span></div>
        <small>Xem trước không cấp vật phẩm. Trang bị Mythic đã sở hữu trong kho để giữ chuyển động trên hồ sơ. Trong rương, Mythic ẩn trong ô bí mật đến lúc kết thúc.</small>
      </div>
    </div>
  </section>;
}
