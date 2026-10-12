import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { emptyEconomy, FORGE_RULE_VERSION } from "../src/data/eventEconomy";
import { createDemoState } from "../src/lib/storage";
import { collectorFixtureDefaults } from "./collectorFixture";

Object.assign(globalThis, { React });
// Node does not load Next's CSS modules. Keep this SSR fixture independent of the stylesheet.
const loadModule = createRequire(import.meta.url);
const previousCssLoader = loadModule.extensions[".css"];
loadModule.extensions[".css"] = module => { module.exports = {}; };
const { MythicForge } = loadModule("../src/components/economy/MythicForge.tsx") as typeof import("../src/components/economy/MythicForge");
const { economyError } = loadModule("../src/components/economy/EconomyChrome.tsx") as typeof import("../src/components/economy/EconomyChrome");
if (previousCssLoader) loadModule.extensions[".css"] = previousCssLoader;
else delete loadModule.extensions[".css"];

const visibleText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const rangeAttributes = (html: string): Record<string, string> => {
  const tag = html.match(/<input\b[^>]*id="forge-coins"[^>]*>/)?.[0];
  assert.ok(tag);
  return { tag, ...Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), ([, name, value]) => [name, value])) };
};

function fixture(balance: number, hydrated = true) {
  const state = createDemoState();
  state.ownedItemIds = Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id);
  let actions = 0;
  const context: XperienceContextValue = {
    ...collectorFixtureDefaults(),
    state, economy: { ...emptyEconomy(0), coinBalance: balance }, hydrated, isPlaying: false,
    playerId: "forge-ui-test", backendStatus: "ready", backendError: null, demoToolsEnabled: true,
    retryBackend: async () => {}, canImportLegacy: false, legacyAvailable: false, importLegacy: async () => false,
    economyAction: async () => { actions++; return { success: false, reason: "BUSY" }; },
    playGame: async () => ({ success: false, reason: "BUSY" }),
    tradeUp: async () => ({ success: false, reason: "BUSY" }), updateSettings: async () => true,
    equipItem: async () => true, unequipItem: async () => true, completeOpening: () => {},
    resetDemoData: async () => true, grantTestEx: async () => true,
  };
  return {
    context, actions: () => actions,
    render: () => renderToStaticMarkup(createElement(XperienceContext.Provider, { value: context }, createElement(MythicForge))),
  };
}

test("an unfunded forge displays zero chance, locks the catalyst and explains how to keep all ingredients", () => {
  for (const balance of [0, 1, 9]) {
    const harness = fixture(balance), html = harness.render(), text = visibleText(html), range = rangeAttributes(html);
    assert.equal(range.min, "0"); assert.equal(range.max, "0"); assert.equal(range.value, "0");
    assert.ok(range.tag.includes("disabled"));
    assert.equal(range["aria-valuetext"], "0 XCoin, 0% cơ hội thành công");
    assert.ok(text.includes("Cần ít nhất 10 XCoin"));
    assert.ok(text.includes("5 Legendary vẫn được giữ nguyên"));
    assert.ok(text.includes("Nhận XCoin từ sự kiện")); assert.ok(html.includes('href="/events"'));
    assert.ok(html.includes('id="forge-funding-status"')); assert.ok(html.includes('role="status"'));
    assert.equal(harness.actions(), 0);
  }
});

test("a funded forge defaults to the minimum paid 1% chance and bounds the slider by whole tens and 250 coins", () => {
  for (const [balance, maximum] of [[10, 10], [15, 10], [99, 90], [250, 250], [1000, 250]]) {
    const harness = fixture(balance), html = harness.render(), range = rangeAttributes(html);
    assert.equal(range.min, "10"); assert.equal(range.max, String(maximum)); assert.equal(range.value, "10");
    assert.equal(range.step, "10"); assert.equal(range.tag.includes("disabled"), false);
    assert.equal(range["aria-valuetext"], "10 XCoin, 1% cơ hội thành công");
    assert.ok(visibleText(html).includes("Không có lượt luyện miễn phí"));
    assert.equal(visibleText(html).includes("Cần ít nhất 10 XCoin"), false);
    assert.equal(harness.actions(), 0);
  }
});

test("connecting or busy forge controls stay disabled instead of offering an unfunded free attempt", () => {
  const connecting = fixture(20, false), connectingHtml = connecting.render();
  assert.ok(rangeAttributes(connectingHtml).tag.includes("disabled"));
  assert.ok(visibleText(connectingHtml).includes("Đang kết nối ví XCoin"));
  const busy = fixture(20); busy.context.isPlaying = true;
  assert.ok(rangeAttributes(busy.render()).tag.includes("disabled"));
  assert.equal(connecting.actions() + busy.actions(), 0);
});

test("current forge copy gives only paid 1–25% examples and retains both-outcome consumption warnings", () => {
  const html = fixture(250).render(), text = visibleText(html);
  for (const phrase of ["XCoin là nguyên liệu bắt buộc", "Không dùng coin: không thể luyện", "10 XCoin 1%", "100 XCoin 10%", "250 XCoin · tối đa 25%", "Thất bại mất cả 5 món và coin đã chọn"]) assert.ok(text.includes(phrase), phrase);
  assert.equal(text.includes("750"), false); assert.equal(text.includes("80%"), false);
  assert.ok(economyError("INVALID_COINS").includes("10 đến 250 XCoin"));
  assert.ok(economyError("INVALID_COINS").includes("1% đến tối đa 25%"));
});

test("historical forge receipts keep their recorded legacy odds and label only pre-v2 attempts as old rules", () => {
  const harness = fixture(250), inputItemIds = [...harness.context.state.ownedItemIds];
  harness.context.economy.forgeHistory = [
    { id: "current", timestamp: "2026-10-11T09:00:00Z", inputItemIds, coins: 10, chance: 1, won: false, ruleVersion: FORGE_RULE_VERSION },
    { id: "legacy", timestamp: "2026-10-10T09:00:00Z", inputItemIds, coins: 750, chance: 80, won: false },
  ];
  const html = harness.render(), text = visibleText(html);
  assert.ok(text.includes("10 XC · 1%")); assert.ok(text.includes("750 XC · 80%"));
  assert.equal(Array.from(text.matchAll(/Luật cũ/g)).length, 1);
  assert.ok(text.includes("lượt cũ không bị tính lại"));
  assert.equal(harness.actions(), 0);
});

test("both confirmation and submission rely on the paid-catalyst validity guard", async () => {
  const source = await readFile(new URL("../src/components/economy/MythicForge.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("const valid = coins >= FORGE_MIN_COINS && selected.length === 5"));
  assert.ok(source.includes("if (inFlight.current || busy || !valid) return;"));
  assert.equal(Array.from(source.matchAll(/disabled=\{busy \|\| !valid\}/g)).length, 2);
  assert.ok(source.includes("coins: spentCoins"));
  assert.ok(source.includes("Không thể hoàn tác"));
});
