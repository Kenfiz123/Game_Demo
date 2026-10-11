"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { getCosmeticById } from "@/data/cosmetics";
import { useXperience } from "@/hooks/useXperience";
import type { CosmeticItem, EquipSlot } from "@/types/gamification";

const slots: readonly { slot: EquipSlot; label: string }[] = [
  { slot: "AVATAR", label: "Avatar" }, { slot: "FRAME", label: "Khung" },
  { slot: "TITLE", label: "Danh hiệu" }, { slot: "LOGO", label: "Logo" }, { slot: "EFFECT", label: "Hiệu ứng" },
];

export function EquippedProfile() {
  const { state, hydrated, isPlaying, unequipItem } = useXperience();
  const [pending, setPending] = useState<EquipSlot | null>(null);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const equipped = useMemo(() => {
    const owned = new Set(state.ownedItemIds);
    const items: Partial<Record<EquipSlot, CosmeticItem>> = {};
    for (const { slot } of slots) {
      const id = state.equipped[slot], item = id ? getCosmeticById(id) : undefined;
      if (item && item.rarity === "MYTHIC" && item.type === slot && owned.has(item.id)) items[slot] = item;
    }
    return items;
  }, [state.equipped, state.ownedItemIds]);
  const equippedCount = Object.keys(equipped).length;
  const clear = async (slot: EquipSlot) => {
    if (inFlight.current || !hydrated || isPlaying) return;
    inFlight.current = true; setPending(slot); setMessage("");
    try {
      const success = await unequipItem(slot);
      if (mounted.current) setMessage(success ? "Đã gỡ " + slots.find(entry => entry.slot === slot)?.label.toLocaleLowerCase("vi-VN") + ". Vật phẩm vẫn ở trong kho." : "Chưa gỡ được trang bị. Chờ lượt chơi kết thúc rồi thử lại.");
    } catch {
      if (mounted.current) setMessage("Chưa xác nhận được thay đổi. Kết nối lại backend để tải trang bị mới nhất.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(null);
    }
  };

  return <section className="equipped-profile panel" aria-labelledby="equipped-profile-heading">
    <div className="equipped-profile-heading"><div><span className="inventory-eyebrow">DẤU ẤN MYTHIC</span><h2 id="equipped-profile-heading">Hồ sơ đang trang bị</h2><p>Vật phẩm quý không chỉ nằm trong kho. Trang bị Mythic để giữ dấu ấn và chuyển động riêng trên hồ sơ.</p></div><div className="equipped-profile-completion"><span>{equippedCount} / {slots.length} vị trí</span><progress max={slots.length} value={equippedCount} aria-label="Số vị trí đã trang bị"/></div></div>
    <div className={"equipped-profile-preview" + (equippedCount ? " has-equipped-mythic" : "")}>
      <div className="equipped-profile-identity">
        <div className="equipped-profile-portrait">
          {equipped.FRAME ? <div className="equipped-profile-frame"><CosmeticArt item={equipped.FRAME} animated/></div> : null}
          <div className="equipped-profile-avatar">{equipped.AVATAR ? <CosmeticArt item={equipped.AVATAR} animated/> : <div className="equipped-profile-default-avatar" aria-hidden="true"><UserRound size={43}/></div>}</div>
          <span className="equipped-profile-portrait-label">{equipped.AVATAR ? "AVATAR MYTHIC" : "CHƯA TRANG BỊ AVATAR"}</span>
        </div>
        <div className="equipped-profile-name"><span>Student</span><small>FPT University</small>
          {equipped.TITLE ? <div className="equipped-profile-title"><div className="equipped-profile-title-art"><CosmeticArt item={equipped.TITLE} animated/></div><h3 className="equipped-profile-title-name">{equipped.TITLE.name}</h3>{equipped.TITLE.heritage ? <p>Di sản {equipped.TITLE.heritage}</p> : null}</div> : <p className="equipped-profile-empty-title">Chưa trang bị danh hiệu Mythic</p>}
        </div>
      </div>
      {equipped.LOGO ? <div className="equipped-profile-logo"><CosmeticArt item={equipped.LOGO} animated/><span>{equipped.LOGO.name}</span></div> : null}
      {equipped.EFFECT ? <div className="equipped-profile-effect"><CosmeticArt item={equipped.EFFECT} animated/><p className="equipped-profile-effect-label">Hiệu ứng Mythic</p></div> : null}
    </div>
    <div className="equipped-profile-slots">{slots.map(({ slot, label }) => <div className="equipped-profile-slot" data-filled={equipped[slot] ? "true" : "false"} key={slot}>
      <div><span>{label}</span><strong>{equipped[slot]?.name ?? "Chưa trang bị"}</strong></div>
      {equipped[slot] ? <button type="button" aria-label={"Gỡ " + label.toLocaleLowerCase("vi-VN")} disabled={isPlaying || pending !== null} onClick={() => clear(slot)}>{pending === slot ? "Đang gỡ…" : "Gỡ"}</button> : null}
    </div>)}</div>
    {message ? <p className="equipped-profile-message" role="status">{message}</p> : null}
    {!equippedCount ? <p className="equipped-profile-footnote">Chọn Trang bị trên đồ Mythic trong kho. Chỉ trang bị đồ đã sở hữu; không cấp đồ khi xem trước. Nhận Mythic qua rương, <Link href="/forge">Lò Thần Thoại</Link> hoặc chợ.</p> : <p className="equipped-profile-footnote">Trang bị được lưu cùng kho và giữ lại khi tải trang. Gỡ trang bị không mất vật phẩm. Chuyển động tự nghỉ khi ngoài màn hình, tab ẩn hoặc bật giảm chuyển động.</p>}
  </section>;
}
