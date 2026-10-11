"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowLeft, ArrowRight, Box, Layers3, Orbit, Plus, Search, Settings2, ShieldCheck, X } from "lucide-react";
import { COSMETICS, cosmeticsByRarity, getCosmeticById } from "@/data/cosmetics";
import { getRarityConfig } from "@/data/chestConfig";
import { normalizeClubSearch } from "@/data/clubs";
import { TRADE_UP_ITEM_COUNT, TRADE_UP_PATHS } from "@/data/economyConfig";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import { useXperience } from "@/hooks/useXperience";
import type { TradeInputRarity, TradeUpSuccess } from "@/types/gamification";

const PAGE_SIZE = 12;
const indexed = COSMETICS.map(item => ({ item, search: normalizeClubSearch(item.name + " " + item.description).replace(/[\s-]+/g, "") }));
function countCopies(ids: readonly string[]) {
  const result = new Map<string, number>();
  for (const id of ids) result.set(id, (result.get(id) ?? 0) + 1);
  return result;
}
const errors = {
  INVALID_SELECTION: "Chọn đúng 5 món cùng bậc để đổi.",
  INSUFFICIENT_ITEMS: "Kho đã thay đổi. Một số bản sao đã được sử dụng; hãy chọn lại.",
  UNSUPPORTED_RARITY: "Bàn này chỉ nhận Common đến Epic. Đổi Legendary tại Lò Thần Thoại.",
  INVALID_SETTINGS: "Tỷ lệ chưa hợp lệ. Hãy kiểm tra trang Tỷ lệ.",
  BUSY: "Một lượt chơi khác đang xử lý. Hãy đợi hoàn tất.",
  NOT_READY: "Kho đang tải. Vui lòng thử lại.",
  STORAGE_UNAVAILABLE: "Chưa xác nhận được kết quả từ backend. Kết nối lại và kiểm tra Lịch sử trước khi đổi tiếp; lượt vừa gửi có thể đã được lưu.",
};

export function TradeUpGame() {
  const { state, hydrated, isPlaying, tradeUp, completeOpening } = useXperience();
  const [rarity, setRarity] = useState<TradeInputRarity>("COMMON");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "forging" | "result">("idle");
  const [result, setResult] = useState<TradeUpSuccess | null>(null);
  const [error, setError] = useState("");
  const activeId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (activeId.current) completeOpening(activeId.current); };
  }, [completeOpening]);
  useEffect(() => { if (confirming) confirmButton.current?.focus(); }, [confirming]);
  useEffect(() => { if (phase === "result") resultHeading.current?.focus(); }, [phase]);
  const owned = useMemo(() => countCopies(state.ownedItemIds), [state.ownedItemIds]);
  const picked = useMemo(() => countCopies(selected), [selected]);
  const path = TRADE_UP_PATHS.find(entry => entry.inputRarity === rarity)!;
  const chance = state.settings.tradeUpOdds[rarity];
  const eligible = useMemo(() => indexed.filter(({ item }) => item.rarity === rarity && (owned.get(item.id) ?? 0) > 0), [owned, rarity]);
  const filtered = useMemo(() => {
    const term = normalizeClubSearch(query.trim()).replace(/[\s-]+/g, "");
    return eligible.filter(entry => !term || entry.search.includes(term));
  }, [eligible, query]);
  const totalCopies = eligible.reduce((total, { item }) => total + (owned.get(item.id) ?? 0), 0);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const locked = !hydrated || isPlaying || submitting || phase !== "idle";
  const selectionValid = selected.length === TRADE_UP_ITEM_COUNT && [...picked].every(([id, count]) => count <= (owned.get(id) ?? 0) && getCosmeticById(id)?.rarity === rarity);
  const clear = () => { setSelected([]); setConfirming(false); setError(""); };
  const quickPick = () => {
    const ids: string[] = [];
    for (const { item } of eligible) {
      const count = Math.min(TRADE_UP_ITEM_COUNT - ids.length, owned.get(item.id) ?? 0);
      for (let index = 0; index < count; index++) ids.push(item.id);
      if (ids.length === TRADE_UP_ITEM_COUNT) break;
    }
    setSelected(ids); setError("");
  };
  const finish = () => {
    if (activeId.current) { completeOpening(activeId.current); activeId.current = null; }
    setPhase("result");
  };
  const submit = async (event: MouseEvent<HTMLButtonElement>) => {
    if (inFlight.current || locked || !selectionValid) return;
    const immediate = event.detail === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    inFlight.current = true;
    setSubmitting(true); setError("");
    const attempt = await tradeUp(selected);
    inFlight.current = false;
    if (!mounted.current) { if (attempt.success) completeOpening(attempt.id); return; }
    setSubmitting(false); setConfirming(false);
    if (!attempt.success) { setError(errors[attempt.reason]); return; }
    activeId.current = attempt.id;
    setResult(attempt);
    if (immediate) { completeOpening(attempt.id); activeId.current = null; setPhase("result"); }
    else setPhase("forging");
  };
  const restart = () => { setResult(null); setPhase("idle"); clear(); };
  const tierStyle = { "--forge-color": getRarityConfig(path.targetRarity).color } as CSSProperties;
  return <div className="page-wrap forge-page">
    <div className="page-heading"><div className="section-kicker"><Layers3 size={13}/> ĐỔI ĐỒ CLB</div><h1>5 vật phẩm. <span>Một cơ hội.</span></h1><p>Chọn 5 bản sao cùng bậc để thử nhận một món ngẫu nhiên ở bậc cao hơn.</p></div>
    <nav className="game-tabs" aria-label="Choose a mini game"><Link href="/chest"><Box size={17}/> Mystery Chest</Link><Link href="/orbit"><Orbit size={17}/> Lucky Orbit</Link><Link href="/trade-up" aria-current="page"><Layers3 size={17}/> Đổi đồ <span>5 → 1</span></Link></nav>
    <div className="forge-layout">
      <section className={"forge-workbench panel phase-" + phase} style={tierStyle} aria-label="Bàn đổi 5 vật phẩm" aria-busy={submitting || phase === "forging"}>
        <div className="forge-topline"><span>Hợp đồng 5 → 1</span><span>Không tốn EX</span></div>
        {phase === "result" && result ? <div className={"forge-result " + (result.won ? "won" : "lost")}>
          {result.won && result.reward ? <>
            <div className="forge-result-art"><CosmeticArt item={result.reward.item} priority/></div><RarityBadge rarity={result.targetRarity}/>
            <h2 tabIndex={-1} ref={resultHeading}>Đổi thành công</h2><h3>{result.reward.item.name}</h3><p>{result.reward.isDuplicate ? "Thêm một bản sao mới vào kho." : "Vật phẩm mới đã được cất vào kho."}</p>
          </> : <>
            <div className="forge-spent-art"><Image src="/assets/forge-five-slot.webp" alt="Bàn đổi đồ đã sử dụng 5 vật phẩm" width={500} height={334} sizes="(max-width:700px) 85vw, 450px"/></div>
            <h2 tabIndex={-1} ref={resultHeading}>Đổi thất bại</h2><p>5 vật phẩm đã được tiêu thụ. Không nhận được vật phẩm mới.</p>
          </>}
          <small>Tỷ lệ lượt này: {result.chance.toLocaleString("vi")}% · {getRarityConfig(result.inputRarity).label} → {getRarityConfig(result.targetRarity).label}</small>
          <div className="forge-result-actions"><button className="primary-button" onClick={restart}>Đổi tiếp <ArrowRight size={15}/></button><Link className="secondary-button" href="/inventory">Về kho đồ</Link></div>
        </div> : <>
          <div className="forge-scene">
            <Image className="forge-machine" src="/assets/forge-five-slot.webp" alt="Máy hợp nhất với 5 ô vật phẩm, concept nguyên bản từ ImageGen" width={1000} height={667} sizes="(max-width:700px) 90vw, (max-width:1100px) 65vw, 600px" priority/>
            {phase === "forging" && <div className="forge-charge" onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === "forge-charge") finish(); }} aria-hidden="true"/>}
            <p className="forge-scene-caption" role="status">{phase === "forging" ? "Đang hợp nhất 5 vật phẩm…" : "Mỗi bản sao là một cơ hội mới."}</p>
          </div>
          <div className="forge-contract">
            <div className="forge-contract-heading"><strong>{selected.length} / 5 món đã chọn</strong><span>{getRarityConfig(rarity).label} → {getRarityConfig(path.targetRarity).label}</span></div>
            <div className="forge-slots" aria-label="Năm ô vật phẩm đã chọn">{Array.from({ length: TRADE_UP_ITEM_COUNT }, (_, index) => {
              const item = selected[index] ? getCosmeticById(selected[index]) : null;
              return item ? <button className="forge-slot filled" key={index} disabled={locked || confirming} aria-label={"Bỏ món " + (index + 1) + ": " + item.name} onClick={() => setSelected(ids => ids.filter((_, slot) => slot !== index))}><CosmeticArt item={item} compact/><span>{item.name}</span><X size={12}/></button> : <div className="forge-slot empty" key={index}><Plus size={18}/><span>Ô {index + 1}</span></div>;
            })}</div>
            {confirming ? <div className="forge-confirm" role="group" aria-label="Xác nhận tiêu thụ 5 món" onKeyDown={event => { if (event.key === "Escape" && !submitting) setConfirming(false); }}>
              <strong>5 món sẽ mất, dù thành công hay thất bại.</strong><p>Bạn có {chance.toLocaleString("vi")}% cơ hội nhận 1 {getRarityConfig(path.targetRarity).label} ngẫu nhiên. Đây là thay đổi không thể hoàn tác.</p>
              <div><button className="primary-button" ref={confirmButton} disabled={locked || !selectionValid} onClick={submit}>{submitting ? "Đang lưu hợp đồng…" : "Xác nhận đổi 5 món"}</button><button className="secondary-button" disabled={submitting} onClick={() => setConfirming(false)}>Hủy</button></div>
            </div> : <div className="forge-contract-action"><button className="primary-button" disabled={locked || !selectionValid} onClick={() => setConfirming(true)}><Layers3 size={16}/>{phase === "forging" ? "Đang hợp nhất…" : "Xem lại và đổi đồ"}<span>{chance.toLocaleString("vi")}%</span></button><button className="text-button" disabled={locked || !selected.length} onClick={clear}>Bỏ chọn tất cả</button></div>}
            <p className="forge-risk-note">Thất bại mất cả 5 món. Thành công nhận ngẫu nhiên 1 món của bậc kế tiếp.</p>
          </div>
        </>}
        {error && <p className="forge-error" role="alert">{error}</p>}
      </section>
      <aside className="forge-rules">
        <h2>Tỷ lệ thành công</h2><p>Áp dụng cho mỗi hợp đồng, không cộng dồn may mắn.</p>
        <div className="forge-rates">{TRADE_UP_PATHS.map(entry => <div key={entry.inputRarity} data-selected={rarity === entry.inputRarity}><span><i style={{ background: getRarityConfig(entry.targetRarity).color }}/>{getRarityConfig(entry.inputRarity).label}<ArrowRight size={12}/>{getRarityConfig(entry.targetRarity).label}</span><strong>{state.settings.tradeUpOdds[entry.inputRarity].toLocaleString("vi")}%</strong></div>)}</div>
        <Link className="odds-edit-link" href="/settings">Chỉnh tỷ lệ <Settings2 size={13}/></Link>
        <div className="forge-rule-note"><ShieldCheck size={18}/><div><h3>Muốn luyện lên Mythic?</h3><p>Bàn này nhận Common đến Epic. Dùng 5 Legendary cùng XCoin tại <Link href="/forge">Lò Thần Thoại</Link>. Mythic không làm nguyên liệu.</p><p>{cosmeticsByRarity(path.targetRarity).length} món trong bậc đích có cơ hội như nhau. Bản sao trùng vẫn được giữ.</p></div></div>
        <Link className="forge-inventory-link" href="/inventory">Xem tất cả kho đồ <ArrowRight size={14}/></Link>
      </aside>
    </div>
    <section className="forge-picker" aria-label="Chọn vật phẩm từ kho">
      <div className="section-header"><div><h2>Chọn từ kho của bạn</h2><p>Được chọn nhiều bản sao của cùng một vật phẩm. Đã chọn {selected.length}/5.</p></div><div className="forge-picker-actions"><button className="secondary-button" disabled={locked || confirming || totalCopies < TRADE_UP_ITEM_COUNT} onClick={quickPick}>Chọn nhanh 5 món</button>{selectionValid && phase === "idle" && <button className="primary-button" disabled={locked || confirming} onClick={() => setConfirming(true)}>Xem lại 5 món <ArrowRight size={14}/></button>}</div></div>
      <div className="forge-filters"><label className="forge-rarity-select"><span>Bậc mang đi đổi</span><select value={rarity} disabled={locked || confirming} onChange={event => { setRarity(event.target.value as TradeInputRarity); clear(); setQuery(""); setPage(0); }}>{TRADE_UP_PATHS.map(entry => <option value={entry.inputRarity} key={entry.inputRarity}>{getRarityConfig(entry.inputRarity).label}</option>)}</select></label><label className="club-search"><Search size={16}/><span className="sr-only">Tìm trong đồ có thể đổi</span><input value={query} disabled={locked || confirming} placeholder="Tìm vật phẩm hoặc CLB…" onChange={event => { setQuery(event.target.value); setPage(0); }}/></label></div>
      <div className="collection-meta"><span role="status">{hydrated ? `${totalCopies} bản sao ${getRarityConfig(rarity).label} trong kho · ${filtered.length} mẫu phù hợp` : "Đang tải kho…"}</span><span>Trang {currentPage + 1}/{pages}</span></div>
      {visible.length ? <div className="forge-item-grid">{visible.map(({ item }) => {
        const count = owned.get(item.id) ?? 0;
        const chosen = picked.get(item.id) ?? 0;
        return <button key={item.id} className="forge-item" disabled={locked || confirming || selected.length >= TRADE_UP_ITEM_COUNT || chosen >= count} aria-label={"Thêm " + item.name + ", còn " + Math.max(0, count - chosen) + " bản sao"} onClick={() => { setSelected(ids => [...ids, item.id]); setError(""); }}><CosmeticArt item={item}/><div className="forge-item-copy"><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><p>{chosen ? `${chosen} đã chọn · ` : ""}Còn {Math.max(0, count - chosen)} / {count} bản sao <Plus size={14}/></p></div></button>;
      })}</div> : <div className="empty-state panel"><Layers3 size={26}/><h2>{query ? "Không tìm thấy vật phẩm phù hợp" : "Chưa có đồ ở bậc này"}</h2><p>{query ? "Thử tìm tên CLB khác hoặc bỏ từ khóa." : "Mở rương hoặc chơi Lucky Orbit để tích đủ 5 bản sao cùng bậc."}</p>{query ? <button className="secondary-button" onClick={() => setQuery("")}>Xóa tìm kiếm</button> : <Link className="primary-button" href="/chest">Mở rương <ArrowRight size={14}/></Link>}</div>}
      {pages > 1 && <nav className="club-pagination" aria-label="Phân trang vật phẩm đổi"><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ArrowLeft size={14}/> Trang trước</button><span>{currentPage + 1} / {pages}</span><button className="secondary-button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Trang sau <ArrowRight size={14}/></button></nav>}
    </section>
    <p className="club-concept-note">Luật đổi đồ riêng của bản demo FPTU Xperience. Vật phẩm concept CLB, không có giá trị tiền thật. Lịch sử giữ cả lượt thành công và thất bại.</p>
  </div>;
}
