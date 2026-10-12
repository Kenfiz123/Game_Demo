import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { countItemIds, getUnlockedCounts, safeSurplusQuickPick, selectionProtectionWarnings, type ProtectionCopy } from "../src/lib/itemProtection";
import { CosmeticCard } from "../src/components/inventory/CosmeticCard";
import { filterInventoryItems, type InventoryFilters } from "../src/components/inventory/InventoryGrid";
import { SelectionProtectionWarning } from "../src/components/inventory/SelectionProtectionWarning";
import { TradeUpGame } from "../src/components/trade-up/TradeUpGame";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { createDemoState } from "../src/lib/storage";
import { emptyEconomy } from "../src/data/eventEconomy";
import { collectorFixtureDefaults } from "./collectorFixture";
import type { ItemCopy } from "../src/types/collector";

Object.assign(globalThis, { React });
const loadModule = createRequire(import.meta.url), previousCssLoader = loadModule.extensions[".css"];
loadModule.extensions[".css"] = module => { module.exports = {}; };
const { MythicForge } = loadModule("../src/components/economy/MythicForge.tsx") as typeof import("../src/components/economy/MythicForge");
if (previousCssLoader) loadModule.extensions[".css"] = previousCssLoader;
else delete loadModule.extensions[".css"];
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const copies = (itemId: string, count: number, locked = 0): ProtectionCopy[] => Array.from({ length: count }, (_, index) => ({ id: `${itemId}-${index}`, itemId, locked: index < locked }));
const fullCopies = (itemId: string, count: number, locked = 0): ItemCopy[] => copies(itemId, count, locked).map((copy, index) => ({
  ...copy, serial: `XP-${String(index).padStart(16, "0")}`, origin: "CHEST", mintedAt: "2026-10-12T00:00:00Z", recordedAt: "2026-10-12T00:00:00Z", acquiredAt: "2026-10-12T00:00:00Z", originalOwnerName: null, transferCount: 0,
}));
function context(): XperienceContextValue {
  return { ...collectorFixtureDefaults(), state: createDemoState(), economy: emptyEconomy(0), playerId: "protection-player", hydrated: true, isPlaying: false,
    backendStatus: "ready", backendError: null, demoToolsEnabled: true, canImportLegacy: false, legacyAvailable: false, importLegacy: async () => false, retryBackend: async () => {},
    economyAction: async () => ({ success: false, reason: "BUSY" }), playGame: async () => ({ success: false, reason: "BUSY" }), tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => true, equipItem: async () => true, unequipItem: async () => true, completeOpening: () => {}, resetDemoData: async () => true, grantTestEx: async () => true };
}
const render = (Component: ComponentType, value = context()) => renderToStaticMarkup(createElement(XperienceContext.Provider, { value }, createElement(Component)));

test("unlocked counts are per persistent copy, bounded by ownership, and never manufacture missing metadata", () => {
  const owned = ["a", "a", "a", "b"], ledger = [...copies("a", 3, 2), ...copies("b", 2), ...copies("not-owned", 2)];
  const before = structuredClone({ owned, ledger });
  assert.deepEqual([...getUnlockedCounts(owned, ledger)], [["a", 1], ["b", 1]]);
  assert.deepEqual([...getUnlockedCounts(owned, [])], []);
  assert.deepEqual([...countItemIds(owned)], [["a", 3], ["b", 1]]);
  assert.deepEqual({ owned, ledger }, before);
});

test("old copies without lock flags remain usable but duplicate copy identities cannot inflate availability", () => {
  const old = { id: "old", itemId: "a" };
  assert.deepEqual([...getUnlockedCounts(["a", "a", "a"], [old, old, ...copies("a", 1, 1)])], [["a", 1]]);
  assert.deepEqual([...getUnlockedCounts(["a"], copies("a", 1, 1))], []);
});

test("quick pick keeps the final catalog copy even when five distinct items are otherwise eligible", () => {
  const ids = ["a", "b", "c", "d", "e"], ledger = ids.flatMap(id => copies(id, 1));
  assert.deepEqual(safeSurplusQuickPick(ids, ids, ledger, new Set()), []);
  assert.deepEqual(safeSurplusQuickPick(["a"], Array(6).fill("a"), copies("a", 6), new Set()), Array(5).fill("a"));
});

test("quick pick excludes equipped catalog items entirely and never counts locked copies as ingredients", () => {
  const owned = [...Array(8).fill("equipped"), ...Array(7).fill("a"), "b", "b"];
  const ledger = [...copies("equipped", 8), ...copies("a", 7, 4), ...copies("b", 2)];
  assert.deepEqual(safeSurplusQuickPick(["equipped", "a", "b"], owned, ledger, new Set(["equipped"])), ["a", "a", "a", "b"]);
  assert.deepEqual(safeSurplusQuickPick(["a"], Array(6).fill("a"), copies("a", 6, 6), new Set()), []);
});

test("quick-pick order is deterministic, deduplicates candidates, respects limit and never mutates inputs", () => {
  const owned = ["a", "a", "b", "b", "b"], ledger = [...copies("a", 2), ...copies("b", 3)], candidates = ["a", "a", "b"], equipped = new Set<string>();
  const before = structuredClone({ owned, ledger, candidates });
  assert.deepEqual(safeSurplusQuickPick(candidates, owned, ledger, equipped), ["a", "b", "b"]);
  assert.deepEqual(safeSurplusQuickPick(candidates, owned, ledger, equipped, 2), ["a", "b"]);
  for (const limit of [0, -1, .5, Infinity]) assert.deepEqual(safeSurplusQuickPick(candidates, owned, ledger, equipped, limit), []);
  assert.deepEqual({ owned, ledger, candidates }, before);
});

test("manual last-copy and equipped selections produce explicit warnings without banning selection", () => {
  const warning = selectionProtectionWarnings(["a", "a", "b"], ["a", "a", "b", "b"], new Set(["b", "not-selected"]));
  assert.deepEqual(warning, { lastCopyIds: ["a"], lastUnlockedCopyIds: [], equippedItemIds: ["b"] });
  assert.deepEqual(selectionProtectionWarnings(["a"], ["a", "a"], new Set()), { lastCopyIds: [], lastUnlockedCopyIds: [], equippedItemIds: [] });
  assert.deepEqual(selectionProtectionWarnings(["unknown"], [], new Set()).lastCopyIds, []);
});

test("using the last unlocked copy is distinguished from using the final catalog copy", () => {
  const warnings = selectionProtectionWarnings(["a", "a"], ["a", "a", "a"], new Set(), new Map([["a", 2]]));
  assert.deepEqual(warnings, { lastCopyIds: [], lastUnlockedCopyIds: ["a"], equippedItemIds: [] });
});

test("lock and wishlist inventory filters compose without changing quantities or dropping other filters", () => {
  const a = cosmeticsByRarity("COMMON")[0], b = cosmeticsByRarity("RARE")[0], quantities = new Map([[a.id, 2], [b.id, 1]]);
  const base: InventoryFilters = { query: "", type: "ALL", rarity: "ALL", club: "", duplicatesOnly: false, equippedOnly: false, sort: "rarity" };
  const protection = { lockedIds: new Set([a.id]), wishlistIds: new Set([a.id, b.id]) };
  assert.deepEqual(filterInventoryItems([a, b], quantities, new Set(), { ...base, lockedOnly: true, wishlistOnly: true }, protection), [a]);
  assert.deepEqual(filterInventoryItems([a, b], quantities, new Set(), { ...base, lockedOnly: true, rarity: "RARE" }, protection), []);
  assert.deepEqual(filterInventoryItems([a, b], quantities, new Set(), { ...base, wishlistOnly: true }), []);
  assert.deepEqual([...quantities], [[a.id, 2], [b.id, 1]]);
});

test("owned cards expose lock status by serial and a separate accessible action for each selected copy", () => {
  const item = cosmeticsByRarity("COMMON")[0], value = context(), ledger = fullCopies(item.id, 2, 1);
  value.state.ownedItemIds = [item.id, item.id]; value.collector.copies = ledger;
  const Card = () => createElement(CosmeticCard, { item, quantity: 2, copies: ledger, onInspect: () => {} });
  const html = render(Card, value), visible = text(html);
  for (const copy of ledger) assert.ok(html.includes(`value="${copy.id}"`));
  assert.ok(visible.includes("Đã khóa")); assert.ok(visible.includes("Chưa khóa"));
  assert.ok(html.includes(`aria-label="Mở khóa bản sao ${item.name}, serial ${ledger[0].serial}"`));
  assert.ok(html.includes('class="copy-lock-button"'));
  assert.ok(visible.includes("Không bán / đổi / luyện"));
  value.isPlaying = true;
  assert.match(render(Card, value), /class="copy-lock-button"[^>]*disabled=""/);
});

test("wishlist works on catalog cards independently of ownership or locks and never nests buttons", () => {
  const item = cosmeticsByRarity("COMMON")[0], value = context(); value.collector.wishlistItemIds = [item.id];
  const html = render(() => createElement(CosmeticCard, { item }), value);
  assert.ok(html.includes(`aria-label="Bỏ yêu thích ${item.name}"`)); assert.ok(text(html).includes("Đã yêu thích"));
  assert.equal(html.includes("copy-lock-button"), false);
  let depth = 0;
  for (const tag of html.matchAll(/<\/?button\b[^>]*>/g)) {
    if (tag[0].startsWith("</")) depth -= 1;
    else { assert.equal(depth, 0, "buttons must remain siblings, never nested"); depth += 1; }
  }
  assert.equal(depth, 0);
});

test("risk confirmation separately explains final copy, last unlocked and equipped consequences", () => {
  const item = cosmeticsByRarity("COMMON")[0];
  const html = renderToStaticMarkup(createElement(SelectionProtectionWarning, { lastCopyIds: [item.id], lastUnlockedCopyIds: [], equippedItemIds: [item.id], accepted: false, disabled: false, onAccept: () => {} }));
  assert.ok(text(html).includes("Mẫu này sẽ không còn trong kho"));
  assert.ok(text(html).includes("vật phẩm được trang bị"));
  assert.ok(text(html).includes("Tôi vẫn muốn tiêu hao những bản sao này"));
  assert.ok(html.includes('type="checkbox"')); assert.equal(html.includes('checked=""'), false);
  const lockedRemainder = renderToStaticMarkup(createElement(SelectionProtectionWarning, { lastCopyIds: [], lastUnlockedCopyIds: [item.id], equippedItemIds: [], accepted: true, disabled: true, onAccept: () => {} }));
  assert.ok(text(lockedRemainder).includes("Những bản đã khóa vẫn được giữ nguyên"));
  assert.ok(lockedRemainder.includes('checked=""')); assert.ok(lockedRemainder.includes('disabled=""'));
});

test("trade-up and forge picker availability excludes locked copies, keeping manual single-copy choice available", () => {
  for (const [rarity, Component] of [["COMMON", TradeUpGame], ["LEGENDARY", MythicForge]] as const) {
    const item = cosmeticsByRarity(rarity)[0], value = context();
    value.state.ownedItemIds = Array(6).fill(item.id); value.collector.copies = fullCopies(item.id, 6, 5);
    const html = render(Component, value), visible = text(html);
    assert.ok(visible.includes("1 bản chưa khóa · 5 bản được bảo vệ"));
    assert.ok(html.includes(`aria-label="Thêm ${item.name}, còn 1 bản sao"`), "manual final-unlocked selection remains available");
    assert.match(html, /<button[^>]*disabled=""[^>]*>Chọn nhanh 5 bản dư<\/button>/);
    value.collector.copies = fullCopies(item.id, 6, 6);
    assert.equal(render(Component, value).includes(`aria-label="Thêm ${item.name}`), false);
  }
});

test("destructive UI uses shared safe selection and requires risk acceptance again when actor or stock changes", () => {
  for (const file of ["../src/components/trade-up/TradeUpGame.tsx", "../src/components/economy/MythicForge.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const fragment of ["getUnlockedCounts(state.ownedItemIds, collector.copies)", "safeSurplusQuickPick(", "selectionProtectionWarnings(", "JSON.stringify([playerId, selected", "if (!protectionAccepted) return;", "!protectionAccepted}", "<SelectionProtectionWarning"]) assert.ok(source.includes(fragment), `${file}: ${fragment}`);
  }
});

test("protection controls provide synchronous busy guards, recoverable failures and reduced-motion styling", () => {
  const source = readFileSync(new URL("../src/components/inventory/CosmeticCard.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("if (inFlight.current || !hydrated || isPlaying) return;"));
  assert.ok(source.includes("await setCopyLock(selected.id, !protectedCopy)"));
  assert.ok(source.includes("await setWishlist(item.id, !wished)"));
  assert.ok(source.includes("if (mounted.current)"));
  assert.ok(source.includes('role="status"'));
  const css = readFileSync(new URL("../src/components/inventory/itemProtection.css", import.meta.url), "utf8");
  assert.ok(css.includes(":focus-visible")); assert.ok(css.includes("prefers-reduced-motion"));
  assert.equal(/transition\s*:\s*all\b/.test(css), false); assert.equal(css.includes("@keyframes"), false);
});
