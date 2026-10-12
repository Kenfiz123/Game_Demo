"use client";
import { useEffect, useRef, useState } from "react";
import { cosmeticTypeLabels } from "@/components/ui/CosmeticIcon";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import type { CosmeticItem, EquipSlot } from "@/types/gamification";
import { getClubById } from "@/data/clubs";
import { getMythicVariant } from "@/data/mythicCatalog";
import { useXperience } from "@/hooks/useXperience";
import type { ItemCopy } from "@/types/collector";

function MythicEquipControl({ item }: { item: CosmeticItem }) {
  const { state, hydrated, isPlaying, equipItem, unequipItem } = useXperience();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const owned = state.ownedItemIds.includes(item.id);
  const equipped = state.equipped[item.type as EquipSlot] === item.id;
  const unavailable = !hydrated || !owned || isPlaying;
  const toggle = async () => {
    if (inFlight.current || !hydrated || !owned || isPlaying) return;
    inFlight.current = true;
    setPending(true); setMessage("");
    try {
      const success = equipped ? await unequipItem(item.type as EquipSlot) : await equipItem(item.id);
      if (mounted.current) setMessage(success ? (equipped ? "Đã gỡ trang bị." : "Đã trang bị lên hồ sơ.") : "Chưa thay đổi được trang bị. Thử lại sau khi lượt chơi kết thúc.");
    } catch {
      if (mounted.current) setMessage("Chưa xác nhận được trang bị. Kết nối lại backend để tải trạng thái mới nhất.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  };
  // Keep the pending control focusable until its card is removed; disabling it
  // natively would blur before InventoryGrid can recover that lost focus.
  return <div className="mythic-equip-control" data-equipped={equipped && owned ? "true" : "false"}>{equipped && owned ? <span className="mythic-equipped-indicator">Đang trang bị</span> : null}<button type="button" className="mythic-equip-button" aria-label={(equipped ? "Gỡ trang bị " : "Trang bị ") + item.name} aria-pressed={equipped} aria-disabled={unavailable || pending ? true : undefined} aria-busy={pending} disabled={unavailable} onClick={toggle}>{pending ? "Đang lưu…" : equipped ? "Gỡ trang bị" : "Trang bị"}</button><p role="status">{message}</p></div>;
}

function CopyPassportControl({ item, copies, onInspect }: { item: CosmeticItem; copies: readonly ItemCopy[]; onInspect: (copyId: string) => void }) {
  const [selectedId, setSelectedId] = useState(copies[0]?.id ?? "");
  const selected = copies.find(copy => copy.id === selectedId) ?? copies[0];
  if (!selected) return null;
  const selectId = `copy-${item.id}`;
  return <div className="copy-passport-control">
    {copies.length > 1 ? <><label htmlFor={selectId}>Chọn bản sao ({copies.length})</label><select id={selectId} value={selected.id} onChange={event => setSelectedId(event.target.value)}>{copies.map((copy, index) => <option key={copy.id} value={copy.id}>#{index + 1} · {copy.serial.slice(-8)}</option>)}</select></> : null}
    <button type="button" className="copy-passport-button" aria-label={`Xem dấu ấn ${item.name}, serial ${selected.serial}`} onClick={() => onInspect(selected.id)}>Dấu ấn bản sao <span aria-hidden="true">↗</span></button>
    <span className="copy-passport-serial" title={selected.serial}>Serial · {selected.serial.slice(-8)}</span>
  </div>;
}

export function CosmeticCard({ item, quantity, copies, onInspect }: { item: CosmeticItem; quantity?: number; copies?: readonly ItemCopy[]; onInspect?: (copyId: string) => void }) {
  const club = item.clubId ? getClubById(item.clubId) : undefined;
  const edition = item.mythicVariant ? getMythicVariant(item.mythicVariant) : undefined;
  return <article className={"cosmetic-card" + (item.rarity === "MYTHIC" ? " cosmetic-card-mythic" : "")} data-inventory-item={quantity !== undefined ? item.id : undefined}>
    <CosmeticArt item={item} animated/>
    {quantity !== undefined && <span className="cosmetic-quantity" aria-label={quantity + " bản trong kho"}>×{quantity.toLocaleString("vi-VN")}</span>}
    <div className="cosmetic-card-content"><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><p>{edition ? cosmeticTypeLabels[item.type] + " · " + edition.label : cosmeticTypeLabels[item.type]}</p>{item.heritage && <p className="cosmetic-heritage">Di sản {item.heritage}</p>}{club && <p className="cosmetic-club-label">{club.shortName} · {club.campus}</p>}{item.rarity === "MYTHIC" && quantity !== undefined && quantity > 0 ? <MythicEquipControl item={item}/> : null}{quantity !== undefined && quantity > 0 && copies?.length && onInspect ? <CopyPassportControl item={item} copies={copies} onInspect={onInspect}/> : null}</div>
  </article>;
}
