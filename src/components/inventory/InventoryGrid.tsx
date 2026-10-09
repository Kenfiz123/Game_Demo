"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, SearchX, SlidersHorizontal } from "lucide-react";
import { COSMETICS, getCosmeticById } from "@/data/cosmetics";
import { CLUBS } from "@/data/clubs";
import { CosmeticCard } from "./CosmeticCard";
import { EquippedProfile } from "./EquippedProfile";
import { useXperience } from "@/hooks/useXperience";
import type { CosmeticType, Rarity } from "@/types/gamification";

type TypeFilter = "ALL" | CosmeticType;
type RarityFilter = "ALL" | Rarity;
const PAGE_SIZE = 24;
const availableTypes = new Set(COSMETICS.map(item => item.type));
const allTypeFilters: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "Tất cả" }, { value: "LOGO", label: "Logo" }, { value: "AVATAR", label: "Avatar" },
  { value: "TITLE", label: "Danh hiệu" }, { value: "FRAME", label: "Khung" }, { value: "BADGE", label: "Huy hiệu" },
  { value: "BACKGROUND", label: "Hình nền" }, { value: "EFFECT", label: "Hiệu ứng" },
  { value: "NAMEPLATE", label: "Bảng tên" }, { value: "EMOTE", label: "Biểu cảm" },
];
const typeFilters = allTypeFilters.filter(filter => filter.value === "ALL" || availableTypes.has(filter.value));
const rarityFilters: RarityFilter[] = ["ALL", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];

export function InventoryGrid() {
  const { state, hydrated } = useXperience();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");
  const [clubFilter, setClubFilter] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [page, setPage] = useState(0);
  const quantities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of state.ownedItemIds) {
      if (getCosmeticById(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [state.ownedItemIds]);
  const ownedItems = useMemo(() => COSMETICS.filter(item => quantities.has(item.id)), [quantities]);
  const totalCopies = Array.from(quantities.values()).reduce((sum, quantity) => sum + quantity, 0);
  const visibleItems = ownedItems.filter(item =>
    (typeFilter === "ALL" || item.type === typeFilter) && (rarityFilter === "ALL" || item.rarity === rarityFilter) &&
    (!clubFilter || item.clubId === clubFilter) && (!duplicatesOnly || (quantities.get(item.id) ?? 0) > 1));
  const visibleCopies = visibleItems.reduce((sum, item) => sum + (quantities.get(item.id) ?? 0), 0);
  const pages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const clear = () => { setTypeFilter("ALL"); setRarityFilter("ALL"); setClubFilter(""); setDuplicatesOnly(false); setPage(0); };

  return <section className="collection-section">
    {hydrated ? <EquippedProfile/> : null}
    <div className="inventory-summary panel">
      <div><span>TỔNG VẬT PHẨM</span><strong>{hydrated ? totalCopies.toLocaleString("vi-VN") : "—"}<small> bản trong kho</small></strong></div>
      <div><span>BỘ SƯU TẬP HIỆN CÓ</span><strong>{hydrated ? ownedItems.length : "—"}<small> / {COSMETICS.length} mẫu</small></strong></div>
      <Link href="/trade-up" className="secondary-button">Mang đồ đi đổi <ArrowUpRight size={15}/></Link>
    </div>
    <div className="collection-controls panel">
      <div className="type-filter" role="group" aria-label="Lọc kho theo loại vật phẩm">
        {typeFilters.map(filter => <button onClick={() => { setTypeFilter(filter.value); setPage(0); }} aria-pressed={typeFilter === filter.value} className={typeFilter === filter.value ? "selected" : ""} key={filter.value}>{filter.label}</button>)}
      </div>
      <label className="rarity-select"><SlidersHorizontal size={16}/><span>Độ hiếm</span><select value={rarityFilter} onChange={event => { setRarityFilter(event.target.value as RarityFilter); setPage(0); }}>
        {rarityFilters.map(rarity => <option value={rarity} key={rarity}>{rarity === "ALL" ? "Tất cả độ hiếm" : rarity}</option>)}
      </select></label>
    </div>
    <div className="inventory-club-filter">
      <label>CLB<select value={clubFilter} onChange={event => { setClubFilter(event.target.value); setPage(0); }}><option value="">Tất cả CLB</option>{CLUBS.map(club => <option key={club.id} value={club.id}>{club.shortName} · {club.campus}</option>)}</select></label>
      <label className="inventory-duplicates-filter"><input type="checkbox" checked={duplicatesOnly} onChange={event => { setDuplicatesOnly(event.target.checked); setPage(0); }}/><span>Chỉ đồ có bản sao</span></label>
      <Link href="/clubs">Xem toàn bộ vật phẩm CLB</Link>
    </div>
    <div className="collection-meta" role="status"><span>{hydrated ? visibleItems.length + " mẫu · " + visibleCopies.toLocaleString("vi-VN") + " bản" : "Đang tải kho…"}</span><span>Trang {current + 1} / {pages}</span></div>
    {!hydrated ? <div className="empty-state panel"><p>Đang tải bộ sưu tập…</p></div> : visibleItems.length > 0 ? <>
      <div className="inventory-grid">{visibleItems.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(item => <CosmeticCard item={item} quantity={quantities.get(item.id)} key={item.id}/>)}</div>
      {pages > 1 && <nav className="club-pagination" aria-label="Phân trang kho đồ"><button className="secondary-button" disabled={current === 0} onClick={() => setPage(current - 1)}>Trang trước</button><span>{current + 1} / {pages}</span><button className="secondary-button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Trang sau</button></nav>}
    </> : <div className="empty-state panel"><SearchX size={28}/><h2>{ownedItems.length ? "Không có đồ khớp bộ lọc" : "Kho đồ đang chờ khám phá"}</h2>
      <p>{ownedItems.length ? "Thử CLB, độ hiếm hoặc loại vật phẩm khác." : "Mở rương để nhận vật phẩm đầu tiên. Mọi bản sao đều được giữ lại trong kho."}</p>
      {ownedItems.length ? <button className="secondary-button" onClick={clear}>Xóa bộ lọc</button> : <Link className="primary-button" href="/chest">Mở rương</Link>}
    </div>}
    <p className="collection-footnote">Bản sao không đổi thành EX: mỗi lần nhận đều thêm một bản vào kho, có thể dùng cho game Đổi đồ. Mythic chỉ nhận từ rương, không dùng để đổi; trang bị Mythic đã sở hữu để giữ hiệu ứng trên hồ sơ. Vật phẩm CLB là thiết kế concept, không xác nhận tư cách thành viên.</p>
  </section>;
}
