"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Coins, History, LockKeyhole, Package, RefreshCw, Search, Star, Store, X } from "lucide-react";
import { getCosmeticById } from "@/data/cosmetics";
import { MAX_ACTIVE_LISTINGS, MAX_MARKET_PRICE } from "@/data/eventEconomy";
import { CLUBS, normalizeClubSearch } from "@/data/clubs";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import { useXperience } from "@/hooks/useXperience";
import { readMarketplace } from "@/lib/backendClient";
import { emptyMarketDraft, MARKET_RARITIES, marketDraftForItem, marketRefreshActivity, marketSellCopies, validateMarketDraft, type MarketFilterDraft } from "@/lib/marketFilters";
import type { MarketFilters, MarketListing, MarketPage } from "@/types/economy";
import { EconomyNav, EconomyNotice, WalletBalance, countInventory, economyError } from "./EconomyChrome";
import styles from "./economy.module.css";

const EMPTY_MARKET: MarketPage = { listings: [], ownListings: [], nextCursor: null };
const priceFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const receiptDate = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const formatDate = (value: string) => Number.isFinite(Date.parse(value)) ? receiptDate.format(new Date(value)) : "Đã hoàn tất";

export function MarketPriceSummary({ itemId, summary }: { itemId: string; summary: MarketPage["priceSummary"] }) {
  const actual = summary?.itemId === itemId && summary.salesCount > 0 ? summary : null;
  return <section className={styles.priceSummary} aria-label="Giá giao dịch thực tế"><h3>Giao dịch đã hoàn tất</h3>{actual ? <><dl><div><dt>Thấp nhất</dt><dd>{priceFormat.format(actual.minPrice)} <small>XCoin</small></dd></div><div><dt>Trung bình</dt><dd>{priceFormat.format(actual.averagePrice)} <small>XCoin</small></dd></div><div><dt>Cao nhất</dt><dd>{priceFormat.format(actual.maxPrice)} <small>XCoin</small></dd></div><div><dt>Gần nhất</dt><dd>{priceFormat.format(actual.lastPrice)} <small>XCoin</small></dd></div></dl><p>Từ {actual.salesCount.toLocaleString("vi-VN")} giao dịch thật của đúng mẫu này. Giá tham khảo, không bảo đảm giá bán tiếp theo.</p></> : <p>Chưa có dữ liệu giao dịch đã hoàn tất cho mẫu này. Không suy đoán giá từ độ hiếm hay tin đang bán.</p>}</section>;
}

export function MarketTransactionHistory({ history, ready }: { history: MarketPage["history"]; ready: boolean }) {
  const receipts = (history ?? []).slice(0, 50);
  return <section className={styles.marketHistory} aria-labelledby="market-history-title"><div className={styles.sectionHeading}><div><h2 id="market-history-title"><History size={18} aria-hidden="true"/>Lịch sử mua bán của bạn</h2><p>Tối đa 50 giao dịch đã hoàn tất gần nhất. Chỉ chủ tài khoản nhìn thấy.</p></div></div>{!ready ? <p className={styles.historyEmpty}>Đang tải lịch sử giao dịch…</p> : receipts.length ? <ol className={styles.receiptList}>{receipts.map(receipt => <li key={`${receipt.listingId}:${receipt.side}`}><span className={styles.receiptSide} data-side={receipt.side}>{receipt.side === "buy" ? "Đã mua" : "Đã bán"}</span><div><strong>{getCosmeticById(receipt.itemId)?.name ?? "Vật phẩm lưu trữ"}</strong><time dateTime={receipt.completedAt}>{formatDate(receipt.completedAt)}</time></div><span className={styles.receiptPrice}>{receipt.side === "buy" ? "−" : "+"}{receipt.price.toLocaleString("vi-VN")} <small>XCoin</small></span></li>)}</ol> : <p className={styles.historyEmpty}>Chưa có giao dịch hoàn tất được ghi nhận. Đăng bán hoặc thu hồi tin không tính là mua bán.</p>}</section>;
}

export function PlayerMarket() {
  const { playerId } = useXperience();
  return <Suspense fallback={<div className={`page-wrap ${styles.page}`} role="status">Đang mở chợ người chơi…</div>}><MarketRouter playerId={playerId}/></Suspense>;
}

function MarketRouter({ playerId }: { playerId: string | null }) {
  const search = useSearchParams();
  const itemId = search.get("itemId"), wishlistOnly = search.get("wishlistOnly") === "true";
  return <MarketSession key={`${playerId ?? "connecting"}:${itemId ?? ""}:${wishlistOnly}`} initialItemId={itemId} initialWishlistOnly={wishlistOnly}/>;
}

export function MarketSession({ initialItemId = null, initialWishlistOnly = false }: { initialItemId?: string | null; initialWishlistOnly?: boolean }) {
  const { state, collector, economy, playerId, hydrated, isPlaying, economyAction, retryBackend } = useXperience();
  const initialDraft = () => ({ ...marketDraftForItem(initialItemId), wishlistOnly: initialWishlistOnly });
  const [draft, setDraft] = useState<MarketFilterDraft>(initialDraft);
  const [filters, setFilters] = useState<MarketFilters>(() => validateMarketDraft(initialDraft()).filters!);
  const activeFilters = useRef(filters);
  activeFilters.current = filters;
  const [filterError, setFilterError] = useState("");
  const [market, setMarket] = useState<MarketPage>(EMPTY_MARKET);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [updateNotice, setUpdateNotice] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState(false);
  const [pending, setPending] = useState(false);
  const [sellQuery, setSellQuery] = useState("");
  const [copyId, setCopyId] = useState("");
  const [price, setPrice] = useState("10");
  const [confirm, setConfirm] = useState<{ type: "buy"; listing: MarketListing } | { type: "sell"; copyId: string; price: number } | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const confirmation = useRef<HTMLButtonElement>(null);
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);
  const lastSnapshot = useRef<MarketPage | null>(null);
  const lastRefreshAt = useRef(0);
  const owned = useMemo(() => countInventory(state.ownedItemIds), [state.ownedItemIds]);
  const sellable = useMemo(() => marketSellCopies(collector.copies, state.ownedItemIds), [collector.copies, state.ownedItemIds]);
  const sellTerm = normalizeClubSearch(sellQuery.trim());
  const eligible = sellable.filter(copy => { const item = getCosmeticById(copy.itemId)!; return !sellTerm || normalizeClubSearch(`${item.name} ${item.description} ${copy.serial}`).includes(sellTerm); });
  const selectedCopy = sellable.find(copy => copy.id === copyId);
  const selectedItem = selectedCopy ? getCosmeticById(selectedCopy.itemId) : undefined;
  const priceNumber = Number(price);
  const priceValid = price.trim() !== "" && Number.isSafeInteger(priceNumber) && priceNumber >= 1 && priceNumber <= MAX_MARKET_PRICE;
  const sellValid = Boolean(selectedCopy && selectedItem && priceValid && market.ownListings.length < MAX_ACTIVE_LISTINGS);
  const busy = !hydrated || isPlaying || pending;
  const visible = market.listings.filter(listing => listing.sellerId !== playerId && getCosmeticById(listing.itemId));
  const focusedItem = filters.itemId ? getCosmeticById(filters.itemId) : undefined;
  const wishlistKey = (collector.wishlistItemIds ?? []).join("|");
  const lastCopy = selectedItem ? (owned.get(selectedItem.id) ?? 0) === 1 : false;
  const equipped = selectedItem ? Object.values(state.equipped).includes(selectedItem.id) : false;

  const load = useCallback(async (cursor?: string, announce = false) => {
    if (!hydrated || !mounted.current || filters !== activeFilters.current) return;
    request.current?.abort();
    const controller = new AbortController(), version = ++generation.current;
    request.current = controller; lastRefreshAt.current = Date.now();
    setLoading(true); setLoadError("");
    try {
      const page = await readMarketplace(cursor, controller.signal, filters);
      if (!mounted.current || controller.signal.aborted || version !== generation.current || filters !== activeFilters.current) return;
      if (!cursor) {
        const activity = marketRefreshActivity(lastSnapshot.current, page);
        lastSnapshot.current = page;
        if (announce) setUpdateNotice(`Đã cập nhật chợ.${activity.newSales ? ` ${activity.newSales} tin của bạn vừa bán thành công.` : ""}${activity.newWishlistMatches ? ` Thêm ${activity.newWishlistMatches} tin khớp wishlist.` : ""}${!activity.newSales && !activity.newWishlistMatches ? " Chưa ghi nhận giao dịch bán hoặc số tin wishlist tăng thêm." : ""}`);
      }
      setMarket(current => {
        if (!cursor) return page;
        const combined = new Map(current.listings.map(listing => [listing.id, listing]));
        for (const listing of page.listings) combined.set(listing.id, listing);
        return { ...page, listings: [...combined.values()] };
      });
      setLoaded(true);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || version !== generation.current) return;
      setLoadError(error instanceof Error ? error.message : "Không tải được chợ. Hãy kiểm tra backend rồi thử lại.");
    } finally { if (mounted.current && version === generation.current) setLoading(false); }
  }, [hydrated, filters]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    setMarket(EMPTY_MARKET); setLoaded(false); setUpdateNotice(""); lastSnapshot.current = null;
    void load();
    return () => { request.current?.abort(); };
  }, [load, wishlistKey]);
  useEffect(() => { if (confirm) confirmation.current?.focus(); }, [confirm]);
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible" || busy || confirm || loading || Date.now() - lastRefreshAt.current < 5000) return;
      void load(undefined, true);
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => { window.removeEventListener("focus", refreshOnReturn); document.removeEventListener("visibilitychange", refreshOnReturn); };
  }, [busy, confirm, loading, load]);

  function applyFilters() {
    if (busy || confirm !== null) return;
    const next = validateMarketDraft(draft);
    if (next.filters === null) { setFilterError(next.error); return; }
    setFilterError(""); setConfirm(null); setMarket(EMPTY_MARKET); setLoaded(false); setFilters(next.filters);
  }
  function resetFilters() {
    if (busy || confirm !== null) return;
    const next = emptyMarketDraft(); setDraft(next); setFilterError(""); setConfirm(null); setMarket(EMPTY_MARKET); setLoaded(false); setFilters(validateMarketDraft(next).filters!);
  }
  function dismissConfirm() { setConfirm(null); confirmTrigger.current?.focus(); }
  async function refresh() {
    if (busy || loading || confirm) return;
    try { await retryBackend(); if (mounted.current) await load(undefined, true); }
    catch { if (mounted.current) setLoadError("Chưa cập nhật được kết nối. Hãy thử lại."); }
  }
  async function mutate(action: "sell" | "buy" | "cancel", listing?: MarketListing) {
    if (inFlight.current || busy || (action === "sell" && (!sellValid || confirm?.type !== "sell" || confirm.copyId !== selectedCopy?.id || confirm.price !== priceNumber)) || (action !== "sell" && !listing)) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const command = action === "sell" ? { type: "market-list" as const, itemId: selectedCopy!.itemId, copyId: selectedCopy!.id, price: priceNumber } : action === "buy" ? { type: "market-buy" as const, listingId: listing!.id } : { type: "market-cancel" as const, listingId: listing!.id };
      const result = await economyAction(command);
      if (!mounted.current) return;
      setActionError(!result.success);
      setMessage(result.success ? action === "sell" ? "Đã đăng bán đúng bản sao đã chọn. Vật phẩm được giữ tại chợ đến khi bán hoặc thu hồi." : action === "buy" ? "Mua thành công. Vật phẩm đã vào kho, XCoin đã chuyển cho người bán." : "Đã thu hồi tin bán. Bản sao đã trở về kho." : economyError(result.reason));
      setConfirm(null);
      if (result.success && action === "sell") setCopyId("");
      await load();
    } catch { if (mounted.current) { setActionError(true); setMessage(economyError("STORAGE_UNAVAILABLE")); } }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  return <div className={`page-wrap ${styles.page}`}>
    <header className={styles.pageHeading}><div><h1>Chợ người chơi</h1><p>Một bản sao bạn có. Một dấu ấn người khác đang tìm.</p></div><WalletBalance balance={economy.coinBalance} ready={hydrated}/></header>
    <EconomyNav current="/market"/>
    <div className={styles.marketLayout}>
      <section className={styles.marketBoard} aria-labelledby="market-title">
        <div className={styles.sectionHeading}><div><h2 id="market-title">Đang được chào bán</h2><p>Mỗi tin là 1 bản sao. Bộ lọc áp dụng trên toàn chợ trước khi phân trang.</p></div><button className={styles.subtleButton} disabled={busy || loading || confirm !== null} onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true"/> {loading ? "Đang tải…" : "Làm mới"}</button></div>
        {initialItemId && !getCosmeticById(initialItemId) ? <EconomyNotice error>Liên kết vật phẩm không hợp lệ. Chợ vẫn hiển thị các tin hợp lệ khác.</EconomyNotice> : null}
        {focusedItem ? <div className={styles.marketFocus}><div><span>Đang tìm đúng mẫu</span><strong>{focusedItem.name}</strong></div><button type="button" className={styles.subtleButton} onClick={resetFilters} disabled={busy || confirm !== null}><X size={14} aria-hidden="true"/>Bỏ lọc vật phẩm</button></div> : null}
        <form className={styles.marketFilters} role="search" aria-label="Bộ lọc toàn chợ" onSubmit={event => { event.preventDefault(); applyFilters(); }}>
          <label className={styles.search}><Search size={17} aria-hidden="true"/><span className="sr-only">Tìm vật phẩm trên toàn chợ</span><input type="search" value={draft.query} maxLength={80} placeholder="Tên vật phẩm hoặc CLB…" disabled={confirm !== null} onChange={event => setDraft(current => ({ ...current, query: event.target.value }))}/></label>
          <div className={styles.filterGrid}><label>Độ hiếm<select value={draft.rarity} disabled={confirm !== null} onChange={event => setDraft(current => ({ ...current, rarity: event.target.value }))}><option value="">Tất cả độ hiếm</option>{MARKET_RARITIES.map(rarity => <option key={rarity} value={rarity}>{rarity}</option>)}</select></label><label>CLB<select value={draft.clubId} disabled={confirm !== null} onChange={event => setDraft(current => ({ ...current, clubId: event.target.value }))}><option value="">Tất cả CLB</option>{CLUBS.map(club => <option key={club.id} value={club.id}>{club.shortName} · {club.campus}</option>)}</select></label><label>Giá từ<input type="number" inputMode="numeric" min={0} max={MAX_MARKET_PRICE} step={1} placeholder="Không giới hạn" value={draft.minPrice} disabled={confirm !== null} onChange={event => setDraft(current => ({ ...current, minPrice: event.target.value }))}/></label><label>Giá đến<input type="number" inputMode="numeric" min={0} max={MAX_MARKET_PRICE} step={1} placeholder="Không giới hạn" value={draft.maxPrice} disabled={confirm !== null} onChange={event => setDraft(current => ({ ...current, maxPrice: event.target.value }))}/></label><label>Sắp xếp<select value={draft.sort} disabled={confirm !== null} onChange={event => setDraft(current => ({ ...current, sort: event.target.value as MarketFilterDraft["sort"] }))}><option value="newest">Mới đăng nhất</option><option value="price-asc">Giá thấp trước</option><option value="price-desc">Giá cao trước</option></select></label></div>
          <div className={styles.filterActions}><label><input type="checkbox" checked={draft.wishlistOnly} disabled={confirm !== null} onChange={event => setDraft(current => ({ ...current, wishlistOnly: event.target.checked }))}/><Star size={14} aria-hidden="true"/>Chỉ wishlist</label><button type="submit" className={styles.goldButton} disabled={busy || confirm !== null}>Áp dụng bộ lọc</button><button type="button" className={styles.inlineButton} disabled={busy || confirm !== null} onClick={resetFilters}>Xóa bộ lọc</button></div>
          {filterError ? <p className={styles.filterError} role="alert">{filterError}</p> : null}
        </form>
        <div className={styles.marketFeedback}><p><Star size={13} aria-hidden="true"/>{hydrated && loaded ? `${market.wishlistMatches ?? 0} tin đang bán khớp wishlist của bạn trên toàn chợ` : "Đang kiểm tra wishlist trên chợ…"}<Link href="/collection">Sửa wishlist</Link></p><p role="status" aria-live="polite" aria-atomic="true">{updateNotice}</p></div>
        {focusedItem && loaded ? <MarketPriceSummary itemId={focusedItem.id} summary={market.priceSummary}/> : null}
        {loadError ? <EconomyNotice error>{loadError} <button className={styles.inlineButton} disabled={busy || loading} onClick={() => void load()}>Thử tải lại</button></EconomyNotice> : null}
        {visible.length > 0 ? <><p className={styles.loadedCount}>{visible.length} tin đã tải theo bộ lọc đang áp dụng</p><div className={styles.marketRows}>{visible.map(listing => {
          const item = getCosmeticById(listing.itemId)!, confirming = confirm?.type === "buy" && confirm.listing.id === listing.id, canAfford = economy.coinBalance >= listing.price;
          return <article className={styles.marketRow} key={listing.id}>
            <div className={styles.marketArt}><CosmeticArt item={item} compact animated={false}/></div>
            <div className={styles.marketIdentity}><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><small>Người chơi {listing.sellerId.slice(0, 8)}</small><button type="button" className={styles.inlineButton} disabled={busy || confirm !== null} onClick={() => { const next = { ...emptyMarketDraft(), itemId: item.id }; setDraft(next); setFilters(validateMarketDraft(next).filters!); setMarket(EMPTY_MARKET); setLoaded(false); }}>Xem đúng mẫu và giá giao dịch</button></div>
            <div className={styles.marketPrice}><strong>{listing.price.toLocaleString("vi-VN")}<span> XCoin</span></strong><button className={styles.goldButton} disabled={busy || loading || !canAfford || confirm !== null} onClick={event => { confirmTrigger.current = event.currentTarget; setConfirm({ type: "buy", listing }); }}>{canAfford ? "Mua vật phẩm" : "Chưa đủ coin"}</button></div>
            {confirming ? <div className={styles.confirmation} role="group" aria-label={`Xác nhận mua ${item.name}`} onKeyDown={event => { if (event.key === "Escape" && !pending) dismissConfirm(); }}><strong>Mua 1 bản sao với {listing.price.toLocaleString("vi-VN")} XCoin?</strong><p>Coin sẽ được chuyển cho người bán. Giao dịch đã hoàn thành không thể hoàn tác.</p><div><button ref={confirmation} className={styles.goldButton} disabled={busy || !canAfford} onClick={() => void mutate("buy", listing)}>{pending ? "Đang giao dịch…" : "Xác nhận mua"}</button><button className={styles.subtleButton} disabled={pending} onClick={dismissConfirm}>Hủy</button></div></div> : null}
          </article>;
        })}</div></> : <div className={styles.empty}><Store size={29} aria-hidden="true"/><h3>{loading || !hydrated ? "Đang kết nối chợ…" : "Chưa có tin khớp bộ lọc"}</h3><p>{filters.wishlistOnly ? "Chưa có người chơi khác rao bán mục tiêu trong wishlist. Bạn có thể giữ mục tiêu và kiểm tra lại sau." : focusedItem ? "Mẫu này chưa có tin bán phù hợp. Thử nới khoảng giá hoặc quay lại sau." : "Thử nới khoảng giá, đổi CLB hoặc xóa bộ lọc."}</p><button className={styles.subtleButton} disabled={busy || confirm !== null} onClick={resetFilters}>Xem toàn bộ chợ</button></div>}
        {market.nextCursor ? <button className={styles.loadMore} disabled={busy || loading || confirm !== null} onClick={() => void load(market.nextCursor!)}>{loading ? "Đang tải…" : "Tải thêm tin bán"}</button> : null}
      </section>
      <aside className={styles.sellPanel}>
        <div className={styles.sellHeading}><Package size={22} aria-hidden="true"/><h2>Đăng bán một bản sao</h2></div><p>Chọn đúng serial muốn bán. Bản sao đã khóa không xuất hiện trong danh sách; mở khóa tại kho nếu bạn muốn sử dụng.</p>
        {sellable.length ? <form onSubmit={event => { event.preventDefault(); if (!busy && sellValid && selectedCopy) setConfirm({ type: "sell", copyId: selectedCopy.id, price: priceNumber }); }}>
          <label className={styles.field}><span>Tìm đồ hoặc serial trong kho</span><input value={sellQuery} disabled={busy || confirm !== null} placeholder="Tên CLB, vật phẩm hoặc serial…" onChange={event => { setSellQuery(event.target.value); setCopyId(""); }}/></label>
          <label className={styles.field}><span>Bản sao muốn bán</span><select value={copyId} disabled={busy || confirm !== null} onChange={event => setCopyId(event.target.value)}><option value="">Chọn đúng 1 bản sao chưa khóa</option>{eligible.map(copy => { const item = getCosmeticById(copy.itemId)!; return <option key={copy.id} value={copy.id}>{item.name} · {item.rarity} · {copy.serial}</option>; })}</select></label>
          {selectedItem && selectedCopy ? <div className={styles.sellPreview}><div><CosmeticArt item={selectedItem} compact animated={false}/></div><p><strong>{selectedItem.name}</strong><span>Serial {selectedCopy.serial}</span><span>Đang có {owned.get(selectedItem.id) ?? 0} bản</span>{lastCopy ? <small>Đây là bản cuối của mẫu này trong kho.</small> : null}{equipped ? <small>Đang trang bị. Bán bản cuối sẽ gỡ món này khỏi hồ sơ.</small> : null}</p></div> : null}
          <label className={styles.field}><span>Giá bán (XCoin)</span><input type="number" min={1} max={MAX_MARKET_PRICE} step={1} inputMode="numeric" required value={price} disabled={busy || confirm !== null} onChange={event => setPrice(event.target.value)} aria-describedby="market-price-note"/></label><small id="market-price-note" className={styles.fieldNote}>Số nguyên từ 1 đến {MAX_MARKET_PRICE.toLocaleString("vi-VN")}. Không có phí giao dịch.</small>
          {confirm?.type === "sell" ? <div className={styles.confirmation} role="group" aria-label="Xác nhận đăng bán" onKeyDown={event => { if (event.key === "Escape" && !pending) dismissConfirm(); }}><strong>Đăng serial {selectedCopy?.serial} với giá {confirm.price.toLocaleString("vi-VN")} XCoin?</strong><p>{lastCopy ? "Đây là bản cuối của mẫu này. " : ""}{equipped && lastCopy ? "Món đang trang bị sẽ được gỡ khỏi hồ sơ. " : ""}Bản sao rời khỏi kho và người khác có thể mua ngay. Không thể thu hồi sau khi đã bán.</p><div><button type="button" ref={confirmation} className={styles.goldButton} disabled={busy || !sellValid} onClick={() => void mutate("sell")}>{pending ? "Đang đăng bán…" : "Xác nhận đăng bản sao"}</button><button type="button" className={styles.subtleButton} disabled={pending} onClick={dismissConfirm}>Hủy</button></div></div> : <button className={styles.goldButton} type="submit" disabled={busy || !sellValid || confirm !== null} onClick={event => { confirmTrigger.current = event.currentTarget; }}>Xem lại và đăng bán</button>}
        </form> : <div className={styles.sellEmpty}><LockKeyhole size={18} aria-hidden="true"/><p>{!hydrated ? "Đang tải bản sao của bạn…" : state.ownedItemIds.length ? "Chưa có bản sao chưa khóa sẵn để bán. Kiểm tra khóa vật phẩm và kết nối kho." : "Kho chưa có vật phẩm sẵn để bán."}</p><Link className={styles.subtleButton} href="/inventory">Kiểm tra kho đồ <ArrowUpRight size={14}/></Link></div>}
        <div className={styles.ownListings}><h3>Tin đang bán của bạn <span>{market.ownListings.length}/{MAX_ACTIVE_LISTINGS}</span></h3>{market.ownListings.length ? market.ownListings.map(listing => <div className={styles.ownListing} key={listing.id}><div><strong>{getCosmeticById(listing.itemId)?.name ?? "Vật phẩm lưu trữ"}</strong><span>{listing.price.toLocaleString("vi-VN")} XCoin</span></div><button className={styles.inlineButton} disabled={busy || confirm !== null} onClick={() => void mutate("cancel", listing)}>Thu hồi</button></div>) : <p>Chưa có bản sao nào đang giữ tại chợ.</p>}</div>
      </aside>
    </div>
    {message ? <EconomyNotice error={actionError}>{message}</EconomyNotice> : null}
    <MarketTransactionHistory history={market.history} ready={hydrated && loaded}/>
    <aside className={styles.policy}><Coins size={20} aria-hidden="true"/><div><h3>Giao dịch rõ ràng, không tự đặt giá</h3><p>Giá do người bán chọn. Giá tham khảo chỉ dùng các giao dịch đã hoàn tất, không phải giá đề xuất của hệ thống. Khi quay lại tab hoặc bấm Làm mới, chợ kiểm tra tin wishlist và giao dịch mới; không chạy vòng cập nhật liên tục.</p><p>XCoin và vật phẩm chỉ phục vụ demo, không có giá trị tiền thật.</p></div></aside>
  </div>;
}
