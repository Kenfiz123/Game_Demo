import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { InventoryGrid, filterInventoryItems, shouldRestoreInventoryFocus, type InventoryFilters } from "../src/components/inventory/InventoryGrid";
import { CosmeticCard } from "../src/components/inventory/CosmeticCard";
import { EquippedProfile } from "../src/components/inventory/EquippedProfile";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { getClubById, normalizeClubSearch } from "../src/data/clubs";
import { createDemoState } from "../src/lib/storage";
import { emptyEconomy } from "../src/data/eventEconomy";
import { collectorFixtureDefaults } from "./collectorFixture";
import type { EquipSlot, XperienceState } from "../src/types/gamification";
import type { ItemCopy } from "../src/types/collector";

Object.assign(globalThis, { React });
const base: InventoryFilters = { query: "", type: "ALL", rarity: "ALL", club: "", duplicatesOnly: false, equippedOnly: false, sort: "rarity" };
function render(Component: ComponentType, state: XperienceState = createDemoState(), hydrated = true) {
  const context: XperienceContextValue = {
    ...collectorFixtureDefaults(),
    economy: emptyEconomy(0), playerId: "test-player", economyAction: async () => ({ success: false, reason: "BUSY" }),
    state, hydrated, isPlaying: false,
    backendStatus: "ready", backendError: null, retryBackend: async () => {}, demoToolsEnabled: true,
    canImportLegacy: false, legacyAvailable: false, importLegacy: async () => false,
    playGame: async () => ({ success: false, reason: "BUSY" }), tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => true, equipItem: async () => true, unequipItem: async () => true,
    completeOpening: () => {}, resetDemoData: async () => true, grantTestEx: async () => true,
  };
  return renderToStaticMarkup(createElement(XperienceContext.Provider, { value: context }, createElement(Component)));
}

test("inventory search matches Vietnamese names, club names and heritage without accents", () => {
  const mythic = cosmeticsByRarity("MYTHIC").find(item => item.heritage)!, common = cosmeticsByRarity("COMMON")[0];
  const club = getClubById(mythic.clubId!)!, quantities = new Map([[mythic.id, 2], [common.id, 1]]), items = [mythic, common];
  for (const query of [normalizeClubSearch(mythic.name), normalizeClubSearch(club.name), "  " + normalizeClubSearch(mythic.heritage!) + "  "]) {
    assert.ok(filterInventoryItems(items, quantities, new Set(), { ...base, query }).some(item => item.id === mythic.id), query);
  }
  assert.deepEqual(filterInventoryItems(items, quantities, new Set(), { ...base, query: "khong-the-co-trong-kho-123" }), []);
});

test("owned duplicate cards expose every serial while catalog previews have no private passport action", () => {
  const item = cosmeticsByRarity("COMMON")[0];
  const copies: ItemCopy[] = ["00000001", "00000002"].map((suffix, index) => ({
    id: `00000000-0000-4000-8000-0000${suffix}`, itemId: item.id, serial: `XP-00000000${suffix}`, origin: "LEGACY",
    mintedAt: null, recordedAt: "2026-10-11T10:00:00Z", acquiredAt: "2026-10-11T10:00:00Z", originalOwnerName: null, transferCount: index,
  }));
  const Card = () => createElement(CosmeticCard, { item, quantity: 2, copies, onInspect: () => {} });
  const html = render(Card);
  for (const copy of copies) assert.ok(html.includes(`value="${copy.id}"`));
  assert.ok(html.includes("Chọn bản sao (2)"));
  assert.ok(html.includes("Dấu ấn bản sao"));
  const Preview = () => createElement(CosmeticCard, { item, copies, onInspect: () => {} });
  assert.equal(render(Preview).includes("Dấu ấn bản sao"), false);
});

test("inventory filters compose, sort without mutation and never manufacture extra copies", () => {
  const common = cosmeticsByRarity("COMMON")[0], rare = cosmeticsByRarity("RARE")[0], mythic = cosmeticsByRarity("MYTHIC")[0];
  const items = [common, mythic, rare], quantities = new Map([[common.id, 8], [rare.id, 3], [mythic.id, 2]]), equipped = new Set([mythic.id]);
  const originals = items.map(item => item.id), copyCounts = [...quantities];
  assert.deepEqual(filterInventoryItems(items, quantities, equipped, base).map(item => item.id), [mythic.id, rare.id, common.id]);
  assert.deepEqual(filterInventoryItems(items, quantities, equipped, { ...base, sort: "quantity" }).map(item => item.id), [common.id, rare.id, mythic.id]);
  assert.deepEqual(filterInventoryItems(items, quantities, equipped, { ...base, equippedOnly: true, duplicatesOnly: true, rarity: "MYTHIC", type: mythic.type, club: mythic.clubId! }), [mythic]);
  assert.deepEqual(filterInventoryItems(items, quantities, equipped, { ...base, equippedOnly: true, rarity: "COMMON" }), []);
  assert.deepEqual(items.map(item => item.id), originals);
  assert.deepEqual([...quantities], copyCounts);
});

test("inventory exposes labeled native search and sorting plus actionable empty/loading states", () => {
  const state = createDemoState(), before = JSON.stringify(state), html = render(InventoryGrid, state);
  assert.ok(html.includes('for="inventory-search"'));
  assert.ok(html.includes('type="search"'));
  for (const text of ["Sắp xếp", "Độ hiếm cao nhất", "Tên A–Z", "Nhiều bản nhất", "Kho đồ đang chờ khám phá", 'href="/chest"']) assert.ok(html.includes(text), text);
  const loading = render(InventoryGrid, state, false);
  assert.ok(loading.includes('aria-label="Đang tải bộ sưu tập"'));
  assert.equal((loading.match(/class="inventory-skeleton"/g) ?? []).length, 8);
  assert.equal(loading.includes('class="equipped-profile panel"'), false);
  assert.equal(JSON.stringify(state), before);
});

test("equipped badges require real ownership and the profile distinguishes its empty avatar", () => {
  const mythic = cosmeticsByRarity("MYTHIC").find(item => item.type === "EFFECT")!, state = createDemoState();
  state.equipped[mythic.type as EquipSlot] = mythic.id;
  const Card = () => createElement(CosmeticCard, { item: mythic, quantity: 1 });
  assert.equal(render(Card, state).includes('class="mythic-equipped-indicator"'), false);
  state.ownedItemIds = [mythic.id, mythic.id];
  const before = JSON.stringify(state), html = render(Card, state), profile = render(EquippedProfile, state);
  assert.ok(html.includes('class="mythic-equipped-indicator"'));
  assert.ok(html.includes('data-equipped="true"'));
  assert.ok(profile.includes("CHƯA TRANG BỊ AVATAR"));
  assert.ok(profile.includes('aria-label="Số vị trí đã trang bị"'));
  assert.ok(profile.includes('max="5" value="1"'));
  assert.equal(JSON.stringify(state), before);
});

test("inventory polish gates hover motion and removes transitions for reduced motion", () => {
  const css = readFileSync(new URL("../src/app/inventory-premium.css", import.meta.url), "utf8");
  assert.ok(css.includes("@media (hover: hover) and (pointer: fine)"));
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.equal(/transition\s*:\s*all\b/.test(css), false);
  assert.equal(/@keyframes/.test(css), false, "item motion stays in the existing visibility-gated renderer");
  assert.ok(css.includes("button:focus-visible { transition: none; }"));
});

test("removing a focused equipped-only card restores focus without hijacking search or background updates", () => {
  assert.equal(shouldRestoreInventoryFocus(true, { isConnected: false }, true, true), true);
  assert.equal(shouldRestoreInventoryFocus(true, { isConnected: true }, true, true), false, "a surviving card keeps its focus");
  assert.equal(shouldRestoreInventoryFocus(true, { isConnected: false }, false, true), false, "never move focus from search or another control");
  assert.equal(shouldRestoreInventoryFocus(true, { isConnected: false }, true, false), false, "a background document never receives focus");
  assert.equal(shouldRestoreInventoryFocus(false, { isConnected: false }, true, true), false, "normal inventory updates do not trigger recovery");
  assert.equal(shouldRestoreInventoryFocus(true, null, true, true), false, "an unfocused item never triggers recovery");
  const source = readFileSync(new URL("../src/components/inventory/InventoryGrid.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("ref={equippedOnlyControl}"));
  assert.ok(source.includes("equippedOnlyControl.current?.focus()"));
  assert.ok(source.includes("onFocusCapture="));
  assert.ok(source.includes("onBlurCapture="));
  assert.ok(source.includes("if (event.relatedTarget !== null) focusedCard.current = null;"), "removal blur can occur while the old button is still connected");
  assert.ok(source.includes('document.addEventListener("pointerdown", clearOutsidePointerFocus, { capture: true, passive: true })'), "an explicit pointer action outside the card clears stale intent");
  assert.ok(source.includes('document.removeEventListener("pointerdown", clearOutsidePointerFocus, true)'), "the capture listener is cleaned up on navigation");
  assert.ok(source.indexOf("<small>{inventoryMessage}</small>") < source.indexOf("{!hydrated ?"), "the live status must survive disappearing cards and empty results");
});

test("pending equip buttons remain focusable until removal while announcing busy state and rejecting repeated actions", () => {
  const source = readFileSync(new URL("../src/components/inventory/CosmeticCard.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("const unavailable = !hydrated || !owned || isPlaying;"));
  assert.ok(source.includes("disabled={unavailable}"), "only truly unavailable controls use native disabled");
  assert.ok(source.includes("aria-disabled={unavailable || pending ? true : undefined}"), "pending controls remain semantically unavailable without early blur");
  assert.ok(source.includes("aria-busy={pending}"));
  assert.ok(source.includes("if (inFlight.current || !hydrated || !owned || isPlaying) return;"), "repeat keyboard/click events cannot write twice");
  assert.ok(source.indexOf("inFlight.current = true;") < source.indexOf("setPending(true)"), "the synchronous guard precedes the async busy render");
});
