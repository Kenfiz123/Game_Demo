import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { deriveClubCollection } from "../src/lib/collectorCatalog";
import { CollectorGallery } from "../src/components/collector/CollectorGallery";
import type { ItemPassport } from "../src/types/collector";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { createDemoState } from "../src/lib/storage";
import { emptyEconomy } from "../src/data/eventEconomy";
import { collectorFixtureDefaults } from "./collectorFixture";

Object.assign(globalThis, { React });
const loadModule = createRequire(import.meta.url);
const previousCssLoader = loadModule.extensions[".css"];
loadModule.extensions[".css"] = module => { module.exports = {}; };
const { ItemPassportContent } = loadModule("../src/components/collector/ItemPassportDialog.tsx") as typeof import("../src/components/collector/ItemPassportDialog");
const { ClubCompletionBadge, ClubLedger } = loadModule("../src/components/collector/ClubLedger.tsx") as typeof import("../src/components/collector/ClubLedger");
const { CollectorProfile } = loadModule("../src/components/collector/CollectorProfile.tsx") as typeof import("../src/components/collector/CollectorProfile");
if (previousCssLoader) loadModule.extensions[".css"] = previousCssLoader;
else delete loadModule.extensions[".css"];
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function fixture() {
  const context: XperienceContextValue = {
    ...collectorFixtureDefaults(), state: createDemoState(), economy: emptyEconomy(0), playerId: "collector-ui", hydrated: true, isPlaying: false,
    backendStatus: "ready", backendError: null, retryBackend: async () => {}, demoToolsEnabled: true, canImportLegacy: false, legacyAvailable: false, importLegacy: async () => false,
    economyAction: async () => ({ success: false, reason: "BUSY" }), playGame: async () => ({ success: false, reason: "BUSY" }), tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => true, equipItem: async () => true, unequipItem: async () => true, completeOpening: () => {}, resetDemoData: async () => true, grantTestEx: async () => true,
  };
  return { context, render: (Component: React.ComponentType) => renderToStaticMarkup(createElement(XperienceContext.Provider, { value: context }, createElement(Component))) };
}

test("showroom gives one selected hero motion while three preview selectors stay static", () => {
  const items = cosmeticsByRarity("MYTHIC").slice(0, 3);
  const html = renderToStaticMarkup(createElement(CollectorGallery, { displayName: "Nhà sưu tầm Ken", bio: "Bảo vật của tôi", username: "ken", items }));
  assert.ok(text(html).includes("Nhà sưu tầm Ken"));
  assert.ok(text(html).includes("@ken"));
  assert.equal((html.match(/data-motion-enabled="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-motion-enabled="false"/g) ?? []).length, 3);
  assert.ok(html.includes('aria-label="Chọn bảo vật trưng bày"'));
  assert.ok(html.includes('aria-pressed="true"'));
});

test("empty own showroom explains no grants and points to chest; public empty showroom has no grant action", () => {
  const own = renderToStaticMarkup(createElement(CollectorGallery, { displayName: "Khách", bio: "", items: [] }));
  assert.ok(text(own).includes("không cấp thêm hay tiêu hao vật phẩm")); assert.ok(own.includes('href="/chest"'));
  const publicHtml = renderToStaticMarkup(createElement(CollectorGallery, { displayName: "Khách", bio: "", items: [], publicView: true }));
  assert.ok(text(publicHtml).includes("Chưa có bảo vật được trưng bày")); assert.equal(publicHtml.includes('href="/chest"'), false);
});

test("completion badge renders only when every unique catalog slot has been discovered", () => {
  const empty = deriveClubCollection([], [])[0];
  assert.equal(renderToStaticMarkup(createElement(ClubCompletionBadge, { row: empty })), "");
  const complete = deriveClubCollection(empty.items.map(item => item.id), [])[0];
  assert.ok(text(renderToStaticMarkup(createElement(ClubCompletionBadge, { row: complete }))).includes("Bộ hoàn chỉnh"));
});

test("passport renders copy serial and provenance without inventing a legacy mint timestamp", () => {
  const passport: ItemPassport = { copy: { id: "copy-1", itemId: cosmeticsByRarity("MYTHIC")[0].id, serial: "XP-000001", origin: "LEGACY", mintedAt: null, recordedAt: "2026-10-11T10:00:00Z", acquiredAt: "2026-10-11T10:00:00Z", originalOwnerName: null, transferCount: 0 }, trail: [{ kind: "MINT", timestamp: "2026-10-11T10:00:00Z", ownerName: null }] };
  const html = renderToStaticMarkup(createElement(ItemPassportContent, { passport }));
  assert.ok(text(html).includes("XP-000001")); assert.ok(text(html).includes("Không có thời điểm gốc"));
  assert.ok(text(html).includes("Không suy đoán ngày mở")); assert.ok(text(html).includes("không phải NFT"));
  assert.equal(html.includes("copy-1"), false);
  assert.ok(text(html).includes("Mốc đồng bộ kho hiện tại"));
  assert.ok(text(html).includes("Chưa được ghi nhận"));
});

test("passport user dismissal does not subscribe to cleanup-generated native close events", () => {
  const source = readFileSync(new URL("../src/components/collector/ItemPassportDialog.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("node?.showModal()"));
  assert.ok(source.includes("node?.close()"));
  assert.ok(source.includes("onCancel={"));
  assert.equal(source.includes("onClose={() => closeRef.current()}"), false, "React Strict Mode cleanup must not dismiss the remounted dialog");
  const inventoryRoute = readFileSync(new URL("../src/app/inventory/page.tsx", import.meta.url), "utf8");
  assert.ok(inventoryRoute.includes('import "@/components/collector/collector.css"'), "passport styles load before the lazy dialog opens");
  const css = readFileSync(new URL("../src/components/collector/collector.css", import.meta.url), "utf8");
  assert.ok(css.includes(".collector-passport-dialog { inset: 0; margin: auto;"), "reset CSS must not anchor the native modal to the top left");
});

test("private profile waits for hydration before exposing editable persisted fields", () => {
  const harness = fixture(); harness.context.hydrated = false;
  const html = harness.render(CollectorProfile);
  assert.ok(text(html).includes("Đang tải hồ sơ")); assert.equal(html.includes("<input"), false); assert.equal(html.includes("<select"), false);
});

test("guest profile keeps publication disabled and never exhibits an unowned saved item", () => {
  const harness = fixture(), mythic = cosmeticsByRarity("MYTHIC")[0];
  harness.context.collector.profile.featuredItemIds = [mythic.id];
  harness.context.collector.profile.displayName = "Nhà sưu tầm Khách";
  const html = harness.render(CollectorProfile);
  assert.ok(text(html).includes("Nhà sưu tầm Khách"));
  assert.ok(html.includes('maxLength="180"'));
  assert.ok(html.includes('href="/account"'));
  assert.equal(html.includes(`data-showroom-item="${mythic.id}"`), false);
  assert.equal(html.includes('href="/profile/'), false);
  const checkbox = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0];
  assert.ok(checkbox?.includes("disabled")); assert.equal(checkbox?.includes("checked"), false);
});

test("own profile uses saved identity and three selects containing only owned Mythics", () => {
  const harness = fixture(), mythic = cosmeticsByRarity("MYTHIC")[0], common = cosmeticsByRarity("COMMON")[0];
  harness.context.state.ownedItemIds = [mythic.id, mythic.id, common.id];
  harness.context.collector.profile.featuredItemIds = [mythic.id];
  const html = harness.render(CollectorProfile);
  assert.equal((html.match(/<select/g) ?? []).length, 3);
  assert.equal((html.match(new RegExp(`<option value="${mythic.id}"`, "g")) ?? []).length, 3);
  assert.equal(html.includes(`<option value="${common.id}"`), false);
  assert.ok(html.includes(`data-showroom-item="${mythic.id}"`));
});

test("ledger initially renders twelve static CLB covers without mounting 949 artwork cards", () => {
  const harness = fixture(), html = harness.render(ClubLedger);
  assert.equal((html.match(/<article/g) ?? []).length, 12);
  assert.ok(text(html).includes("73 CLB")); assert.ok(text(html).includes("Trang 1 / 7"));
  assert.equal(html.includes('data-motion-enabled="true"'), false);
  assert.equal(html.includes('class="collector-slot"'), false);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 12);
});
