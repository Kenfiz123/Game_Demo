"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, BookOpen, Search, Medal, Star, Store } from "lucide-react";
import { useXperience } from "@/hooks/useXperience";
import { CLUB_CAMPUSES, CLUB_GROUPS } from "@/data/clubs";
import { getMythicImage } from "@/data/mythicCatalog";
import { deriveClubCollection, filterClubCollection, type ClubCollectionProgress, type CollectorFilters } from "@/lib/collectorCatalog";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import { getCosmeticById } from "@/data/cosmetics";
import type { CosmeticItem } from "@/types/gamification";
import "./collector.css";

export function ClubCompletionBadge({ row }: { row: ClubCollectionProgress }) {
  return row.complete ? <span className="collector-complete-badge"><Medal size={14} aria-hidden="true"/>Bộ hoàn chỉnh</span> : null;
}
const PAGE_SIZE = 12;
const DEFAULT_FILTERS: CollectorFilters = { query: "", group: "", campus: "", completion: "all" };

export function LedgerItemActions({ item, wished, disabled, onToggle }: { item: CosmeticItem; wished: boolean; disabled: boolean; onToggle: () => void }) {
  return <div className="collector-slot-actions"><button type="button" className="collector-wishlist-button" aria-label={`${wished ? "Bỏ khỏi" : "Thêm vào"} wishlist: ${item.name}`} aria-pressed={wished} disabled={disabled} onClick={onToggle}><Star size={14} fill={wished ? "currentColor" : "none"} aria-hidden="true"/><span>{wished ? "Đang săn" : "Muốn sưu tầm"}</span></button><Link href={`/market?itemId=${encodeURIComponent(item.id)}`}><Store size={13} aria-hidden="true"/>Tìm trên chợ</Link></div>;
}

export function ClubLedger() {
  const { playerId } = useXperience();
  return <ClubLedgerSession key={playerId ?? "connecting"}/>;
}

function ClubLedgerSession() {
  const { collector, state, hydrated, isPlaying, setWishlist } = useXperience();
  const [filters, setFilters] = useState<CollectorFilters>(DEFAULT_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState("");
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [wishPending, setWishPending] = useState("");
  const [wishMessage, setWishMessage] = useState("");
  const [wishError, setWishError] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const wishlist = useMemo(() => new Set((collector.wishlistItemIds ?? []).filter(id => getCosmeticById(id))), [collector.wishlistItemIds]);
  const rows = useMemo(() => deriveClubCollection(collector.discoveredItemIds, state.ownedItemIds), [collector.discoveredItemIds, state.ownedItemIds]);
  const visible = useMemo(() => filterClubCollection(rows, { ...filters, query: deferredQuery }).filter(row => !wishlistOnly || row.items.some(item => wishlist.has(item.id))), [rows, filters, deferredQuery, wishlistOnly, wishlist]);
  const discoveries = useMemo(() => new Set(collector.discoveredItemIds), [collector.discoveredItemIds]);
  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of state.ownedItemIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [state.ownedItemIds]);
  const complete = rows.filter(row => row.complete).length;
  const found = rows.reduce((sum, row) => sum + row.discovered, 0);
  const total = rows.reduce((sum, row) => sum + row.items.length, 0);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const change = <K extends keyof CollectorFilters>(key: K, value: CollectorFilters[K]) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(0); setExpanded(""); };
  const reset = () => { setFilters(DEFAULT_FILTERS); setWishlistOnly(false); setPage(0); setExpanded(""); };
  const toggleWish = async (item: CosmeticItem) => {
    if (inFlight.current || !hydrated || isPlaying) return;
    const wished = wishlist.has(item.id);
    if (!wished && wishlist.size >= 200) { setWishError(true); setWishMessage("Wishlist đã đủ 200 món. Bỏ một món trước khi thêm mục tiêu mới."); return; }
    inFlight.current = true; setWishPending(item.id); setWishMessage("");
    try {
      const saved = await setWishlist(item.id, !wished);
      if (!mounted.current) return;
      setWishError(!saved);
      setWishMessage(saved ? `${wished ? "Đã bỏ khỏi" : "Đã thêm vào"} wishlist: ${item.name}.` : "Chưa lưu được wishlist. Hãy kiểm tra kết nối và thử lại.");
    } catch { if (mounted.current) { setWishError(true); setWishMessage("Chưa lưu được wishlist. Hãy kiểm tra kết nối và thử lại."); } }
    finally { inFlight.current = false; if (mounted.current) setWishPending(""); }
  };
  return <div className="collector-page collector-ledger">
    <header className="collector-ledger-heading"><div><BookOpen size={28}/><h1>Sổ bộ sưu tập CLB</h1><p>Mỗi cộng đồng, một bộ dấu ấn. Ghi lại mọi mẫu từng khám phá, kể cả khi bạn đã bán hoặc dùng bản sao để đổi đồ.</p></div><Link className="secondary-button" href="/profile">Phòng trưng bày của tôi</Link></header>
    <div className="collector-ledger-summary"><p><strong>{hydrated ? found : "—"}</strong> / {total} mẫu đã khám phá</p><p><strong>{hydrated ? complete : "—"}</strong> / {rows.length} bộ CLB hoàn chỉnh</p><span>13 dấu ấn mỗi CLB · 8 Mythic riêng biệt</span></div>
    <form className="collector-ledger-filters" role="search" onSubmit={event => event.preventDefault()}><label className="collector-search"><span><Search size={15}/>Tìm CLB</span><input type="search" value={filters.query} placeholder="Tên CLB, lĩnh vực…" onChange={event => change("query", event.target.value)}/></label><label>Nhóm hoạt động<select value={filters.group} onChange={event => change("group", event.target.value)}><option value="">Tất cả nhóm</option>{CLUB_GROUPS.map(group => <option key={group} value={group}>{group}</option>)}</select></label><label>Cơ sở<select value={filters.campus} onChange={event => change("campus", event.target.value)}><option value="">Tất cả cơ sở</option>{CLUB_CAMPUSES.map(campus => <option key={campus} value={campus}>{campus}</option>)}</select></label><label>Tiến độ<select value={filters.completion} onChange={event => change("completion", event.target.value as CollectorFilters["completion"])}><option value="all">Tất cả bộ</option><option value="complete">Đã hoàn chỉnh</option><option value="incomplete">Chưa hoàn chỉnh</option></select></label></form>
    <div className="collector-wishlist-controls"><label><input type="checkbox" checked={wishlistOnly} disabled={!hydrated} onChange={event => { setWishlistOnly(event.target.checked); setPage(0); setExpanded(""); }}/><Star size={14} aria-hidden="true"/><span>Chỉ hiện wishlist ({hydrated ? wishlist.size : "—"}/200)</span></label><Link href="/market?wishlistOnly=true">Tìm wishlist trên chợ</Link><span>Mục tiêu sưu tầm không làm thay đổi tỷ lệ mở rương.</span></div>
    <p className={"collector-wishlist-status" + (wishError ? " is-error" : "")} role={wishError ? "alert" : "status"} aria-live="polite">{wishPending ? "Đang lưu wishlist…" : wishMessage}</p>
    <p className="collector-result-count" role="status" aria-live="polite">{hydrated ? `${visible.length} CLB · Trang ${current + 1} / ${pages}` : "Đang tải tiến độ sưu tầm…"}</p>
    {!hydrated ? <div className="collector-loading" role="status">Đang tải sổ bộ sưu tập…</div> : visible.length ? <div className="collector-ledger-list">{visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(row => {
      const isOpen = expanded === row.club.id;
      const detailId = `club-ledger-${row.club.id}`;
      return <article className={"collector-club-entry" + (isOpen ? " is-open" : "")} key={row.club.id}>
        <button type="button" className="collector-club-cover" aria-expanded={isOpen} aria-controls={detailId} onClick={() => setExpanded(isOpen ? "" : row.club.id)}>
          <Image src={getMythicImage(row.club)} alt="" width={128} height={128} sizes="80px"/>
          <span className="collector-club-identity"><strong>{row.club.shortName}</strong><span>{row.club.campus} · {row.club.group}</span><ClubCompletionBadge row={row}/></span>
          <span className="collector-club-progress"><strong>{row.discovered} <small>/ {row.items.length}</small></strong><span>đã khám phá</span><progress aria-label={`Tiến độ ${row.club.shortName}`} value={row.discovered} max={row.items.length}/><small>{row.owned} mẫu đang có · {row.ownedCopies} bản</small></span><ChevronDown size={18} aria-hidden="true"/>
        </button>
        {isOpen ? <div id={detailId} className="collector-club-detail"><div className="collector-section-heading"><h2>{row.club.name}</h2><span>{row.mythicsDiscovered} / 8 Mythic từng khám phá</span></div><div className="collector-slot-grid">{row.items.filter(item => !wishlistOnly || wishlist.has(item.id)).map(item => {
          const discovered = discoveries.has(item.id), quantity = quantities.get(item.id) ?? 0;
          return <div key={item.id} className={"collector-slot" + (discovered ? " is-discovered" : "")}><div className="collector-slot-art"><CosmeticArt item={item} compact animated={false}/></div><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><p>{discovered ? (quantity ? `${quantity} bản trong kho` : "Đã khám phá · không còn trong kho") : "Chưa khám phá"}</p><LedgerItemActions item={item} wished={wishlist.has(item.id)} disabled={!hydrated || isPlaying || Boolean(wishPending) || (!wishlist.has(item.id) && wishlist.size >= 200)} onToggle={() => void toggleWish(item)}/></div>;
        })}</div>{row.complete ? <p className="collector-note">Huy hiệu “Bộ hoàn chỉnh” đã được ghi nhận trong sổ. Đây là dấu mốc sưu tầm, không cấp EX, XCoin hay lợi thế tỷ lệ.</p> : <p className="collector-note">Còn {row.items.length - row.discovered} mẫu để hoàn chỉnh bộ này. Xem trước không cấp vật phẩm.</p>}<Link href="/chest" className="secondary-button">Khám phá rương</Link></div> : null}
      </article>;
    })}</div> : <div className="collector-empty-stage"><h2>Không có bộ CLB khớp bộ lọc</h2><p>Thử một cơ sở, lĩnh vực hoặc tiến độ khác.</p><button type="button" className="secondary-button" onClick={reset}>Xóa bộ lọc</button></div>}
    {hydrated && pages > 1 ? <nav className="collector-pagination" aria-label="Phân trang sổ CLB"><button className="secondary-button" disabled={current === 0} onClick={() => { setPage(current - 1); setExpanded(""); }}>Trang trước</button><span>{current + 1} / {pages}</span><button className="secondary-button" disabled={current + 1 >= pages} onClick={() => { setPage(current + 1); setExpanded(""); }}>Trang sau</button></nav> : null}
    <p className="collector-note">“Đã khám phá” tính theo mẫu duy nhất trong lịch sử; “đang có” tính vật phẩm hiện còn trong kho. Bản sao không làm tăng tiến độ. Các biểu trưng là concept trong game, không chứng nhận tư cách thành viên CLB.</p>
  </div>;
}
