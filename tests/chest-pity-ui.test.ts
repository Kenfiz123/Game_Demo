import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChestPity, visibleChestPity, type CapturedChestPity } from "../src/components/chest/ChestPity";
import { OddsSettings } from "../src/components/settings/OddsSettings";
import { CHEST_PITY_LIMIT } from "../src/lib/chestPity";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { createDemoState } from "../src/lib/storage";
import { emptyEconomy } from "../src/data/eventEconomy";
import { collectorFixtureDefaults } from "./collectorFixture";

Object.assign(globalThis, { React });
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const captured = (count: number, pending = false): CapturedChestPity => ({ playerId: "player-one", count, pending });

test("pity panel starts at 0/200 with an accessible remaining-opening explanation", () => {
  const html = renderToStaticMarkup(createElement(ChestPity, { count: 0, hydrated: true }));
  assert.equal(CHEST_PITY_LIMIT, 200);
  assert.ok(text(html).includes("Pity · Bảo chứng Mythic"));
  assert.ok(text(html).includes("0 / 200"));
  assert.ok(text(html).includes("Còn tối đa 200 rương"));
  assert.ok(html.includes('value="0" max="200"'));
  assert.ok(html.includes('aria-label="Số rương liên tiếp chưa nhận Mythic"'));
  assert.ok(html.includes('role="status" aria-live="polite" aria-atomic="true"'));
  assert.ok(text(html).includes("Trúng sớm sẽ đếm lại từ 0; chỉ tính mở rương"));
});

test("pity 199 explicitly guarantees the very next chest without inventing a 200 stored count", () => {
  const html = renderToStaticMarkup(createElement(ChestPity, { count: 199, hydrated: true }));
  assert.ok(text(html).includes("199 / 200"));
  assert.ok(text(html).includes("Rương tiếp theo chắc chắn nhận Mythic"));
  assert.ok(html.includes('class="chest-pity is-guaranteed"'));
  assert.ok(html.includes('value="199" max="200"'));
});

test("unhydrated pity hides even a stale guarantee and announces unavailable persisted data", () => {
  const html = renderToStaticMarkup(createElement(ChestPity, { count: 199, hydrated: false }));
  assert.ok(text(html).includes("— / 200"));
  assert.ok(text(html).includes("Đang tải bảo chứng đã lưu"));
  assert.equal(html.includes("is-guaranteed"), false);
  assert.equal(text(html).includes("Rương tiếp theo chắc chắn"), false);
  assert.ok(html.includes('value="0" max="200"'));
});

test("request-pending freeze covers the idle and old-result screens before game.start returns", () => {
  for (const phase of ["idle", "result"] as const) {
    assert.equal(visibleChestPity(0, captured(72, true), phase, "player-one"), 72, "natural Mythic reset must not leak");
    assert.equal(visibleChestPity(73, captured(72, true), phase, "player-one"), 72, "normal increment must not leak");
    assert.equal(visibleChestPity(0, captured(199, true), phase, "player-one"), 199, "guaranteed draw stays at pre-opening count");
  }
});

test("charging, rolling and settling keep the same pre-opening counter independent of the saved outcome", () => {
  for (const phase of ["charging", "rolling", "settling"] as const) {
    assert.equal(visibleChestPity(0, captured(72), phase, "player-one"), 72);
    assert.equal(visibleChestPity(73, captured(72), phase, "player-one"), 72);
    assert.equal(visibleChestPity(0, captured(199), phase, "player-one"), 199);
  }
});

test("result reveal releases both natural resets and ordinary increments to authoritative server data", () => {
  assert.equal(visibleChestPity(0, captured(72), "result", "player-one"), 0);
  assert.equal(visibleChestPity(73, captured(72), "result", "player-one"), 73);
  assert.equal(visibleChestPity(0, captured(199), "result", "player-one"), 0);
});

test("failed or aborted pending requests return to live server count without adding or resetting anything", () => {
  for (const phase of ["idle", "result"] as const) {
    assert.equal(visibleChestPity(72, captured(72), phase, "player-one"), 72);
    assert.equal(visibleChestPity(199, captured(199), phase, "player-one"), 199);
    assert.equal(visibleChestPity(18, captured(72), phase, "player-one"), 18, "reconciled server count wins after request ends");
  }
});

test("a captured counter never follows the UI into a different player's account", () => {
  for (const phase of ["idle", "charging", "rolling", "settling", "result"] as const) {
    assert.equal(visibleChestPity(5, captured(199, true), phase, "player-two"), 5);
    assert.equal(visibleChestPity(5, null, phase, "player-two"), 5);
  }
});

test("settings disclose that 200-chest guarantee overrides even a zero base Mythic rate", () => {
  const context: XperienceContextValue = {
    ...collectorFixtureDefaults(), state: createDemoState(), economy: emptyEconomy(0), playerId: "pity-ui", hydrated: true, isPlaying: false,
    backendStatus: "ready", backendError: null, retryBackend: async () => {}, demoToolsEnabled: true, canImportLegacy: false, legacyAvailable: false, importLegacy: async () => false,
    economyAction: async () => ({ success: false, reason: "BUSY" }), playGame: async () => ({ success: false, reason: "BUSY" }), tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => true, equipItem: async () => true, unequipItem: async () => true, completeOpening: () => {}, resetDemoData: async () => true, grantTestEx: async () => true,
  };
  const html = renderToStaticMarkup(createElement(XperienceContext.Provider, { value: context }, createElement(OddsSettings)));
  const visible = text(html);
  assert.ok(visible.includes("Tỷ lệ cơ bản"));
  assert.ok(visible.includes("Bảo chứng 200 rương"));
  assert.ok(visible.includes("kể cả khi tỷ lệ cơ bản Mythic là 0%"));
  assert.ok(visible.includes("Đổi tỷ lệ không xóa tiến độ bảo chứng"));
  assert.ok(visible.includes("vòng quay, luyện Mythic và giao dịch không cộng hoặc đặt lại bộ đếm"));
});
