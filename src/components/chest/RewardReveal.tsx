"use client";
import { useEffect, useRef } from "react";
import { ArrowRight, Check, CopyPlus, RotateCcw, Sparkles } from "lucide-react";
import { getRarityConfig } from "@/data/chestConfig";
import { cosmeticsByRarity } from "@/data/cosmetics";
import { getClubById } from "@/data/clubs";
import { getMythicVariant } from "@/data/mythicCatalog";
import { cosmeticTypeLabels } from "@/components/ui/CosmeticIcon";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "./RarityBadge";
import type { ChestReward } from "@/types/gamification";
export function RewardReveal({ reward, onOpenAgain, onInventory, onClose, cost }: {
  reward: ChestReward; onOpenAgain: () => void; onInventory: () => void; onClose: () => void; cost: number;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const { item, isDuplicate } = reward;
  const config = getRarityConfig(item.rarity);
  const isMythic = item.rarity === "MYTHIC";
  const variant = isMythic ? getMythicVariant(item.mythicVariant) : null;
  const club = item.clubId ? getClubById(item.clubId) : undefined;
  return <section className={"reward-reveal rarity-" + item.rarity.toLowerCase() + (isMythic ? " mythic-ceremony" : "")} style={{ "--reward": config.color } as React.CSSProperties}>
    {isMythic ? <header className="mythic-ceremony-heading">
      <h2 ref={heading} tabIndex={-1} aria-label={"Di sản đã thức tỉnh: " + item.name}>Di sản đã thức tỉnh</h2>
      <p>Niêm phong đã mở. Dấu ấn này thuộc về bạn.</p>
    </header> : <div className="reward-eyebrow"><Sparkles size={15}/> {isDuplicate ? "A FAMILIAR DISCOVERY" : "A NEW PART OF YOUR STORY"}</div>}
    <div className="reward-art"><CosmeticArt item={item} priority animated/></div>
    {isMythic ? <div className="mythic-ceremony-identity">
      <div className="mythic-ceremony-edition"><RarityBadge rarity={item.rarity} large/><span>{variant?.label} · {cosmeticTypeLabels[item.type]}</span></div>
      <h3>{item.name}</h3>
      {club ? <p className="mythic-ceremony-club">{club.shortName} · {club.campus}</p> : null}
      <p className="mythic-ceremony-description">{item.description}</p>
      <p className="mythic-ceremony-lifelong">Hiệu ứng đi cùng khi trang bị, không chỉ xuất hiện lúc mở rương.</p>
      <small className="mythic-ceremony-pool">Một trong {cosmeticsByRarity("MYTHIC").length} vật phẩm Mythic. Trang bị trong kho để tạo dấu ấn riêng.</small>
    </div> : <><RarityBadge rarity={item.rarity} large/>
      <h2 ref={heading} tabIndex={-1}>{item.name}</h2><p>{item.description}</p><span className="reward-type">{cosmeticTypeLabels[item.type]}</span></>}
    <div className="reward-saved" role="status">{isDuplicate ? <><CopyPlus size={15}/> Bản sao mới đã cất vào kho{item.rarity !== "LEGENDARY" && item.rarity !== "MYTHIC" ? " · Có thể dùng để đổi đồ" : ""}</> : <><Check size={15}/> Added to your collection</>}</div>
    <div className="reward-actions"><button className="primary-button" onClick={onInventory}>{isMythic ? "Trang bị trong kho" : "View collection"} <ArrowRight size={16}/></button>
    <button className="secondary-button" onClick={onOpenAgain}><RotateCcw size={15}/> {isMythic ? "Mở tiếp" : "Play again"} · {cost} EX</button></div>
    <button className="text-button" onClick={onClose}>{isMythic ? "Trở về rương" : "Back to game"}</button>
  </section>;
}
