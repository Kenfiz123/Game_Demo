"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ArrowDownWideNarrow, RotateCcw, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { COSMETICS, getCosmeticById } from "@/data/cosmetics";
import { CLUBS, getClubById, normalizeClubSearch } from "@/data/clubs";
import { CosmeticCard } from "./CosmeticCard";
import { EquippedProfile } from "./EquippedProfile";
import { useXperience } from "@/hooks/useXperience";
import type { CosmeticItem, CosmeticType, EquipSlot, Rarity } from "@/types/gamification";

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
const rarityRank: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
const inventorySearchText = new Map(COSMETICS.map(item => {
  const club = item.clubId ? getClubById(item.clubId) : undefined;
  return [item.id, normalizeClubSearch([item.name, item.heritage, club?.name, club?.shortName, club?.campus].filter(Boolean).join(" "))];
}));
type InventorySort = "rarity" | "name" | "quantity";
export interface InventoryFilters {
  query: string; type: TypeFilter; rarity: RarityFilter; club: string;
  duplicatesOnly: boolean; equippedOnly: boolean; sort: InventorySort;
}

/** Search and presentation order never change independently consumable copies. */
export function filterInventoryItems(items: readonly CosmeticItem[], quantities: ReadonlyMap<string, number>, equippedIds: ReadonlySet<string>, filters: InventoryFilters) {
  const terms = normalizeClubSearch(filters.query).trim().split(/\s+/).filter(Boolean);
  return items.filter(item =>
    (filters.type === "ALL" || item.type === filters.type) && (filters.rarity === "ALL" || item.rarity === filters.rarity) &&
    (!filters.club || item.clubId === filters.club) && (!filters.duplicatesOnly || (quantities.get(item.id) ?? 0) > 1) &&
    (!filters.equippedOnly || equippedIds.has(item.id)) &&
    terms.every(term => (inventorySearchText.get(item.id) ?? normalizeClubSearch(item.name)).includes(term)))
    .sort((a, b) => {
      const primary = filters.sort === "rarity" ? rarityRank[b.rarity] - rarityRank[a.rarity] :
        filters.sort === "quantity" ? (quantities.get(b.id) ?? 0) - (quantities.get(a.id) ?? 0) : 0;
      return primary || a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id);
    });
}

/** Only recover focus actually lost with a removed equipped-only result. */
export function shouldRestoreInventoryFocus(equippedOnly: boolean, focusedCard: { isConnected: boolean } | null, focusIsOnBody: boolean, documentHasFocus: boolean) {
  return equippedOnly && focusedCard !== null && !focusedCard.isConnected && focusIsOnBody && documentHasFocus;
}

export function InventoryGrid() {
  const { state, hydrated } = useXperience();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");
  const [clubFilter, setClubFilter] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [equippedOnly, setEquippedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<InventorySort>("rarity");
  const [page, setPage] = useState(0);
  const [inventoryMessage, setInventoryMessage] = useState("");
  const focusedCard = useRef<HTMLElement | null>(null);
  const equippedOnlyControl = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const clearOutsidePointerFocus = (event: PointerEvent) => {
      if (focusedCard.current && !focusedCard.current.contains(event.target as Node)) focusedCard.current = null;
    };
    document.addEventListener("pointerdown", clearOutsidePointerFocus, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", clearOutsidePointerFocus, true);
  }, []);
  const quantities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of state.ownedItemIds) {
      if (getCosmeticById(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [state.ownedItemIds]);
  const ownedItems = useMemo(() => COSMETICS.filter(item => quantities.has(item.id)), [quantities]);
  const equippedIds = useMemo(() => new Set(ownedItems.filter(item => item.rarity === "MYTHIC" && state.equipped[item.type as EquipSlot] === item.id).map(item => item.id)), [ownedItems, state.equipped]);
  const totalCopies = Array.from(quantities.values()).reduce((sum, quantity) => sum + quantity, 0);
  const visibleItems = useMemo(() => filterInventoryItems(ownedItems, quantities, equippedIds, {
    query, type: typeFilter, rarity: rarityFilter, club: clubFilter, duplicatesOnly, equippedOnly, sort,
  }), [ownedItems, quantities, equippedIds, query, typeFilter, rarityFilter, clubFilter, duplicatesOnly, equippedOnly, sort]);
  const visibleCopies = visibleItems.reduce((sum, item) => sum + (quantities.get(item.id) ?? 0), 0);
  const pages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  useEffect(() => {
    const card = focusedCard.current;
    if (!card || card.isConnected) return;
    if (shouldRestoreInventoryFocus(equippedOnly, card, document.activeElement === document.body, document.hasFocus())) {
      equippedOnlyControl.current?.focus();
      setInventoryMessage("Đã gỡ trang bị. Vật phẩm vẫn ở trong kho.");
    }
    focusedCard.current = null;
  }, [visibleItems, equippedOnly]);
  const hasFilters = Boolean(query.trim() || typeFilter !== "ALL" || rarityFilter !== "ALL" || clubFilter || duplicatesOnly || equippedOnly);
  const clear = () => { setQuery(""); setTypeFilter("ALL"); setRarityFilter("ALL"); setClubFilter(""); setDuplicatesOnly(false); setEquippedOnly(false); setPage(0); };

  return <section className="collection-section">
    {hydrated ? <EquippedProfile/> : null}
    <div className="inventory-summary panel">
      <div><span>TỔNG VẬT PHẨM</span><strong>{hydrated ? totalCopies.toLocaleString("vi-VN") : "—"}<small> bản trong kho</small></strong></div>
      <div><span>BỘ SƯU TẬP HIỆN CÓ</span><strong>{hydrated ? ownedItems.length : "—"}<small> / {COSMETICS.length} mẫu</small></strong></div>
      <div className="inventory-duplicate-summary"><span>BẢN SAO DƯ</span><strong>{hydrated ? (totalCopies - ownedItems.length).toLocaleString("vi-VN") : "—"}<small> bản giữ lại</small></strong></div>
      <Link href="/trade-up" className="secondary-button">Mang đồ đi đổi <ArrowUpRight size={15}/></Link>
    </div>
    <div className="inventory-collection-heading"><div><span className="inventory-eyebrow">BỘ SƯU TẬP CÁ NHÂN</span><h2>Từng món, một dấu ấn.</h2></div><Link href="/clubs">Khám phá bộ CLB <ArrowUpRight size={15}/></Link></div>
    <div className="inventory-search-row">
      <div className="inventory-search"><Search size={18} aria-hidden="true"/><label htmlFor="inventory-search">Tìm trong kho đồ</label><input id="inventory-search" type="search" value={query} placeholder="Tên vật phẩm, CLB hoặc di sản…" onChange={event => { setQuery(event.target.value); setPage(0); }}/>{query ? <button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => { setQuery(""); setPage(0); }}><X size={16}/></button> : null}</div>
      <label className="inventory-sort"><ArrowDownWideNarrow size={17} aria-hidden="true"/><span>Sắp xếp</span><select value={sort} onChange={event => { setSort(event.target.value as InventorySort); setPage(0); }}><option value="rarity">Độ hiếm cao nhất</option><option value="name">Tên A–Z</option><option value="quantity">Nhiều bản nhất</option></select></label>
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
      <label className="inventory-duplicates-filter"><input ref={equippedOnlyControl} type="checkbox" checked={equippedOnly} onChange={event => { setEquippedOnly(event.target.checked); setPage(0); }}/><span>Đang trang bị ({hydrated ? equippedIds.size : "—"})</span></label>
      {hasFilters ? <button type="button" className="inventory-reset" onClick={clear}><RotateCcw size={13}/>Đặt lại bộ lọc</button> : null}
    </div>
    <div className="collection-meta" role="status" aria-live="polite" aria-atomic="true"><span>{hydrated ? visibleItems.length + " mẫu · " + visibleCopies.toLocaleString("vi-VN") + " bản" : "Đang tải kho…"}{hasFilters ? <small> Đang lọc trong {ownedItems.length} mẫu sở hữu</small> : null}<small>{inventoryMessage}</small></span><span>Trang {current + 1} / {pages}</span></div>
    {!hydrated ? <div className="inventory-loading" role="status" aria-label="Đang tải bộ sưu tập"><div className="inventory-grid" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div className="inventory-skeleton" key={index}><div/><span/><span/></div>)}</div></div> : visibleItems.length > 0 ? <>
      <div className="inventory-grid" onFocusCapture={event => { focusedCard.current = (event.target as HTMLElement).closest<HTMLElement>("[data-inventory-item]"); }} onBlurCapture={event => {
        // Chromium blurs a removed control before isConnected becomes false.
        // A null destination is ambiguous: preserve intent until the effect can
        // test removal; real focus moves and outside pointer actions clear it.
        if (event.relatedTarget !== null) focusedCard.current = null;
      }}>{visibleItems.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(item => <CosmeticCard item={item} quantity={quantities.get(item.id)} key={item.id}/>)}</div>
      {pages > 1 && <nav className="club-pagination" aria-label="Phân trang kho đồ"><button className="secondary-button" disabled={current === 0} onClick={() => setPage(current - 1)}>Trang trước</button><span>{current + 1} / {pages}</span><button className="secondary-button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Trang sau</button></nav>}
    </> : <div className="empty-state panel"><SearchX size={28}/><h2>{ownedItems.length ? "Không có đồ khớp bộ lọc" : "Kho đồ đang chờ khám phá"}</h2>
      <p>{ownedItems.length ? (query.trim() ? "Không tìm thấy “" + query.trim() + "” trong bộ lọc hiện tại. Thử tên CLB hoặc xóa bộ lọc." : "Thử CLB, độ hiếm hoặc loại vật phẩm khác.") : "Mở rương để nhận vật phẩm đầu tiên. Mọi bản sao đều được giữ lại trong kho."}</p>
      {ownedItems.length ? <button className="secondary-button" onClick={clear}>Xóa bộ lọc</button> : <Link className="primary-button" href="/chest">Mở rương</Link>}
    </div>}
    <p className="collection-footnote">Mỗi lần nhận đều giữ thêm một bản sao. Dùng đồ Common–Epic để Đổi đồ, 5 Legendary để luyện Mythic, hoặc rao bán bằng XCoin trên chợ. Mythic không làm nguyên liệu; trang bị đồ đã sở hữu để giữ hiệu ứng trên hồ sơ. Vật phẩm concept, không xác nhận tư cách thành viên.</p>
  </section>;
}
