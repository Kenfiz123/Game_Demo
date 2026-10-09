"use client";
import { useEffect, useRef, useState } from "react";
import { cosmeticTypeLabels } from "@/components/ui/CosmeticIcon";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import type { CosmeticItem, EquipSlot } from "@/types/gamification";
import { getClubById } from "@/data/clubs";
import { getMythicVariant } from "@/data/mythicCatalog";
import { useXperience } from "@/hooks/useXperience";

function MythicEquipControl({ item }: { item: CosmeticItem }) {
  const { state, hydrated, isPlaying, equipItem, unequipItem } = useXperience();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const owned = state.ownedItemIds.includes(item.id);
  const equipped = state.equipped[item.type as EquipSlot] === item.id;
  const toggle = async () => {
    if (inFlight.current || !hydrated || !owned || isPlaying) return;
    inFlight.current = true;
    setPending(true); setMessage("");
    try {
      const success = equipped ? await unequipItem(item.type as EquipSlot) : await equipItem(item.id);
      if (mounted.current) setMessage(success ? (equipped ? "Đã gỡ trang bị." : "Đã trang bị lên hồ sơ.") : "Chưa thay đổi được trang bị. Thử lại sau khi lượt chơi kết thúc.");
    } catch {
      if (mounted.current) setMessage("Không lưu được trang bị. Kiểm tra bộ nhớ trình duyệt rồi thử lại.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return <div className="mythic-equip-control"><button type="button" className="mythic-equip-button" aria-label={(equipped ? "Gỡ trang bị " : "Trang bị ") + item.name} aria-pressed={equipped} disabled={!hydrated || !owned || isPlaying || pending} onClick={toggle}>{pending ? "Đang lưu…" : equipped ? "Gỡ trang bị" : "Trang bị"}</button><p role="status">{message}</p></div>;
}

export function CosmeticCard({ item, quantity }: { item: CosmeticItem; quantity?: number }) {
  const club = item.clubId ? getClubById(item.clubId) : undefined;
  const edition = item.mythicVariant ? getMythicVariant(item.mythicVariant) : undefined;
  return <article className={"cosmetic-card" + (item.rarity === "MYTHIC" ? " cosmetic-card-mythic" : "")}>
    <CosmeticArt item={item} animated/>
    {quantity !== undefined && <span className="cosmetic-quantity" aria-label={quantity + " bản trong kho"}>×{quantity.toLocaleString("vi-VN")}</span>}
    <div className="cosmetic-card-content"><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><p>{edition?.label ?? cosmeticTypeLabels[item.type]}</p>{item.heritage && <p className="cosmetic-heritage">Di sản {item.heritage}</p>}{club && <p className="cosmetic-club-label">{club.shortName} · {club.campus}</p>}{item.rarity === "MYTHIC" && quantity !== undefined && quantity > 0 ? <MythicEquipControl item={item}/> : null}</div>
  </article>;
}
