"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Flame, Plus, Search, ShieldAlert, Sparkles, X } from "lucide-react";
import { COSMETICS, getCosmeticById } from "@/data/cosmetics";
import { normalizeClubSearch } from "@/data/clubs";
import { FORGE_COIN_STEP, FORGE_MAX_CHANCE, FORGE_MAX_COINS, FORGE_MIN_COINS, FORGE_RULE_VERSION, forgeChance } from "@/data/eventEconomy";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import { useXperience } from "@/hooks/useXperience";
import { getUnlockedCounts, safeSurplusQuickPick, selectionProtectionWarnings } from "@/lib/itemProtection";
import { SelectionProtectionWarning } from "@/components/inventory/SelectionProtectionWarning";
import type { EconomyResult } from "@/types/economy";
import { CoinSeal, EconomyNav, EconomyNotice, WalletBalance, countInventory, economyError } from "./EconomyChrome";
import styles from "./economy.module.css";

const LEGENDARIES = COSMETICS.filter(item => item.rarity === "LEGENDARY");
const PAGE_SIZE = 12;

export function MythicForge() {
  const { state, collector, playerId, economy, hydrated, isPlaying, economyAction } = useXperience();
  const [selected, setSelected] = useState<string[]>([]);
  const [coinDraft, setCoinDraft] = useState(FORGE_MIN_COINS);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<{ result: EconomyResult; coins: number; animate: boolean } | null>(null);
  const [error, setError] = useState("");
  const [riskAcceptedFor, setRiskAcceptedFor] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const owned = useMemo(() => getUnlockedCounts(state.ownedItemIds, collector.copies), [state.ownedItemIds, collector.copies]);
  const picked = useMemo(() => countInventory(selected), [selected]);
  const equippedIds = useMemo(() => new Set(Object.values(state.equipped).filter((id): id is string => !!id)), [state.equipped]);
  const protection = selectionProtectionWarnings(selected, state.ownedItemIds, equippedIds, owned);
  const needsProtectionAcceptance = protection.lastCopyIds.length > 0 || protection.lastUnlockedCopyIds.length > 0 || protection.equippedItemIds.length > 0;
  const ownedTotals = countInventory(state.ownedItemIds);
  const protectionKey = JSON.stringify([playerId, selected, selected.map(id => ownedTotals.get(id)), protection]);
  const protectionAccepted = !needsProtectionAcceptance || riskAcceptedFor === protectionKey;
  const eligible = useMemo(() => LEGENDARIES.filter(item => (owned.get(item.id) ?? 0) > 0), [owned]);
  const quickSelection = useMemo(() => safeSurplusQuickPick(eligible.map(item => item.id), state.ownedItemIds, collector.copies, equippedIds), [eligible, state.ownedItemIds, collector.copies, equippedIds]);
  const term = normalizeClubSearch(query.trim());
  const filtered = eligible.filter(item => !term || normalizeClubSearch(item.name + " " + item.description).includes(term));
  const totalCopies = eligible.reduce((sum, item) => sum + (owned.get(item.id) ?? 0), 0);
  const protectedCopies = collector.copies.filter(copy => copy.locked && getCosmeticById(copy.itemId)?.rarity === "LEGENDARY").length;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const maxCoins = Math.min(FORGE_MAX_COINS, Math.floor(economy.coinBalance / FORGE_COIN_STEP) * FORGE_COIN_STEP);
  const hasCatalyst = maxCoins >= FORGE_MIN_COINS;
  const coins = hasCatalyst ? Math.min(Math.max(FORGE_MIN_COINS, coinDraft), maxCoins) : 0;
  const chance = forgeChance(coins);
  const valid = coins >= FORGE_MIN_COINS && selected.length === 5 && [...picked].every(([id, count]) => getCosmeticById(id)?.rarity === "LEGENDARY" && count <= (owned.get(id) ?? 0));
  const busy = !hydrated || isPlaying || pending;
  const locked = busy || confirming || receipt !== null;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!confirming) return;
    const button = confirmButton.current;
    if (button?.disabled) button.closest('[role="group"]')?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    else button?.focus();
  }, [confirming]);
  useEffect(() => { if (receipt) resultHeading.current?.focus({ preventScroll: true }); }, [receipt]);

  function quickPick() {
    if (locked) return;
    setSelected(quickSelection); setRiskAcceptedFor(null); setError("");
  }
  async function forge(animate: boolean) {
    if (inFlight.current || busy || !valid) return;
    if (!protectionAccepted) return;
    inFlight.current = true; setPending(true); setError("");
    const spentCoins = coins;
    try {
      const result = await economyAction({ type: "forge-mythic", itemIds: [...selected], coins: spentCoins });
      if (!mounted.current) return;
      setConfirming(false);
      if (!result.success) { setError(economyError(result.reason)); return; }
      setReceipt({ result, coins: spentCoins, animate });
    } catch { if (mounted.current) { setConfirming(false); setError(economyError("STORAGE_UNAVAILABLE")); } }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }
  function restart() { setSelected([]); setReceipt(null); setConfirming(false); setRiskAcceptedFor(null); setError(""); }

  return <div className={`page-wrap ${styles.page}`}>
    <header className={styles.pageHeading}><div><h1>Lò luyện Mythic</h1><p>Năm Legendary. XCoin làm chất xúc tác. Một cơ hội thức tỉnh di sản.</p></div><WalletBalance balance={economy.coinBalance} ready={hydrated}/></header>
    <EconomyNav current="/forge"/>
    <div className={styles.forgeLayout}>
      <section className={styles.forgeWorkbench} aria-labelledby="forge-title" aria-busy={pending} data-pending={pending}>
        <div className={styles.forgeTopline}><span><Flame size={16}/> Nghi thức 5 → 1</span><RarityBadge rarity="MYTHIC"/></div>
        {receipt ? <div id="forge-title" className={styles.forgeOutcome} data-won={receipt.result.won} data-animate={receipt.animate}>
          {receipt.result.won && receipt.result.reward ? <><div className={styles.outcomeArt}><CosmeticArt item={receipt.result.reward.item} priority animated/></div><h2 ref={resultHeading} tabIndex={-1}>Di sản đã thức tỉnh</h2><h3>{receipt.result.reward.item.name}</h3><p>{receipt.result.reward.isDuplicate ? "Một bản sao Mythic mới đã được cất vào kho." : "Vật phẩm Mythic đã được cất vào kho của bạn."}</p><span className={styles.saved}><Check size={16}/> Hiệu ứng đi cùng khi trang bị</span></> : <><div className={styles.spentSeal}><Flame size={48}/></div><h2 ref={resultHeading} tabIndex={-1}>Nghi thức chưa thành công</h2><p>Không nhận được Mythic. Cả 5 Legendary và {receipt.coins.toLocaleString("vi")} XCoin đã được tiêu hao.</p></>}
          <small>Tỷ lệ lượt này: {receipt.result.chance}% · Đã dùng 5 Legendary + {receipt.coins.toLocaleString("vi")} XCoin</small><div className={styles.outcomeActions}><Link href="/inventory" className={styles.goldButton}>Xem kho đồ <ArrowRight size={15}/></Link><button className={styles.subtleButton} onClick={restart}>Chuẩn bị lượt mới</button></div>
        </div> : <>
          <div className={styles.forgeRitual}><div className={styles.ritualRing} aria-hidden="true"/><div className={styles.ritualSeal}><CoinSeal/></div><h2 id="forge-title">Đánh thức một Mythic</h2><p>{pending ? "Đang xác nhận nghi thức trên backend…" : "5 Legendary được hợp nhất thành cơ hội nhận một Mythic ngẫu nhiên."}</p></div>
          <div className={styles.selectedHeader}><strong>Nguyên liệu đã chọn</strong><span>{selected.length} / 5 Legendary</span></div>
          <div className={styles.forgeSlots} aria-label="Năm Legendary dùng làm nguyên liệu">{Array.from({ length: 5 }, (_, index) => {
            const item = selected[index] ? getCosmeticById(selected[index]) : null;
            return item ? <button key={index} className={styles.forgeSlot} disabled={locked} onClick={() => setSelected(ids => ids.filter((_, slot) => slot !== index))} aria-label={`Bỏ món ${index + 1}: ${item.name}`}><CosmeticArt item={item} compact animated={false}/><span>{item.name}</span><X size={13}/></button> : <div key={index} className={styles.emptySlot}><Plus size={19}/><span>Ô {index + 1}</span></div>;
          })}</div>
          <div className={styles.catalyst}><div className={styles.catalystHeading}><label htmlFor="forge-coins">XCoin bắt buộc · chất xúc tác</label><strong>{coins.toLocaleString("vi")} <span>XC</span></strong></div><input id="forge-coins" type="range" min={hasCatalyst ? FORGE_MIN_COINS : 0} max={maxCoins} step={FORGE_COIN_STEP} disabled={locked || !hasCatalyst} value={coins} onChange={event => setCoinDraft(Number(event.target.value))} aria-describedby="forge-coins-rule forge-funding-status" aria-valuetext={`${coins} XCoin, ${chance}% cơ hội thành công`}/><div className={styles.catalystScale}><span>Tối thiểu {FORGE_MIN_COINS} XC · 1%</span><button className={styles.inlineButton} disabled={locked || !hasCatalyst} onClick={() => setCoinDraft(maxCoins)}>Dùng tối đa {maxCoins.toLocaleString("vi")} XC</button></div><p id="forge-coins-rule">Phải dùng XCoin mới có thể luyện. Mỗi {FORGE_COIN_STEP} XCoin cho 1 điểm phần trăm; từ 1% đến tối đa {FORGE_MAX_CHANCE}% ({FORGE_MAX_COINS} XCoin).</p><p id="forge-funding-status" className={!hasCatalyst && hydrated ? styles.fundingRequired : undefined} role={!hasCatalyst && hydrated ? "status" : undefined}>{!hydrated ? "Đang kết nối ví XCoin…" : !hasCatalyst ? <>Cần ít nhất {FORGE_MIN_COINS} XCoin. Chưa đủ coin nên chưa thể luyện; 5 Legendary vẫn được giữ nguyên. <Link href="/events">Nhận XCoin từ sự kiện <ArrowRight size={12}/></Link></> : "Không có lượt luyện miễn phí. XCoin và 5 Legendary đều tiêu hao dù thành công hay thất bại."}</p></div>
          <div className={styles.forgeChance}><span>Tỷ lệ thành công của lượt này</span><strong>{chance}<span>%</span></strong><div><span>5 Legendary</span><Plus size={12}/><span>{coins.toLocaleString("vi")} XCoin</span><ArrowRight size={13}/><span>1 Mythic ngẫu nhiên</span></div></div>
          {confirming ? <div className={styles.confirmation} role="group" aria-label="Xác nhận tiêu hao nguyên liệu luyện Mythic" onKeyDown={event => { if (event.key === "Escape" && !pending) setConfirming(false); }}><strong>Tiêu hao cả 5 Legendary và {coins.toLocaleString("vi")} XCoin?</strong><p>Thành công {chance}%, thất bại {100 - chance}%. Dù kết quả thế nào, toàn bộ nguyên liệu đều mất. Không thể hoàn tác.</p><SelectionProtectionWarning {...protection} accepted={riskAcceptedFor === protectionKey} disabled={pending} onAccept={accepted => setRiskAcceptedFor(accepted ? protectionKey : null)}/><div><button ref={confirmButton} className={styles.goldButton} disabled={busy || !valid || !protectionAccepted} onClick={event => void forge(event.detail !== 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)}>{pending ? "Đang lưu nghi thức…" : "Xác nhận luyện Mythic"}</button><button className={styles.subtleButton} disabled={pending} onClick={() => setConfirming(false)}>Hủy, giữ nguyên liệu</button></div></div> : <div className={styles.forgeActions}><button className={styles.goldButton} disabled={busy || !valid} onClick={() => setConfirming(true)}><Flame size={17}/> Xem lại và luyện Mythic</button><button className={styles.inlineButton} disabled={busy || !selected.length} onClick={() => { setSelected([]); setRiskAcceptedFor(null); setError(""); }}>Bỏ chọn tất cả</button></div>}
          <p className={styles.riskNote}><ShieldAlert size={15}/> Thất bại mất cả 5 món và coin đã chọn.</p>
        </>}
        {error && <EconomyNotice error>{error}</EconomyNotice>}
      </section>
      <aside className={styles.forgeRules}><Sparkles size={25}/><h2>Chất xúc tác, không phải bảo chứng</h2><p>XCoin là nguyên liệu bắt buộc. Không dùng coin: không thể luyện. Tỷ lệ mỗi lượt từ 1% đến {FORGE_MAX_CHANCE}%, không cộng dồn may mắn sau thất bại.</p><dl><div><dt>{FORGE_MIN_COINS} XCoin</dt><dd>{forgeChance(FORGE_MIN_COINS)}%</dd></div><div><dt>100 XCoin</dt><dd>{forgeChance(100)}%</dd></div><div><dt>{FORGE_MAX_COINS} XCoin · tối đa</dt><dd>{FORGE_MAX_CHANCE}%</dd></div></dl><p>Chọn 5 bản sao Legendary bất kỳ, kể cả trùng nhau hoặc khác CLB. Thành công nhận ngẫu nhiên 1 Mythic trong bộ sưu tập.</p><p>Mythic đã nhận không dùng để luyện tiếp. Bản sao trùng vẫn được giữ trong kho.</p><Link href="/events">Nhận thêm XCoin <ArrowRight size={14}/></Link><Link href="/market">Tìm Legendary trên chợ <ArrowRight size={14}/></Link><Link href="/trade-up">Đổi đồ Common → Legendary <ArrowRight size={14}/></Link></aside>
    </div>
    {!receipt && <section className={styles.forgeInventory} aria-labelledby="forge-picker-title"><div className={styles.sectionHeading}><div><h2 id="forge-picker-title">Legendary trong kho</h2><p>{hydrated ? `${totalCopies} bản chưa khóa · ${protectedCopies} bản được bảo vệ · Đã chọn ${selected.length}/5` : "Đang tải kho…"}</p><p>Chọn nhanh giữ lại một bản mỗi mẫu và bỏ qua đồ đang trang bị. Chỉ bản chưa khóa mới có thể làm nguyên liệu.</p></div><button className={styles.subtleButton} disabled={locked || quickSelection.length < 5} onClick={quickPick}>Chọn nhanh 5 bản dư</button></div><label className={styles.search}><Search size={17}/><span className="sr-only">Tìm Legendary trong kho</span><input value={query} disabled={locked} placeholder="Tìm vật phẩm hoặc CLB…" onChange={event => { setQuery(event.target.value); setPage(0); }}/></label>{visible.length ? <div className={styles.inventoryGrid}>{visible.map(item => {
      const available = owned.get(item.id) ?? 0;
      const chosen = picked.get(item.id) ?? 0;
      return <button className={styles.inventoryItem} key={item.id} disabled={locked || selected.length >= 5 || chosen >= available} onClick={() => { setSelected(ids => [...ids, item.id]); setError(""); }} aria-label={`Thêm ${item.name}, còn ${Math.max(0, available - chosen)} bản sao`}><div><CosmeticArt item={item} compact animated={false}/></div><span>{item.name}</span><small>{chosen ? `${chosen} đã chọn · ` : ""}Còn {Math.max(0, available - chosen)} / {available}</small><Plus size={16}/></button>;
    })}</div> : <div className={styles.empty}><Flame size={27}/><h3>{query ? "Không tìm thấy Legendary phù hợp" : "Chưa có nguyên liệu Legendary"}</h3><p>{query ? "Thử tên CLB khác hoặc bỏ từ khóa." : "Tích đủ 5 bản sao từ rương, đổi đồ hoặc chợ người chơi."}</p>{query ? <button className={styles.subtleButton} onClick={() => setQuery("")}>Xóa tìm kiếm</button> : <Link className={styles.subtleButton} href="/market">Tìm trên chợ <ArrowRight size={14}/></Link>}</div>}{pages > 1 && <nav className={styles.pagination} aria-label="Phân trang Legendary"><button className={styles.subtleButton} disabled={locked || currentPage === 0} onClick={() => setPage(currentPage - 1)}><ArrowLeft size={14}/> Trước</button><span>{currentPage + 1} / {pages}</span><button className={styles.subtleButton} disabled={locked || currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Sau <ArrowRight size={14}/></button></nav>}</section>}
    {economy.forgeHistory.length > 0 && <section className={styles.history} aria-labelledby="forge-history-title"><div className={styles.sectionHeading}><div><h2 id="forge-history-title">Nghi thức gần đây</h2><p>Giữ đúng tỷ lệ tại thời điểm thực hiện; lượt cũ không bị tính lại.</p></div></div>{economy.forgeHistory.slice(0, 5).map(record => <article key={record.id}><span className={record.won ? styles.historyWon : styles.historyLost}>{record.won ? "Thành công" : "Thất bại"}</span><div><strong>{record.won && record.rewardItemId ? getCosmeticById(record.rewardItemId)?.name ?? "Mythic" : "Đã tiêu hao 5 Legendary"}</strong><small>{new Date(record.timestamp).toLocaleString("vi", { timeZone: "Asia/Ho_Chi_Minh" })}{record.ruleVersion !== FORGE_RULE_VERSION ? <> · <span className={styles.legacyRule}>Luật cũ</span></> : null}</small></div><span>{record.coins.toLocaleString("vi")} XC · {record.chance}%</span></article>)}</section>}
  </div>;
}
