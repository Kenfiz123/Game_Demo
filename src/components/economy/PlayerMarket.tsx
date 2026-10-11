"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Coins, Package, RefreshCw, Search, Store } from "lucide-react";
import { COSMETICS, getCosmeticById } from "@/data/cosmetics";
import { MAX_ACTIVE_LISTINGS, MAX_MARKET_PRICE } from "@/data/eventEconomy";
import { normalizeClubSearch } from "@/data/clubs";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { RarityBadge } from "@/components/chest/RarityBadge";
import { useXperience } from "@/hooks/useXperience";
import { readMarketplace } from "@/lib/backendClient";
import type { MarketListing, MarketPage } from "@/types/economy";
import { EconomyNav, EconomyNotice, WalletBalance, countInventory, economyError } from "./EconomyChrome";
import styles from "./economy.module.css";

const EMPTY_MARKET: MarketPage = { listings: [], ownListings: [], nextCursor: null };

export function PlayerMarket() {
  const { state, economy, playerId, hydrated, isPlaying, economyAction, retryBackend } = useXperience();
  const [market, setMarket] = useState<MarketPage>(EMPTY_MARKET);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState(false);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [sellQuery, setSellQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("10");
  const [confirm, setConfirm] = useState<{ type: "buy"; listing: MarketListing } | { type: "sell" } | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const confirmation = useRef<HTMLButtonElement>(null);
  const owned = useMemo(() => countInventory(state.ownedItemIds), [state.ownedItemIds]);
  const sellable = useMemo(() => COSMETICS.filter(item => (owned.get(item.id) ?? 0) > 0), [owned]);
  const sellTerm = normalizeClubSearch(sellQuery.trim());
  const eligible = sellable.filter(item => !sellTerm || normalizeClubSearch(item.name + " " + item.description).includes(sellTerm));
  const selectedItem = getCosmeticById(itemId);
  const priceNumber = Number(price);
  const priceValid = price.trim() !== "" && Number.isSafeInteger(priceNumber) && priceNumber >= 1 && priceNumber <= MAX_MARKET_PRICE;
  const sellValid = Boolean(selectedItem && (owned.get(itemId) ?? 0) > 0 && priceValid && market.ownListings.length < MAX_ACTIVE_LISTINGS);
  const busy = !hydrated || isPlaying || pending;
  const term = normalizeClubSearch(query.trim());
  const visible = market.listings.filter(listing => {
    const item = getCosmeticById(listing.itemId);
    return listing.sellerId !== playerId && item && (!term || normalizeClubSearch(item.name + " " + item.description).includes(term));
  });

  const load = useCallback(async (cursor?: string) => {
    if (!hydrated) return;
    request.current?.abort();
    const controller = new AbortController();
    const version = ++generation.current;
    request.current = controller;
    setLoading(true); setLoadError("");
    try {
      const page = await readMarketplace(cursor, controller.signal);
      if (!mounted.current || controller.signal.aborted || version !== generation.current) return;
      setMarket(current => {
        if (!cursor) return page;
        const combined = new Map(current.listings.map(listing => [listing.id, listing]));
        for (const listing of page.listings) combined.set(listing.id, listing);
        return { ...page, listings: [...combined.values()] };
      });
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || version !== generation.current) return;
      setLoadError(error instanceof Error ? error.message : "Không tải được chợ. Hãy kiểm tra backend rồi thử lại.");
    } finally {
      if (mounted.current && version === generation.current) setLoading(false);
    }
  }, [hydrated]);

  useEffect(() => {
    mounted.current = true;
    setMarket(EMPTY_MARKET);
    void load();
    return () => { mounted.current = false; request.current?.abort(); };
  }, [load, playerId]);
  useEffect(() => { if (confirm) confirmation.current?.focus(); }, [confirm]);

  async function mutate(action: "sell" | "buy" | "cancel", listing?: MarketListing) {
    if (inFlight.current || busy || (action === "sell" && !sellValid) || (action !== "sell" && !listing)) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const command = action === "sell" ? { type: "market-list" as const, itemId, price: priceNumber } : action === "buy" ? { type: "market-buy" as const, listingId: listing!.id } : { type: "market-cancel" as const, listingId: listing!.id };
      const result = await economyAction(command);
      if (!mounted.current) return;
      setActionError(!result.success);
      setMessage(result.success ? action === "sell" ? "Đã đăng bán 1 bản sao. Vật phẩm được giữ tại chợ đến khi bán hoặc thu hồi." : action === "buy" ? "Mua thành công. Vật phẩm đã vào kho, XCoin đã chuyển cho người bán." : "Đã thu hồi tin bán. Bản sao đã trở về kho." : economyError(result.reason));
      setConfirm(null);
      if (result.success && action === "sell") setItemId("");
      await load();
    } catch { if (mounted.current) { setActionError(true); setMessage(economyError("STORAGE_UNAVAILABLE")); } }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  return <div className={`page-wrap ${styles.page}`}>
    <header className={styles.pageHeading}><div><h1>Chợ người chơi</h1><p>Một bản sao bạn có. Một dấu ấn người khác đang tìm.</p></div><WalletBalance balance={economy.coinBalance} ready={hydrated}/></header>
    <EconomyNav current="/market"/>
    <div className={styles.marketLayout}>
      <section className={styles.marketBoard} aria-labelledby="market-title">
        <div className={styles.sectionHeading}><div><h2 id="market-title">Đang được chào bán</h2><p>Mỗi tin là 1 bản sao. Giá do người bán đặt bằng XCoin.</p></div><button className={styles.subtleButton} disabled={busy || loading} onClick={() => { setConfirm(null); void (async () => { await retryBackend(); await load(); })(); }}><RefreshCw size={15}/> {loading ? "Đang tải…" : "Làm mới"}</button></div>
        <label className={styles.search}><Search size={17}/><span className="sr-only">Tìm vật phẩm trên chợ đã tải</span><input value={query} placeholder="Tìm tên vật phẩm hoặc CLB…" onChange={event => setQuery(event.target.value)}/></label>
        {loadError && <EconomyNotice error>{loadError} <button className={styles.inlineButton} disabled={busy || loading} onClick={() => void load()}>Thử tải lại</button></EconomyNotice>}
        {visible.length > 0 ? <div className={styles.marketRows}>{visible.map(listing => {
          const item = getCosmeticById(listing.itemId)!;
          const confirming = confirm?.type === "buy" && confirm.listing.id === listing.id;
          const canAfford = economy.coinBalance >= listing.price;
          return <article className={styles.marketRow} key={listing.id}>
            <div className={styles.marketArt}><CosmeticArt item={item} compact animated={false}/></div>
            <div className={styles.marketIdentity}><RarityBadge rarity={item.rarity}/><h3>{item.name}</h3><small>Người chơi {listing.sellerId.slice(0, 8)}</small></div>
            <div className={styles.marketPrice}><strong>{listing.price.toLocaleString("vi")}<span> XCoin</span></strong><button className={styles.goldButton} disabled={busy || !canAfford || confirm !== null} onClick={() => setConfirm({ type: "buy", listing })}>{canAfford ? "Mua vật phẩm" : "Chưa đủ coin"}</button></div>
            {confirming && <div className={styles.confirmation} role="group" aria-label={`Xác nhận mua ${item.name}`} onKeyDown={event => { if (event.key === "Escape" && !pending) setConfirm(null); }}><strong>Mua 1 bản sao với {listing.price.toLocaleString("vi")} XCoin?</strong><p>Coin sẽ được chuyển cho người bán. Giao dịch đã hoàn thành không thể hoàn tác.</p><div><button ref={confirmation} className={styles.goldButton} disabled={busy || !canAfford} onClick={() => void mutate("buy", listing)}>{pending ? "Đang giao dịch…" : "Xác nhận mua"}</button><button className={styles.subtleButton} disabled={pending} onClick={() => setConfirm(null)}>Hủy</button></div></div>}
          </article>;
        })}</div> : <div className={styles.empty}><Store size={29}/><h3>{loading || !hydrated ? "Đang kết nối chợ…" : term ? "Chưa tìm thấy trong các tin đã tải" : "Chưa có tin từ người chơi khác"}</h3><p>{term ? "Đổi từ khóa hoặc tải thêm tin bên dưới." : "Đăng vật phẩm đầu tiên, hoặc mở một phiên người chơi khác để cùng giao dịch."}</p>{term ? <button className={styles.subtleButton} onClick={() => setQuery("")}>Xóa tìm kiếm</button> : <Link href="/events" className={styles.subtleButton}>Nhận XCoin từ sự kiện <ArrowUpRight size={14}/></Link>}</div>}
        {market.nextCursor && <button className={styles.loadMore} disabled={busy || loading} onClick={() => void load(market.nextCursor!)}>{loading ? "Đang tải…" : "Tải thêm tin bán"}</button>}
      </section>
      <aside className={styles.sellPanel}>
        <div className={styles.sellHeading}><Package size={22}/><h2>Đăng bán một bản sao</h2></div>
        <p>Bản sao đăng bán rời khỏi kho và được giữ an toàn tại chợ. Thu hồi bất cứ lúc nào nếu chưa bán.</p>
        {sellable.length ? <form onSubmit={event => { event.preventDefault(); if (!busy && sellValid) setConfirm({ type: "sell" }); }}>
          <label className={styles.field}><span>Lọc đồ trong kho</span><input value={sellQuery} disabled={busy || confirm !== null} placeholder="Tên CLB hoặc vật phẩm…" onChange={event => { setSellQuery(event.target.value); setItemId(""); }}/></label>
          <label className={styles.field}><span>Vật phẩm muốn bán</span><select value={itemId} disabled={busy || confirm !== null} onChange={event => setItemId(event.target.value)}><option value="">Chọn 1 vật phẩm</option>{eligible.map(item => <option key={item.id} value={item.id}>{item.name} · {item.rarity} · có {owned.get(item.id)} bản</option>)}</select></label>
          {selectedItem && <div className={styles.sellPreview}><div><CosmeticArt item={selectedItem} compact animated={false}/></div><p><strong>{selectedItem.name}</strong><span>Đăng bán 1 / {owned.get(itemId) ?? 0} bản sao</span>{Object.values(state.equipped).includes(itemId) && <small>Đang trang bị. Nếu bán bản cuối, món này sẽ được gỡ khỏi hồ sơ.</small>}</p></div>}
          <label className={styles.field}><span>Giá bán (XCoin)</span><input type="number" min={1} max={MAX_MARKET_PRICE} step={1} inputMode="numeric" required value={price} disabled={busy || confirm !== null} onChange={event => setPrice(event.target.value)} aria-describedby="market-price-note"/></label><small id="market-price-note" className={styles.fieldNote}>Số nguyên từ 1 đến {MAX_MARKET_PRICE.toLocaleString("vi")}. Không có phí giao dịch.</small>
          {confirm?.type === "sell" ? <div className={styles.confirmation} role="group" aria-label="Xác nhận đăng bán" onKeyDown={event => { if (event.key === "Escape" && !pending) setConfirm(null); }}><strong>Đăng 1 bản sao với giá {priceNumber.toLocaleString("vi")} XCoin?</strong><p>Người chơi khác có thể mua ngay sau khi đăng.</p><div><button type="button" ref={confirmation} className={styles.goldButton} disabled={busy || !sellValid} onClick={() => void mutate("sell")}>{pending ? "Đang đăng bán…" : "Xác nhận đăng bán"}</button><button type="button" className={styles.subtleButton} disabled={pending} onClick={() => setConfirm(null)}>Hủy</button></div></div> : <button className={styles.goldButton} type="submit" disabled={busy || !sellValid || confirm !== null}>Xem lại và đăng bán</button>}
        </form> : <div className={styles.sellEmpty}><p>{hydrated ? "Kho chưa có vật phẩm sẵn để bán." : "Đang tải kho của bạn…"}</p><Link className={styles.subtleButton} href="/chest">Mở rương để sưu tầm <ArrowUpRight size={14}/></Link></div>}
        <div className={styles.ownListings}><h3>Tin đang bán của bạn <span>{market.ownListings.length}/{MAX_ACTIVE_LISTINGS}</span></h3>{market.ownListings.length ? market.ownListings.map(listing => <div className={styles.ownListing} key={listing.id}><div><strong>{getCosmeticById(listing.itemId)?.name ?? "Vật phẩm lưu trữ"}</strong><span>{listing.price.toLocaleString("vi")} XCoin</span></div><button className={styles.inlineButton} disabled={busy || confirm !== null} onClick={() => void mutate("cancel", listing)}>Thu hồi</button></div>) : <p>Chưa có bản sao nào đang giữ tại chợ.</p>}</div>
      </aside>
    </div>
    {message && <EconomyNotice error={actionError}>{message}</EconomyNotice>}
    <aside className={styles.policy}><Coins size={20}/><div><h3>Thử giao dịch giữa hai người chơi</h3><p>Mở ứng dụng trong trình duyệt khác hoặc cửa sổ ẩn danh. Các tab cùng hồ sơ trình duyệt dùng chung một ví. Nhận XCoin ở Sự kiện, đăng bán ở một phiên và mua ở phiên còn lại. Bấm Làm mới để cập nhật chợ.</p><p>XCoin và vật phẩm chỉ phục vụ demo, không có giá trị tiền thật.</p></div></aside>
  </div>;
}
