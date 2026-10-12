"use client";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, LockKeyholeOpen, Star } from "lucide-react";
import { cosmeticTypeLabels } from "@/components/ui/CosmeticIcon";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import type { CosmeticItem, EquipSlot } from "@/types/gamification";
import { getClubById } from "@/data/clubs";
import { getMythicVariant } from "@/data/mythicCatalog";
import { useXperience } from "@/hooks/useXperience";
import type { ItemCopy } from "@/types/collector";
import { getEquipSlot } from "@/lib/equipmentEngine";

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
  const { hydrated, isPlaying, setCopyLock } = useXperience();
  const [selectedId, setSelectedId] = useState(copies[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const selected = copies.find(copy => copy.id === selectedId) ?? copies[0];
  if (!selected) return null;
  const protectedCopy = selected.locked === true;
  const toggleLock = async () => {
    if (inFlight.current || !hydrated || isPlaying) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const saved = await setCopyLock(selected.id, !protectedCopy);
      if (mounted.current) setMessage(saved ? protectedCopy ? "Đã mở khóa bản sao này." : "Đã khóa bản sao này. Không thể bán hoặc dùng làm nguyên liệu." : "Chưa lưu được khóa. Kết nối lại và kiểm tra kho trước khi thử lại.");
    } catch { if (mounted.current) setMessage("Chưa xác nhận được thay đổi. Kết nối lại để tải trạng thái đã lưu."); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  };
  const selectId = `copy-${item.id}`;
  return <div className="copy-passport-control">
    {copies.length > 1 ? <><label htmlFor={selectId}>Chọn bản sao ({copies.length})</label><select id={selectId} value={selected.id} disabled={pending} onChange={event => { setSelectedId(event.target.value); setMessage(""); }}>{copies.map((copy, index) => <option key={copy.id} value={copy.id}>#{index + 1} · {copy.serial.slice(-8)} · {copy.locked ? "Đã khóa" : "Chưa khóa"}</option>)}</select></> : null}
    <button type="button" className="copy-passport-button" aria-label={`Xem dấu ấn ${item.name}, serial ${selected.serial}`} onClick={() => onInspect(selected.id)}>Dấu ấn bản sao <span aria-hidden="true">↗</span></button>
    <span className="copy-passport-serial" title={selected.serial}>Serial · {selected.serial.slice(-8)}</span>
    <span className="copy-protection-status" data-locked={protectedCopy}>{protectedCopy ? <LockKeyhole size={12} aria-hidden="true"/> : <LockKeyholeOpen size={12} aria-hidden="true"/>}{protectedCopy ? "Đã khóa · Không bán / đổi / luyện" : "Chưa khóa · Có thể bán hoặc dùng làm nguyên liệu"}</span>
    <button type="button" className="copy-lock-button" disabled={!hydrated || isPlaying || pending} aria-pressed={protectedCopy} aria-busy={pending} aria-label={`${protectedCopy ? "Mở khóa" : "Khóa"} bản sao ${item.name}, serial ${selected.serial}`} onClick={toggleLock}>{protectedCopy ? <LockKeyholeOpen size={14} aria-hidden="true"/> : <LockKeyhole size={14} aria-hidden="true"/>}{pending ? "Đang lưu…" : protectedCopy ? "Mở khóa bản này" : "Khóa bản này"}</button>
    <p className="item-protection-message" role="status">{message}</p>
  </div>;
}

function WishlistControl({ item }: { item: CosmeticItem }) {
  const { collector, hydrated, isPlaying, setWishlist, playerId } = useXperience();
  const wished = collector.wishlistItemIds?.includes(item.id) ?? false;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ playerId: string | null; text: string } | null>(null);
  const inFlight = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const toggle = async () => {
    if (inFlight.current || !hydrated || isPlaying) return;
    if (!wished && (collector.wishlistItemIds?.length ?? 0) >= 200) {
      setMessage({ playerId, text: "Wishlist đã đủ 200 món. Bỏ một món trước khi thêm mục tiêu mới." });
      return;
    }
    inFlight.current = true; setPending(true); setMessage(null);
    try {
      const saved = await setWishlist(item.id, !wished);
      if (mounted.current) setMessage({ playerId, text: saved ? wished ? "Đã bỏ yêu thích." : "Đã thêm vào vật phẩm yêu thích." : "Chưa lưu được yêu thích. Hãy kết nối lại để kiểm tra." });
    } catch { if (mounted.current) setMessage({ playerId, text: "Chưa xác nhận được yêu thích. Kết nối lại để tải trạng thái đã lưu." }); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  };
  return <><button type="button" className="cosmetic-wishlist" aria-label={`${wished ? "Bỏ yêu thích" : "Yêu thích"} ${item.name}`} aria-pressed={wished} aria-busy={pending} disabled={!hydrated || isPlaying || pending} onClick={toggle}><Star size={14} aria-hidden="true" fill={wished ? "currentColor" : "none"}/>{pending ? "Đang lưu…" : wished ? "Đã yêu thích" : "Yêu thích"}</button>{message?.playerId === playerId ? <p className="item-protection-message" role="status">{message.text}</p> : null}</>;
}

export function CosmeticCard({ item, quantity, copies, onInspect }: { item: CosmeticItem; quantity?: number; copies?: readonly ItemCopy[]; onInspect?: (copyId: string) => void }) {
  const club = item.clubId ? getClubById(item.clubId) : undefined;
  const edition = item.mythicVariant ? getMythicVariant(item.mythicVariant) : undefined;
  return <article className={"cosmetic-card" + (item.rarity === "MYTHIC" ? " cosmetic-card-mythic" : "")} data-inventory-item={quantity !== undefined ? item.id : undefined}>
    <CosmeticArt item={item} animated/>
    {quantity !== undefined && <span className="cosmetic-quantity" aria-label={quantity + " bản trong kho"}>×{quantity.toLocaleString("vi-VN")}</span>}
    <div className="cosmetic-card-content"><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><p>{item.seasonId ? "Avatar · Mùa sưu tầm " + item.seasonId : edition ? cosmeticTypeLabels[item.type] + " · " + edition.label : cosmeticTypeLabels[item.type]}</p>{item.heritage && <p className="cosmetic-heritage">Di sản {item.heritage}</p>}{club && <p className="cosmetic-club-label">{club.shortName} · {club.campus}</p>}<WishlistControl item={item}/>{getEquipSlot(item) && quantity !== undefined && quantity > 0 ? <MythicEquipControl item={item}/> : null}{quantity !== undefined && quantity > 0 && copies?.length && onInspect ? <CopyPassportControl item={item} copies={copies} onInspect={onInspect}/> : null}</div>
  </article>;
}
