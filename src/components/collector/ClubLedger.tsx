"use client";
import { useDeferredValue, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, BookOpen, Search, Medal } from "lucide-react";
import { useXperience } from "@/hooks/useXperience";
import { CLUB_CAMPUSES, CLUB_GROUPS } from "@/data/clubs";
import { getMythicImage } from "@/data/mythicCatalog";
import { deriveClubCollection, filterClubCollection, type ClubCollectionProgress, type CollectorFilters } from "@/lib/collectorCatalog";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import "./collector.css";

export function ClubCompletionBadge({ row }: { row: ClubCollectionProgress }) {
  return row.complete ? <span className="collector-complete-badge"><Medal size={14} aria-hidden="true"/>Bộ hoàn chỉnh</span> : null;
}
const PAGE_SIZE = 12;
const DEFAULT_FILTERS: CollectorFilters = { query: "", group: "", campus: "", completion: "all" };

export function ClubLedger() {
  const { collector, state, hydrated } = useXperience();
  const [filters, setFilters] = useState<CollectorFilters>(DEFAULT_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState("");
  const rows = useMemo(() => deriveClubCollection(collector.discoveredItemIds, state.ownedItemIds), [collector.discoveredItemIds, state.ownedItemIds]);
  const visible = useMemo(() => filterClubCollection(rows, { ...filters, query: deferredQuery }), [rows, filters, deferredQuery]);
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
  const reset = () => { setFilters(DEFAULT_FILTERS); setPage(0); setExpanded(""); };
  return <div className="collector-page collector-ledger">
    <header className="collector-ledger-heading"><div><BookOpen size={28}/><h1>Sổ bộ sưu tập CLB</h1><p>Mỗi cộng đồng, một bộ dấu ấn. Ghi lại mọi mẫu từng khám phá, kể cả khi bạn đã bán hoặc dùng bản sao để đổi đồ.</p></div><Link className="secondary-button" href="/profile">Phòng trưng bày của tôi</Link></header>
    <div className="collector-ledger-summary"><p><strong>{hydrated ? found : "—"}</strong> / {total} mẫu đã khám phá</p><p><strong>{hydrated ? complete : "—"}</strong> / {rows.length} bộ CLB hoàn chỉnh</p><span>13 dấu ấn mỗi CLB · 8 Mythic riêng biệt</span></div>
    <form className="collector-ledger-filters" role="search" onSubmit={event => event.preventDefault()}><label className="collector-search"><span><Search size={15}/>Tìm CLB</span><input type="search" value={filters.query} placeholder="Tên CLB, lĩnh vực…" onChange={event => change("query", event.target.value)}/></label><label>Nhóm hoạt động<select value={filters.group} onChange={event => change("group", event.target.value)}><option value="">Tất cả nhóm</option>{CLUB_GROUPS.map(group => <option key={group} value={group}>{group}</option>)}</select></label><label>Cơ sở<select value={filters.campus} onChange={event => change("campus", event.target.value)}><option value="">Tất cả cơ sở</option>{CLUB_CAMPUSES.map(campus => <option key={campus} value={campus}>{campus}</option>)}</select></label><label>Tiến độ<select value={filters.completion} onChange={event => change("completion", event.target.value as CollectorFilters["completion"])}><option value="all">Tất cả bộ</option><option value="complete">Đã hoàn chỉnh</option><option value="incomplete">Chưa hoàn chỉnh</option></select></label></form>
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
        {isOpen ? <div id={detailId} className="collector-club-detail"><div className="collector-section-heading"><h2>{row.club.name}</h2><span>{row.mythicsDiscovered} / 8 Mythic từng khám phá</span></div><div className="collector-slot-grid">{row.items.map(item => {
          const discovered = discoveries.has(item.id), quantity = quantities.get(item.id) ?? 0;
          return <div key={item.id} className={"collector-slot" + (discovered ? " is-discovered" : "")}><div className="collector-slot-art"><CosmeticArt item={item} compact animated={false}/></div><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><p>{discovered ? (quantity ? `${quantity} bản trong kho` : "Đã khám phá · không còn trong kho") : "Chưa khám phá"}</p></div>;
        })}</div>{row.complete ? <p className="collector-note">Huy hiệu “Bộ hoàn chỉnh” đã được ghi nhận trong sổ. Đây là dấu mốc sưu tầm, không cấp EX, XCoin hay lợi thế tỷ lệ.</p> : <p className="collector-note">Còn {row.items.length - row.discovered} mẫu để hoàn chỉnh bộ này. Xem trước không cấp vật phẩm.</p>}<Link href="/chest" className="secondary-button">Khám phá rương</Link></div> : null}
      </article>;
    })}</div> : <div className="collector-empty-stage"><h2>Không có bộ CLB khớp bộ lọc</h2><p>Thử một cơ sở, lĩnh vực hoặc tiến độ khác.</p><button type="button" className="secondary-button" onClick={reset}>Xóa bộ lọc</button></div>}
    {hydrated && pages > 1 ? <nav className="collector-pagination" aria-label="Phân trang sổ CLB"><button className="secondary-button" disabled={current === 0} onClick={() => { setPage(current - 1); setExpanded(""); }}>Trang trước</button><span>{current + 1} / {pages}</span><button className="secondary-button" disabled={current + 1 >= pages} onClick={() => { setPage(current + 1); setExpanded(""); }}>Trang sau</button></nav> : null}
    <p className="collector-note">“Đã khám phá” tính theo mẫu duy nhất trong lịch sử; “đang có” tính vật phẩm hiện còn trong kho. Bản sao không làm tăng tiến độ. Các biểu trưng là concept trong game, không chứng nhận tư cách thành viên CLB.</p>
  </div>;
}
