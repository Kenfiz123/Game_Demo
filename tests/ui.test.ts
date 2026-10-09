import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryGrid } from "../src/components/inventory/InventoryGrid";
import { CosmeticCard } from "../src/components/inventory/CosmeticCard";
import { EquippedProfile } from "../src/components/inventory/EquippedProfile";
import { Header } from "../src/components/layout/Header";
import { OpeningHistory } from "../src/components/history/OpeningHistory";
import { OddsSettings } from "../src/components/settings/OddsSettings";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { CHEST_RARITIES } from "../src/data/chestConfig";
import { COSMETICS, cosmeticsByRarity, getCosmeticById } from "../src/data/cosmetics";
import { createDemoState } from "../src/lib/storage";
import type { CosmeticItem, EquipSlot, OpeningHistoryRecord, TradeUpHistoryRecord, XperienceState } from "../src/types/gamification";

// tsx uses the classic JSX runtime for imported TSX under this repo's jsx: preserve.
Object.assign(globalThis, { React });

const visibleText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const inputAttributes = (html: string) => Array.from(html.matchAll(/<input\b[^>]*>/g), ([tag]) =>
  Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), ([, name, value]) => [name, value])));
const articleCount = (html: string) => Array.from(html.matchAll(/<article\b[^>]*>/g)).length;

function fixture(state: XperienceState = createDemoState()) {
  let settingsWrites = 0;
  const context: XperienceContextValue = {
    state, hydrated: true, isPlaying: false,
    playGame: async () => ({ success: false, reason: "BUSY" }),
    tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => { settingsWrites += 1; return true; },
    equipItem: async () => true,
    unequipItem: async () => true,
    completeOpening: () => {},
    resetDemoData: async () => true,
    grantTestEx: async () => true,
  };
  return {
    context,
    writes: () => settingsWrites,
    render: (Component: ComponentType) => renderToStaticMarkup(createElement(XperienceContext.Provider, { value: context }, createElement(Component))),
  };
}

const opening = (id: string, item: CosmeticItem, compensation = 0): OpeningHistoryRecord => ({
  id, itemId: item.id, itemName: item.name, rarity: item.rarity, cost: 100,
  timestamp: "2026-10-08T10:00:00Z", isDuplicate: true, compensation, game: "chest",
});
const trade = (id: string, won: boolean, input: CosmeticItem, reward: CosmeticItem): TradeUpHistoryRecord => ({
  id, inputItemIds: Array.from({ length: 5 }, () => input.id), inputRarity: "COMMON", targetRarity: "UNCOMMON",
  chance: 80, won, timestamp: "2026-10-08T11:00:00Z",
  ...(won ? { rewardItemId: reward.id, rewardItemName: reward.name, isDuplicate: true } : {}),
});

test("inventory stacks repeated valid IDs while counting copies and unique patterns separately", () => {
  const common = cosmeticsByRarity("COMMON")[0], uncommon = cosmeticsByRarity("UNCOMMON")[0];
  const state = createDemoState();
  state.ownedItemIds = [common.id, common.id, uncommon.id, "retired-generic-item"];
  assert.equal(getCosmeticById("retired-generic-item"), undefined);
  const html = fixture(state).render(InventoryGrid), text = visibleText(html);
  assert.ok(text.includes("TỔNG VẬT PHẨM 3 bản trong kho"));
  assert.ok(text.includes(`BỘ SƯU TẬP HIỆN CÓ 2 / ${COSMETICS.length} mẫu`));
  assert.ok(html.includes('aria-label="2 bản trong kho"'));
  assert.ok(html.includes('aria-label="1 bản trong kho"'));
  assert.equal(articleCount(html), 2);
  assert.equal(html.includes("retired-generic-item"), false);
  assert.ok(html.includes('href="/trade-up"'));
});

test("history distinguishes retained duplicate copies from legacy EX compensation", () => {
  const common = cosmeticsByRarity("COMMON")[0], uncommon = cosmeticsByRarity("UNCOMMON")[0];
  const state = createDemoState();
  state.history = [opening("new-copy", common), opening("old-refund", uncommon, 25), {
    ...opening("retired", common), itemId: "retired-generic-item", itemName: "Retired generic item",
  }];
  const html = fixture(state).render(OpeningHistory), text = visibleText(html);
  assert.equal(articleCount(html), 2);
  assert.ok(text.includes("Bản sao đã cất vào kho"));
  assert.ok(text.includes("+1 bản vào kho"));
  assert.ok(text.includes("+25 EX · lịch sử cũ"));
  assert.ok(text.includes("Bản trùng cũ · đã hoàn EX theo cơ chế trước đây"));
  assert.equal(text.includes("Retired generic item"), false);
  assert.equal(html.includes("lucide-badge-check"), false);
  assert.ok(html.includes(encodeURIComponent(common.image!)));
});

test("history includes successful and failed trade-ups with consumed copies and recorded odds", () => {
  const common = cosmeticsByRarity("COMMON")[0], uncommon = cosmeticsByRarity("UNCOMMON")[0];
  const state = createDemoState();
  state.history = [opening("opening", common)];
  state.tradeHistory = [trade("success", true, common, uncommon), trade("failure", false, common, uncommon)];
  const html = fixture(state).render(OpeningHistory), text = visibleText(html);
  assert.equal(articleCount(html), 3);
  assert.ok(text.includes("ĐỔI ĐỒ · THÀNH CÔNG"));
  assert.ok(text.includes("ĐỔI ĐỒ · THẤT BẠI"));
  assert.ok(text.includes(uncommon.name));
  assert.ok(text.includes("80% cơ hội thành công"));
  assert.ok(text.includes("Đã dùng 5 COMMON → UNCOMMON"));
  assert.ok(text.includes("Đồ đã dùng không hoàn lại"));
  assert.ok(text.includes("+1 UNCOMMON"));
});

test("settings mount their editor only after browser storage hydration", () => {
  const harness = fixture();
  harness.context.hydrated = false;
  const html = harness.render(OddsSettings);
  assert.equal(inputAttributes(html).length, 0);
  assert.ok(visibleText(html).includes("Đang tải tỷ lệ đã lưu"));
  assert.equal(harness.writes(), 0);
});

test("default settings render ten labeled native percentage fields and the actual six rarity pools", () => {
  const harness = fixture(), html = harness.render(OddsSettings), fields = inputAttributes(html);
  assert.equal(fields.length, 10);
  for (const field of fields) {
    assert.equal(field.type, "number"); assert.equal(field.min, "0"); assert.equal(field.max, "100");
    assert.equal(field.step, "0.0001"); assert.equal(field["aria-invalid"], "false");
    assert.ok(html.includes(`for="${field.id}"`));
  }
  for (const row of CHEST_RARITIES) {
    const field = fields.find(field => field.id === "chest-odds-" + row.rarity);
    assert.equal(field?.value, String(row.probability));
    assert.ok(visibleText(html).includes(cosmeticsByRarity(row.rarity).length + " vật phẩm ngẫu nhiên"));
  }
  for (const [rarity, value] of Object.entries({ COMMON: 80, UNCOMMON: 60, RARE: 30, EPIC: 5 })) {
    assert.equal(fields.find(field => field.id === "trade-odds-" + rarity)?.value, String(value));
  }
  const text = visibleText(html);
  for (const label of ["100% Common", "100% Mythic", "Tất cả 100%", "Tất cả 0%", "Mythic chỉ mở bằng rương"]) assert.ok(text.includes(label), label);
  assert.equal(harness.writes(), 0, "Rendering or showing presets must not write settings");
});

test("saved 100% Mythic settings initialize the draft unchanged without default overwrites", () => {
  const state = createDemoState();
  for (const row of CHEST_RARITIES) state.settings.chestOdds[row.rarity] = row.rarity === "MYTHIC" ? 100 : 0;
  state.settings.tradeUpOdds.RARE = 17.25;
  const original = JSON.stringify(state.settings), harness = fixture(state), html = harness.render(OddsSettings);
  const fields = inputAttributes(html);
  assert.equal(fields.find(field => field.id === "chest-odds-MYTHIC")?.value, "100");
  assert.equal(fields.find(field => field.id === "chest-odds-COMMON")?.value, "0");
  assert.equal(fields.find(field => field.id === "trade-odds-RARE")?.value, "17.25");
  assert.ok(visibleText(html).includes("Bản nháp khớp tỷ lệ đang áp dụng"));
  assert.equal(JSON.stringify(state.settings), original);
  assert.equal(harness.writes(), 0);
});

test("settings render a disabled save control and explicit message while a game is locked", () => {
  const harness = fixture();
  harness.context.isPlaying = true;
  const html = harness.render(OddsSettings);
  const saveTag = Array.from(html.matchAll(/<button\b[^>]*>/g), ([tag]) => tag).find(tag => tag.includes('type="submit"'));
  assert.ok(saveTag?.includes("disabled"));
  assert.ok(visibleText(html).includes("Game đang chạy — chờ kết thúc để lưu."));
  assert.equal(harness.writes(), 0);
});

test("catalog Mythic cards remain previews without equipment controls even when their item is owned", () => {
  const mythic = cosmeticsByRarity("MYTHIC")[0], state = createDemoState();
  state.ownedItemIds = [mythic.id];
  const html = fixture(state).render(() => createElement(CosmeticCard, { item: mythic }));
  assert.equal(html.includes('class="mythic-equip-button"'), false);
});

test("owned Mythic inventory cards expose equipment controls while common cards do not", () => {
  const mythic = cosmeticsByRarity("MYTHIC")[0], common = cosmeticsByRarity("COMMON")[0], state = createDemoState();
  state.ownedItemIds = [mythic.id, common.id];
  const harness = fixture(state);
  const mythicHtml = harness.render(() => createElement(CosmeticCard, { item: mythic, quantity: 1 }));
  assert.ok(mythicHtml.includes('aria-label="Trang bị ' + mythic.name + '"'));
  const control = Array.from(mythicHtml.matchAll(/<button\b[^>]*>/g), ([tag]) => tag).find(tag => tag.includes("mythic-equip-button"));
  assert.ok(control); assert.equal(control.includes("disabled"), false);
  const commonHtml = harness.render(() => createElement(CosmeticCard, { item: common, quantity: 1 }));
  assert.equal(commonHtml.includes('class="mythic-equip-button"'), false);
  state.equipped[mythic.type as EquipSlot] = mythic.id;
  const equippedHtml = harness.render(() => createElement(CosmeticCard, { item: mythic, quantity: 1 }));
  assert.ok(equippedHtml.includes('aria-label="Gỡ trang bị ' + mythic.name + '"'));
  assert.ok(equippedHtml.includes('aria-pressed="true"'));
});

test("a claimed quantity does not enable equipment for a Mythic copy absent from inventory", () => {
  const mythic = cosmeticsByRarity("MYTHIC")[0];
  const html = fixture().render(() => createElement(CosmeticCard, { item: mythic, quantity: 1 }));
  const control = Array.from(html.matchAll(/<button\b[^>]*>/g), ([tag]) => tag).find(tag => tag.includes("mythic-equip-button"));
  assert.ok(control?.includes("disabled"));
});

test("equipped profile composes all five owned Mythic slots and exposes explicit clear actions", () => {
  const state = createDemoState(), equipped = new Map<EquipSlot, CosmeticItem>();
  for (const slot of ["LOGO", "AVATAR", "TITLE", "FRAME", "EFFECT"] as const) {
    const item = cosmeticsByRarity("MYTHIC").find(item => item.type === slot);
    assert.ok(item);
    equipped.set(slot, item); state.ownedItemIds.push(item.id); state.equipped[slot] = item.id;
  }
  const html = fixture(state).render(EquippedProfile), text = visibleText(html);
  assert.ok(text.includes("5 / 5 vị trí"));
  for (const item of equipped.values()) assert.ok(text.includes(item.name), item.name);
  for (const label of ["Gỡ avatar", "Gỡ khung", "Gỡ danh hiệu", "Gỡ logo", "Gỡ hiệu ứng"]) assert.ok(html.includes('aria-label="' + label + '"'), label);
  for (const wrapper of ["avatar", "frame", "title-art", "logo", "effect"]) assert.ok(html.includes('class="equipped-profile-' + wrapper + '"'));
  const legacy = equipped.get("TITLE");
  if (legacy?.heritage) assert.ok(text.includes("Di sản " + legacy.heritage));
});

test("profile rejects unowned equipment and wrong-rarity slot assignments without granting copies", () => {
  const state = createDemoState(), mythic = cosmeticsByRarity("MYTHIC").find(item => item.type === "AVATAR")!, rare = cosmeticsByRarity("RARE")[0];
  state.equipped.AVATAR = mythic.id;
  const unowned = fixture(state).render(EquippedProfile);
  assert.ok(visibleText(unowned).includes("0 / 5 vị trí"));
  assert.equal(visibleText(unowned).includes(mythic.name), false);
  state.ownedItemIds = [rare.id]; state.equipped.AVATAR = rare.id;
  const wrongRarity = fixture(state).render(EquippedProfile);
  assert.ok(visibleText(wrongRarity).includes("0 / 5 vị trí"));
  assert.deepEqual(state.ownedItemIds, [rare.id]);
});

test("header uses owned equipped Mythic avatar and title, not catalog preview gear", () => {
  const avatar = cosmeticsByRarity("MYTHIC").find(item => item.type === "AVATAR")!, title = cosmeticsByRarity("MYTHIC").find(item => item.type === "TITLE")!;
  const state = createDemoState();
  state.ownedItemIds = [avatar.id, title.id]; state.equipped = { AVATAR: avatar.id, TITLE: title.id };
  const html = fixture(state).render(Header);
  assert.ok(html.includes("header-equipped-avatar"));
  assert.ok(html.includes('title="' + title.name + '"'));
  assert.ok(html.includes(encodeURIComponent(avatar.image!)));
  state.ownedItemIds = [];
  const unownedHtml = fixture(state).render(Header);
  assert.equal(unownedHtml.includes("header-equipped-avatar"), false);
  assert.equal(unownedHtml.includes('title="' + title.name + '"'), false);
});
