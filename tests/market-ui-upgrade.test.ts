import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { COSMETICS, cosmeticsByRarity } from "../src/data/cosmetics";
import { CLUBS } from "../src/data/clubs";
import { emptyMarketDraft, marketDraftForItem, marketRefreshActivity, marketSellCopies, validateMarketDraft } from "../src/lib/marketFilters";
import type { ItemCopy } from "../src/types/collector";
import type { MarketPage, MarketTransaction } from "../src/types/economy";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { collectorFixtureDefaults } from "./collectorFixture";
import { createDemoState } from "../src/lib/storage";
import { emptyEconomy } from "../src/data/eventEconomy";

Object.assign(globalThis, { React });
const loadModule = createRequire(import.meta.url), previousCssLoader = loadModule.extensions[".css"];
loadModule.extensions[".css"] = module => { module.exports = {}; };
const { MarketPriceSummary, MarketTransactionHistory, MarketSession } = loadModule("../src/components/economy/PlayerMarket.tsx") as typeof import("../src/components/economy/PlayerMarket");
const { LedgerItemActions } = loadModule("../src/components/collector/ClubLedger.tsx") as typeof import("../src/components/collector/ClubLedger");
if (previousCssLoader) loadModule.extensions[".css"] = previousCssLoader; else delete loadModule.extensions[".css"];
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const item = cosmeticsByRarity("COMMON")[0];
const copy = (id: string, itemId = item.id, locked?: boolean): ItemCopy => ({ id, itemId, locked, serial: `XP-${id}`, origin: "CHEST", mintedAt: "2026-10-12T00:00:00Z", recordedAt: "2026-10-12T00:00:00Z", acquiredAt: "2026-10-12T00:00:00Z", originalOwnerName: null, transferCount: 0 });
const page = (extra: Partial<MarketPage> = {}): MarketPage => ({ listings: [], ownListings: [], nextCursor: null, ...extra });
const receipt = (id: string, side: "buy" | "sell" = "sell"): MarketTransaction => ({ listingId: id, itemId: item.id, price: 25, completedAt: "2026-10-12T00:00:00Z", side });

test("market filters omit blank search/price/catalog fields instead of coercing blank prices to zero", () => {
  assert.deepEqual(validateMarketDraft(emptyMarketDraft()), { error: null, filters: { sort: "newest", wishlistOnly: false } });
  const result = validateMarketDraft({ ...emptyMarketDraft(), minPrice: "0", maxPrice: "1000000", query: "  FPT  ", clubId: CLUBS[0].id, rarity: "MYTHIC", sort: "price-asc", wishlistOnly: true });
  assert.deepEqual(result.filters, { query: "FPT", clubId: CLUBS[0].id, rarity: "MYTHIC", minPrice: 0, maxPrice: 1000000, sort: "price-asc", wishlistOnly: true });
});

test("exact-item deep link accepts a real catalog ID and safely discards an unknown ID", () => {
  assert.equal(marketDraftForItem(item.id).itemId, item.id);
  assert.equal(marketDraftForItem("not-a-catalog-item").itemId, "");
  assert.equal(marketDraftForItem(null).itemId, "");
  assert.equal(validateMarketDraft(marketDraftForItem(item.id)).filters?.itemId, item.id);
});

test("market price bounds reject fractional/exponential/negative/out-of-range/reversed drafts", () => {
  for (const minPrice of ["-1", "1.5", "1e2", "NaN", "1000001"]) assert.ok(validateMarketDraft({ ...emptyMarketDraft(), minPrice }).error);
  assert.ok(validateMarketDraft({ ...emptyMarketDraft(), minPrice: "100", maxPrice: "99" }).error);
  assert.ok(validateMarketDraft({ ...emptyMarketDraft(), maxPrice: "Infinity" }).error);
});

test("market filter validation rejects unknown catalogs, controls and overlong searches", () => {
  for (const patch of [{ rarity: "ULTRA" }, { clubId: "unknown-club" }, { itemId: "unknown-item" }, { query: "a".repeat(81) }, { query: "ab\u200bcd" }, { query: "ab\u0000cd" }]) assert.ok(validateMarketDraft({ ...emptyMarketDraft(), ...patch }).error);
});

test("selling selects unlocked persistent copies only, with legacy optional lock treated as unlocked", () => {
  const copies = [copy("locked", item.id, true), copy("open", item.id, false), copy("legacy")];
  assert.deepEqual(marketSellCopies(copies, [item.id, item.id, item.id]).map(value => value.id), ["open", "legacy"]);
  assert.deepEqual(marketSellCopies(copies, []).map(value => value.id), []);
  assert.deepEqual(marketSellCopies([], [item.id]).map(value => value.id), [], "never substitute a catalog ID when copy identities are unavailable");
});

test("sell-copy derivation ignores repeated identities, unknown IDs and copies beyond inventory count", () => {
  const a = copy("a"), b = copy("b");
  assert.deepEqual(marketSellCopies([a, a, b, copy("bad", "unknown")], [item.id]).map(value => value.id), ["a"]);
  assert.deepEqual(marketSellCopies([a, a, b], [item.id, item.id]).map(value => value.id), ["a", "b"]);
});

test("refresh notifications use new actual sale receipts, not removed listings or purchases", () => {
  const previous = page({ history: [receipt("old")], wishlistMatches: 2 });
  const next = page({ history: [receipt("new"), receipt("buy", "buy"), receipt("old")], wishlistMatches: 4 });
  assert.deepEqual(marketRefreshActivity(previous, next), { newSales: 1, newWishlistMatches: 2 });
  assert.deepEqual(marketRefreshActivity(page({ listings: [{ id: "vanished", itemId: item.id, sellerId: "owner", price: 30, createdAt: "2026-10-12T00:00:00Z" }] }), page()), { newSales: 0, newWishlistMatches: 0 });
  assert.deepEqual(marketRefreshActivity(null, next), { newSales: 0, newWishlistMatches: 0 });
  assert.deepEqual(marketRefreshActivity(page({ wishlistMatches: 10 }), page({ wishlistMatches: 2 })), { newSales: 0, newWishlistMatches: 0 });
});

test("ledger wishlist actions work for undiscovered items, expose pressed state and link exact item", () => {
  for (const wished of [false, true]) {
    const html = renderToStaticMarkup(createElement(LedgerItemActions, { item, wished, disabled: false, onToggle: () => {} }));
    assert.ok(html.includes(`aria-pressed="${wished}"`));
    assert.ok(html.includes(`href="/market?itemId=${encodeURIComponent(item.id)}"`));
    assert.ok(text(html).includes("Tìm trên chợ"));
    assert.ok(html.includes(wished ? "Bỏ khỏi wishlist" : "Thêm vào wishlist"));
  }
  const disabled = renderToStaticMarkup(createElement(LedgerItemActions, { item, wished: false, disabled: true, onToggle: () => {} }));
  assert.ok(disabled.includes("disabled")); assert.ok(disabled.includes('href="/market?itemId='), "read-only market lookup remains usable when writes are gated");
});

test("actual price summary never invents a price when no sales or a different sample is returned", () => {
  for (const summary of [undefined, null, { itemId: item.id, salesCount: 0, minPrice: 99, maxPrice: 99, averagePrice: 99, lastPrice: 99 }, { itemId: COSMETICS[1].id, salesCount: 1, minPrice: 99, maxPrice: 99, averagePrice: 99, lastPrice: 99 }]) {
    const html = renderToStaticMarkup(createElement(MarketPriceSummary, { itemId: item.id, summary }));
    assert.ok(text(html).includes("Chưa có dữ liệu giao dịch")); assert.equal(html.includes("<dd>"), false);
  }
  const actual = renderToStaticMarkup(createElement(MarketPriceSummary, { itemId: item.id, summary: { itemId: item.id, salesCount: 2, minPrice: 10, maxPrice: 20, averagePrice: 15, lastPrice: 20 } }));
  assert.equal((actual.match(/<dd>/g) ?? []).length, 4); assert.ok(text(actual).includes("Từ 2 giao dịch thật")); assert.ok(text(actual).includes("không bảo đảm giá bán tiếp theo"));
});

test("private history renders only completed buy/sell records, capped at 50 with clear empty/loading states", () => {
  const history = Array.from({ length: 55 }, (_, index) => receipt(`r-${index}`, index % 2 ? "buy" : "sell"));
  const html = renderToStaticMarkup(createElement(MarketTransactionHistory, { history, ready: true }));
  assert.equal((html.match(/<li>/g) ?? []).length, 50); assert.ok(text(html).includes("Đã mua")); assert.ok(text(html).includes("Đã bán")); assert.ok(text(html).includes("Chỉ chủ tài khoản nhìn thấy"));
  const empty = renderToStaticMarkup(createElement(MarketTransactionHistory, { history: [], ready: true }));
  assert.ok(text(empty).includes("Đăng bán hoặc thu hồi tin không tính"));
  const loading = renderToStaticMarkup(createElement(MarketTransactionHistory, { history, ready: false }));
  assert.ok(text(loading).includes("Đang tải lịch sử")); assert.equal(loading.includes("<li>"), false);
});

function fixture(): XperienceContextValue {
  return {
    ...collectorFixtureDefaults(), state: createDemoState(), economy: emptyEconomy(0), playerId: "market-ui", hydrated: true, isPlaying: false,
    backendStatus: "ready", backendError: null, retryBackend: async () => {}, demoToolsEnabled: true, canImportLegacy: false, legacyAvailable: false, importLegacy: async () => false,
    economyAction: async () => ({ success: false, reason: "BUSY" }), playGame: async () => ({ success: false, reason: "BUSY" }), tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => true, equipItem: async () => true, unequipItem: async () => true, completeOpening: () => {}, resetDemoData: async () => true, grantTestEx: async () => true,
  };
}

test("market initial UI provides server-wide labeled filters and per-copy serial selector excluding locks", () => {
  const context = fixture(); context.state.ownedItemIds = [item.id, item.id]; context.collector.copies = [copy("open"), copy("locked", item.id, true)];
  const html = renderToStaticMarkup(createElement(XperienceContext.Provider, { value: context }, createElement(MarketSession, { initialItemId: item.id, initialWishlistOnly: true })));
  const visible = text(html);
  assert.ok(visible.includes("Bộ lọc áp dụng trên toàn chợ")); assert.ok(html.includes('aria-label="Bộ lọc toàn chợ"'));
  for (const label of ["Độ hiếm", "Giá từ", "Giá đến", "Sắp xếp", "Chỉ wishlist", "Bản sao muốn bán", "Bỏ lọc vật phẩm"]) assert.ok(visible.includes(label));
  assert.ok(html.includes('<option value="open"')); assert.ok(visible.includes("XP-open")); assert.equal(html.includes('<option value="locked"'), false); assert.equal(visible.includes("XP-locked"), false);
  assert.ok(visible.includes("Đang tìm đúng mẫu")); assert.ok(visible.includes(item.name));
});

test("market integration freezes account scope, aborts stale pools and cannot restart an old filter closure", () => {
  const source = readFileSync(new URL("../src/components/economy/PlayerMarket.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('key={`${playerId ?? "connecting"}:'), "private market state remounts on player identity changes");
  assert.ok(source.includes("<Suspense")); assert.ok(source.includes('search.get("itemId")'));
  assert.ok(source.includes("readMarketplace(cursor, controller.signal, filters)"));
  assert.ok(source.includes("activeFilters.current = filters"));
  assert.ok((source.match(/filters !== activeFilters\.current/g) ?? []).length >= 2, "check both before starting and before committing a captured filter request");
  assert.ok(source.includes("controller.signal.aborted")); assert.ok(source.includes("version !== generation.current"));
  assert.ok(source.includes("copyId: selectedCopy!.id"));
  assert.ok(source.includes('window.removeEventListener("focus", refreshOnReturn)'));
  assert.ok(source.includes('document.removeEventListener("visibilitychange", refreshOnReturn)'));
  assert.equal(source.includes("setInterval("), false); assert.equal(source.includes("setTimeout("), false);
  assert.ok(source.includes("Đây là bản cuối của mẫu này")); assert.ok(source.includes("Món đang trang bị sẽ được gỡ khỏi hồ sơ"));
});
