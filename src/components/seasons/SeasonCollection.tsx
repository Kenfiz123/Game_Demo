"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Crown, Gem, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { CLUBS, CLUB_CAMPUSES, CLUB_GROUPS, normalizeClubSearch } from "@/data/clubs";
import { SEASON_AVATARS, SEASON_COSTS, SEASON_MISSIONS } from "@/data/seasonCatalog";
import { useXperience } from "@/hooks/useXperience";
import type { CosmeticItem } from "@/types/gamification";
import type { EconomyCommand } from "@/types/economy";
import styles from "./season.module.css";

const PAGE_SIZE = 9;
const messages: Record<string, string> = {
  ALREADY_CLAIMED: "Bạn đã nhận điểm nhiệm vụ này hôm nay.", EVENT_NOT_READY: "Nhiệm vụ chưa đủ tiến độ. Hãy hoàn thành rồi quay lại.",
  ALREADY_REDEEMED: "Bạn đã đổi mẫu avatar này trong S1.", INSUFFICIENT_SEASON_POINTS: "Điểm mùa chưa đủ. Hoàn thành thêm nhiệm vụ để mở khóa.",
  SEASON_DAY_CHANGED: "Đã sang ngày mới theo giờ Việt Nam. Tiến độ vừa được cập nhật; hãy kiểm tra và nhận lại.",
  BUSY: "Chờ lượt chơi hiện tại kết thúc rồi thử lại.", NOT_READY: "Đang kết nối dữ liệu. Vui lòng thử lại sau.",
};

function RedeemDialog({ item, pending, canRedeem, onRedeem, onClose }: { item: CosmeticItem; pending: boolean; canRedeem: boolean; onRedeem: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => { node?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  const cost = SEASON_COSTS[item.rarity as keyof typeof SEASON_COSTS];
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="season-redeem-heading" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <button type="button" className={styles.close} disabled={pending} onClick={onClose} aria-label="Đóng xem avatar" autoFocus><X size={20}/></button>
    <Image src={item.image!} alt={item.name} width={280} height={280} sizes="280px"/>
    <span className={styles.eyebrow}>AVATAR MÙA S1</span><h2 id="season-redeem-heading">{item.name}</h2>
    <p>Dùng <strong>{cost} điểm S1</strong> để nhận avatar này vào kho. Mỗi mẫu đổi một lần trong mùa; bạn có thể trang bị ngay sau khi nhận.</p>
    <button type="button" className={styles.primary} disabled={!canRedeem || pending} onClick={onRedeem}>{pending ? "Đang nhận avatar…" : `Xác nhận đổi · ${cost} điểm S1`}<ArrowRight size={16}/></button>
    <button type="button" className={styles.textButton} disabled={pending} onClick={onClose}>Quay lại bộ sưu tập</button>
  </dialog>;
}

export function SeasonCollection() {
  const { playerId } = useXperience();
  return <SeasonContent key={playerId ?? "connecting"}/>;
}
function SeasonContent() {
  const { season, state, economy, hydrated, isPlaying, economyAction, retryBackend, equipItem, collector } = useXperience();
  const [query, setQuery] = useState(""), [campus, setCampus] = useState(""), [group, setGroup] = useState("");
  const [page, setPage] = useState(0), [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<CosmeticItem | null>(null), [message, setMessage] = useState(""), [error, setError] = useState(false);
  const flight = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const owned = useMemo(() => new Set(state.ownedItemIds), [state.ownedItemIds]);
  const discovered = useMemo(() => new Set(collector.discoveredItemIds), [collector.discoveredItemIds]);
  const redeemed = new Set(season.redeemedItemIds);
  const collected = SEASON_AVATARS.filter(item => discovered.has(item.id)).length;
  const filtered = useMemo(() => {
    const terms = normalizeClubSearch(query).trim().split(/\s+/).filter(Boolean);
    return CLUBS.filter(club => (!campus || club.campus === campus) && (!group || club.group === group) && terms.every(term => normalizeClubSearch(`${club.name} ${club.shortName} ${club.campus}`).includes(term)));
  }, [query, campus, group]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pageCount - 1);
  const busy = !hydrated || isPlaying || pending !== null;
  async function act(command: EconomyCommand, key: string) {
    if (flight.current || busy) return;
    flight.current = true; setPending(key); setMessage("");
    try {
      const result = await economyAction(command);
      if (!mounted.current) return;
      setError(!result.success);
      setMessage(result.success ? command.type === "claim-season-mission" ? `Đã nhận ${result.pointsAwarded} điểm S1.` : "Avatar S1 đã vào kho. Bạn có thể trang bị ngay." : messages[result.reason ?? ""] ?? "Chưa xác nhận được thao tác. Cập nhật dữ liệu rồi thử lại.");
      if (command.type === "redeem-season-avatar") setSelected(null);
    } catch { if (mounted.current) { setError(true); setMessage("Chưa xác nhận được kết quả. Cập nhật dữ liệu để kiểm tra kho và điểm mùa."); setSelected(null); } }
    finally { flight.current = false; if (mounted.current) setPending(null); }
  }
  async function equip(item: CosmeticItem) {
    if (flight.current || busy) return;
    flight.current = true; setPending(item.id); setMessage("");
    try {
      const ok = await equipItem(item.id);
      if (mounted.current) { setError(!ok); setMessage(ok ? "Đã trang bị avatar S1 lên hồ sơ." : "Chưa lưu được trang bị. Cập nhật dữ liệu rồi thử lại."); }
    } catch { if (mounted.current) { setError(true); setMessage("Chưa xác nhận được trang bị. Cập nhật dữ liệu để kiểm tra."); } }
    finally { flight.current = false; if (mounted.current) setPending(null); }
  }
  return <div className={`page-wrap ${styles.page}`}>
    <section className={styles.hero} aria-labelledby="season-title">
      <div className={styles.heroCopy}><span className={styles.eyebrow}><Sparkles size={14}/> MÙA SƯU TẦM · SEASON 01</span><h1 id="season-title">Mùa đầu tiên.<br/><em>Dấu ấn của bạn.</em></h1><p>73 cộng đồng. Hai bậc avatar độc bản. Hoàn thành nhiệm vụ, tích điểm S1 và chọn dấu ấn của CLB bạn yêu thích.</p><a className={styles.primary} href="#season-catalog">Khám phá 146 avatar <ArrowRight size={16}/></a><div className={styles.heroFacts}><span><Crown size={15}/> Huyền thoại · Hoàng Kim</span><span><Gem size={15}/> Thần thoại · Tinh Tú</span></div></div>
      <div className={styles.heroArt} aria-hidden="true"><div className={styles.orbit}/><Image className={styles.heroGold} src="/assets/seasons/s1/legendary/street-workout-hn.webp" alt="" width={300} height={300} sizes="(max-width: 700px) 160px, 250px" priority/><Image className={styles.heroCrystal} src="/assets/seasons/s1/mythic/street-workout-hn.webp" alt="" width={360} height={360} sizes="(max-width: 700px) 210px, 330px" priority/><span>THE FIRST COLLECTION</span></div>
    </section>
    <div className={styles.summary}><div><span>Điểm mùa của bạn</span><strong>{hydrated ? season.points : "—"}<small> S1</small></strong></div><div><span>Tổng điểm đã kiếm</span><strong>{hydrated ? season.earnedPoints : "—"}</strong></div><div><span>Avatar từng khám phá</span><strong>{hydrated ? collected : "—"}<small> / 146</small></strong></div><Link href="/inventory">Mở kho avatar <ArrowRight size={16}/></Link></div>
    <section className={styles.missions} aria-labelledby="season-missions-title">
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>HÀNH TRÌNH MỖI NGÀY</span><h2 id="season-missions-title">Từng bước, thêm một dấu ấn.</h2><p>Tối đa 8 điểm S1 mỗi ngày. Nhiệm vụ làm mới lúc 00:00 giờ Việt Nam; điểm đã tích giữ nguyên.</p></div><button type="button" className={styles.refresh} disabled={busy} onClick={() => { setMessage(""); void retryBackend(); }}><RefreshCw size={15}/> Cập nhật</button></div>
      <div className={styles.missionGrid}>{SEASON_MISSIONS.map(mission => {
        const progress = mission.metric === "visit" ? hydrated ? 1 : 0 : economy.progress[mission.metric];
        const claimed = season.claimedMissionIds.includes(mission.id), complete = progress >= mission.target;
        return <article key={mission.id} className={styles.mission}><span className={styles.reward}>+{mission.points}<small> điểm S1</small></span><h3>{mission.name}</h3><p>{mission.description}</p><div className={styles.progress}><progress max={mission.target} value={Math.min(progress, mission.target)} aria-label={`Tiến độ ${mission.name}`}/><span>{hydrated ? Math.min(progress, mission.target) : "—"}/{mission.target}</span></div><button type="button" disabled={busy || claimed || !complete} onClick={() => void act({ type: "claim-season-mission", missionId: mission.id, day: season.day }, mission.id)}>{claimed ? <><Check size={14}/> Đã nhận</> : pending === mission.id ? "Đang nhận…" : "Nhận điểm S1"}</button>{!complete && <Link href={mission.href}>Đi làm nhiệm vụ <ArrowRight size={13}/></Link>}</article>;
      })}</div><p className={styles.day}>Ngày nhiệm vụ: {hydrated ? season.day : "đang tải…"} · Điểm S1 dùng riêng cho mùa sưu tầm.</p>
    </section>
    <p className={styles.notice} data-error={error} role="status" aria-live="polite">{message}</p>
    <section id="season-catalog" aria-labelledby="season-catalog-title">
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>BỘ AVATAR MÙA 01</span><h2 id="season-catalog-title">Chọn cộng đồng. Giữ dấu ấn.</h2><p>Huyền thoại: 4 điểm S1 · Thần thoại: 12 điểm S1. Mỗi mẫu đổi một lần; phần thưởng thuộc kho lâu dài.</p></div><span className={styles.catalogCount}>{filtered.length} CLB</span></div>
      <div className={styles.filters}><label className={styles.search}><Search size={16}/><span className={styles.srOnly}>Tìm CLB</span><input value={query} placeholder="Tìm tên CLB…" onChange={event => { setQuery(event.target.value); setPage(0); }}/></label><label><span className={styles.srOnly}>Cơ sở</span><select value={campus} onChange={event => { setCampus(event.target.value); setPage(0); }}><option value="">Tất cả cơ sở</option>{CLUB_CAMPUSES.map(value => <option key={value}>{value}</option>)}</select></label><label><span className={styles.srOnly}>Nhóm hoạt động</span><select value={group} onChange={event => { setGroup(event.target.value); setPage(0); }}><option value="">Tất cả nhóm</option>{CLUB_GROUPS.map(value => <option key={value}>{value}</option>)}</select></label></div>
      {filtered.length ? <div className={styles.catalog}>{filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(club => <article className={styles.club} key={club.id}><header><span>{club.campus} · {club.group}</span><h3>{club.shortName}</h3></header><div className={styles.pair}>{(["LEGENDARY", "MYTHIC"] as const).map(rarity => {
        const item = SEASON_AVATARS.find(avatar => avatar.clubId === club.id && avatar.rarity === rarity)!;
        const cost = SEASON_COSTS[rarity], received = redeemed.has(item.id), have = owned.has(item.id), equipped = state.equipped.AVATAR === item.id;
        return <div key={item.id} className={styles.avatar} data-tier={rarity}><Image src={item.image!} alt={`${rarity === "LEGENDARY" ? "Huyền thoại" : "Thần thoại"} S1 · ${club.shortName}`} width={256} height={256} sizes="(max-width: 600px) 38vw, (max-width: 1100px) 18vw, 170px"/><span className={styles.tier}>{rarity === "LEGENDARY" ? "Huyền thoại" : "Thần thoại"}</span><small>{rarity === "LEGENDARY" ? "Hoàng Kim" : "Tinh Tú"} · S1</small><button type="button" aria-label={`${have ? "Trang bị" : "Xem và đổi"} ${item.name}`} disabled={busy || equipped || received && !have} onClick={() => have ? void equip(item) : setSelected(item)}>{pending === item.id ? "Đang lưu…" : equipped ? "Đang trang bị" : have ? "Trang bị" : received ? "Đã đổi trong mùa" : <>{cost} điểm S1 <ArrowRight size={12}/></>}</button>{!received && !have && hydrated && season.points < cost && <span className={styles.remaining}>Còn thiếu {cost - season.points} điểm</span>}</div>;
      })}</div></article>)}</div> : <div className={styles.empty}><Search size={24}/><h3>Chưa có CLB khớp tìm kiếm</h3><button type="button" onClick={() => { setQuery(""); setCampus(""); setGroup(""); setPage(0); }}>Xóa bộ lọc</button></div>}
      <nav className={styles.pagination} aria-label="Phân trang avatar S1"><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Trang trước</button><span>{current + 1} / {pageCount}</span><button type="button" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Trang sau</button></nav>
      <p className={styles.footnote}>S1 ghi nhận riêng với bộ CLB thường. Avatar đã nhận giữ trong kho khi nhiệm vụ sang ngày mới. Mỗi bản có serial, có thể khóa để bảo vệ và trang bị trên hồ sơ. Artwork concept dành cho game.</p>
    </section>
    {selected && <RedeemDialog key={selected.id} item={selected} pending={pending !== null} canRedeem={hydrated && !isPlaying && !redeemed.has(selected.id) && season.points >= SEASON_COSTS[selected.rarity as keyof typeof SEASON_COSTS]} onClose={() => setSelected(null)} onRedeem={() => void act({ type: "redeem-season-avatar", itemId: selected.id }, selected.id)}/>}
  </div>;
}
