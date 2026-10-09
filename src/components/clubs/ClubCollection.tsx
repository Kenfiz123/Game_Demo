"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Check, Search } from "lucide-react";
import { CLUBS, CLUB_GROUPS, CLUB_CAMPUSES, normalizeClubSearch, type Club } from "@/data/clubs";
import { getCosmeticById, cosmeticsByRarity } from "@/data/cosmetics";
import { getRarityConfig } from "@/data/chestConfig";
import { CosmeticCard } from "@/components/inventory/CosmeticCard";
import { TestCredits } from "@/components/arcade/TestCredits";
import { CLUB_REWARD_TIERS, getClubMythics } from "@/data/clubCosmetics";
import { MYTHIC_VARIANTS } from "@/data/mythicCatalog";
import { MythicSpotlight } from "./MythicSpotlight";
import { useXperience } from "@/hooks/useXperience";
const PAGE_SIZE = 12;
const indexed = CLUBS.map(club => {
  const mythicNames = getClubMythics(club.id).map(item => item.name + " " + (item.heritage ?? "")).join(" ");
  const search = normalizeClubSearch(club.name + " " + club.shortName + " " + club.title + " " + club.campus + " " + mythicNames);
  return {club, search, compact:search.replace(/[\s-]+/g, "")};
});
const lowerTiers = CLUB_REWARD_TIERS.filter(tier => tier.rarity !== "MYTHIC");
const lowerSuffixes = lowerTiers.map(tier => tier.suffix);
const suffixes = [...lowerSuffixes, ...MYTHIC_VARIANTS.map(variant => variant.suffix)];
const exactChance = (chance: number) => chance > 0 && chance < .000001 ? "< 0,000001" : chance.toLocaleString("vi-VN", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
export function ClubCollection() {
  const { state, hydrated } = useXperience();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [campus, setCampus] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Club | null>(null);
  const details = useRef<HTMLElement>(null);
  const browser = useRef<HTMLElement>(null);
  const owned = useMemo(() => new Set(state.ownedItemIds), [state.ownedItemIds]);
  const filtered = useMemo(() => {
    const term = normalizeClubSearch(query.trim());
    const compactTerm = term.replace(/[\s-]+/g, "");
    return indexed.filter(({club,search,compact}) => (!term || search.includes(term) || compact.includes(compactTerm)) &&
      (!group || club.group === group) && (!campus || club.campus.includes(campus))).map(entry => entry.club);
  }, [query, group, campus]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const clear = () => { setQuery(""); setGroup(""); setCampus(""); setPage(0); };
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    requestAnimationFrame(() => browser.current?.scrollIntoView({block:"start",behavior:"instant"}));
  };
  return <>
    <TestCredits/>
    <section className="club-browser" ref={browser} aria-label="Danh sách bộ vật phẩm CLB">
      <div className="club-filters">
        <label className="club-search"><Search size={17}/><span className="sr-only">Tìm CLB hoặc danh hiệu</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Tìm CLB hoặc danh hiệu…"/></label>
        <label><span>Nhóm hoạt động</span><select value={group} onChange={event => { setGroup(event.target.value); setPage(0); }}><option value="">Tất cả nhóm</option>{CLUB_GROUPS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Campus</span><select value={campus} onChange={event => { setCampus(event.target.value); setPage(0); }}><option value="">Tất cả campus</option>{CLUB_CAMPUSES.map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="collection-meta"><span role="status">{filtered.length} / {CLUBS.length} CLB · Trang {current + 1}/{pages}</span><span>{suffixes.length} vật phẩm / CLB · {MYTHIC_VARIANTS.length} Mythic độc lập</span></div>
      {selected && <section className="club-detail panel" ref={details} aria-label={"Bộ vật phẩm " + selected.shortName}>
        <div className="club-detail-heading"><div><p>{selected.group} / {selected.campus}</p><h2>{selected.name}</h2></div><button className="text-button" onClick={() => setSelected(null)}>Đóng bộ vật phẩm</button></div>
        <MythicSpotlight key={selected.id} items={getClubMythics(selected.id)} ownedItemIds={hydrated ? state.ownedItemIds : undefined} rarityChance={state.settings.chestOdds.MYTHIC} chance={state.settings.chestOdds.MYTHIC / cosmeticsByRarity("MYTHIC").length}/>
        <div className="royal-lower-heading"><h3>Bộ nhận diện nền tảng</h3><p>5 vật phẩm riêng, từ Common đến Legendary. Mythic là bộ bảo vật hoàn toàn mới ở phía trên.</p></div>
        <div className="club-tier-legend" aria-label="Sáu bậc hiếm">{CLUB_REWARD_TIERS.map(tier => <span key={tier.rarity} style={{"--tier-color":getRarityConfig(tier.rarity).color} as CSSProperties}><i/>{getRarityConfig(tier.rarity).label}</span>)}</div>
        <div className="club-detail-grid royal-lower-grid">{lowerSuffixes.map(suffix => {
          const item = getCosmeticById("club-" + selected.id + "-" + suffix)!;
          const chance = state.settings.chestOdds[item.rarity] / cosmeticsByRarity(item.rarity).length;
          return <div key={item.id}><CosmeticCard item={item}/><p className="club-item-note">{hydrated && owned.has(item.id) ? <><Check size={13}/> Đã sở hữu</> : "Chưa sở hữu"}<span>{exactChance(chance)}% / rương</span></p></div>;
        })}</div><Link href="/chest" className="primary-button">Mở rương để khám phá <ArrowRight size={15}/></Link>
      </section>}
      {visible.length ? <div className="clubs-grid">{visible.map(club => {
        const collected = suffixes.filter(suffix => owned.has("club-" + club.id + "-" + suffix)).length;
        return <article className="club-card" key={club.id} style={{"--club-color":club.color} as CSSProperties}>
          <div className="club-card-art"><Image src={club.image} alt={"Biểu trưng concept " + club.shortName} width={150} height={150} sizes="150px"/><div className="club-mini-avatar"><Image src={club.image} alt={"Avatar " + club.shortName} width={60} height={60} sizes="60px"/></div><span>{hydrated ? collected : "—"}/{suffixes.length}</span></div>
          <div className="club-card-body"><p>{club.campus}</p><h2>{club.shortName}</h2><small>{club.group}</small><div className="club-title-preview">{club.title}</div>
            <div className="club-tier-strip" aria-hidden="true">{CLUB_REWARD_TIERS.map(tier => <span key={tier.rarity} title={getRarityConfig(tier.rarity).label} style={{background:getRarityConfig(tier.rarity).color}}/>)}<small>COMMON → MYTHIC</small></div>
            <button className="club-detail-button" aria-expanded={selected?.id === club.id} onClick={() => {
              setSelected(club);
              requestAnimationFrame(() => details.current?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"}));
            }}>Xem {suffixes.length} vật phẩm <ArrowRight size={14}/></button>
          </div></article>;
      })}</div> : <div className="empty-state panel"><Search size={24}/><h2>Chưa tìm thấy CLB phù hợp</h2><p>Thử tên viết tắt, tên không dấu hoặc một nhóm khác.</p><button className="secondary-button" onClick={clear}>Xóa bộ lọc</button></div>}
      {pages > 1 && <nav className="club-pagination" aria-label="Phân trang CLB"><button className="secondary-button" disabled={current === 0} onClick={() => changePage(current - 1)}><ArrowLeft size={14}/> Trang trước</button><span>{current + 1} / {pages}</span><button className="secondary-button" disabled={current + 1 >= pages} onClick={() => changePage(current + 1)}>Trang sau <ArrowRight size={14}/></button></nav>}
    </section>
    <p className="club-concept-note">Bộ nhận diện concept cho FPTU Xperience, không phải logo chính thức hoặc chứng nhận tư cách thành viên. Tên CLB, campus và nhóm lấy từ danh sách bạn cung cấp. Unicamp và Color Team dùng biểu trưng trung tính vì nguồn chưa phân loại rõ.</p>
  </>;
}
