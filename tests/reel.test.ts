import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RewardReel } from "../src/components/chest/RewardReel";
import { RewardReveal } from "../src/components/chest/RewardReveal";
import { MythicVault, MYTHIC_VAULT_IMAGE } from "../src/components/ui/MythicVault";
import { XperienceContext, type XperienceContextValue } from "../src/hooks/useXperience";
import { CLUBS } from "../src/data/clubs";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { MYTHIC_VARIANTS } from "../src/data/mythicCatalog";
import { getClubMythics } from "../src/data/clubCosmetics";
import { createDemoState } from "../src/lib/storage";
import { REEL_WINNER_INDEX } from "../src/data/arcadeConfig";
import type { ChestReward, CosmeticItem } from "../src/types/gamification";

Object.assign(globalThis, { React });
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const rewardOf = (item: CosmeticItem, isDuplicate = false): ChestReward => ({ item, isDuplicate, compensation: 0 });
const articleMarkup = (html: string) => Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/g), ([article]) => article);
function context(): XperienceContextValue {
  const state = createDemoState();
  state.settings.chestOdds = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 100 };
  return {
    state, hydrated: true, isPlaying: true,
    backendStatus: "ready", backendError: null, retryBackend: async () => {}, demoToolsEnabled: true,
    canImportLegacy: false, legacyAvailable: false, importLegacy: async () => false,
    playGame: async () => ({ success: false, reason: "BUSY" }),
    tradeUp: async () => ({ success: false, reason: "BUSY" }),
    updateSettings: async () => false, equipItem: async () => false, unequipItem: async () => false,
    completeOpening: () => {}, resetDemoData: async () => false, grantTestEx: async () => false,
  };
}
const renderReel = (item: CosmeticItem, settled = false) => renderToStaticMarkup(createElement(XperienceContext.Provider,
  { value: context() }, createElement(RewardReel, { reward: rewardOf(item), settled, onLanded: () => {} })));
const renderReveal = (reward: ChestReward) => renderToStaticMarkup(createElement(RewardReveal, {
  reward, cost: 100, onOpenAgain: () => {}, onInventory: () => {}, onClose: () => {},
}));

test("sealed vault is a static new raster with no Crown, question mark, or item-specific input", () => {
  const html = renderToStaticMarkup(createElement(MythicVault));
  assert.ok(html.includes(encodeURIComponent(MYTHIC_VAULT_IMAGE)));
  assert.ok(html.includes('class="vault-art mythic-sealed-vault"'));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.ok(html.includes('alt=""'));
  assert.equal(html.includes("<svg"), false);
  assert.equal(html.includes("lucide-crown"), false);
  assert.equal(text(html).includes("?"), false);
  assert.equal(html.includes("data-motion-active"), false);
});
test("all eight Mythic variants remain anonymous before landing and during settling", () => {
  for (const club of [CLUBS[0], CLUBS.at(-1)!]) {
    for (const item of getClubMythics(club.id)) {
      for (const settled of [false, true]) {
        const html = renderReel(item, settled), cards = articleMarkup(html);
        assert.equal(cards.length, REEL_WINNER_INDEX + 5);
        assert.ok(cards.every(card => card === cards[0]), "winner vault must be indistinguishable from decorative vaults");
        assert.equal(html.includes(item.id), false);
        assert.equal(html.includes(item.name), false);
        assert.equal(html.includes(item.image!), false);
        assert.equal(html.includes(encodeURIComponent(item.image!)), false);
        assert.equal(html.includes("data-winner"), false);
        assert.equal(html.includes("is-winner"), false);
        assert.ok(text(html).includes("Di sản niêm phong"));
        assert.ok(text(html).includes(cosmeticsByRarity("MYTHIC").length + " bí mật bên trong"));
      }
    }
  }
});
test("a Common winner does not gain Mythic animation and retains its ordinary identity", () => {
  const item = cosmeticsByRarity("COMMON")[0], html = renderReel(item);
  const cards = articleMarkup(html);
  assert.ok(cards[REEL_WINNER_INDEX].includes(item.name));
  assert.equal(cards[REEL_WINNER_INDEX].includes("mythic-vault-card"), false);
  assert.equal(cards[REEL_WINNER_INDEX].includes("data-motion-enabled=\"true\""), false);
  assert.ok(cards.slice(0, REEL_WINNER_INDEX).every(card => card.includes("mythic-vault-card")));
});
test("Mythic ceremony names the actual awarded variant, item, and current pool after reveal", () => {
  for (const item of getClubMythics(CLUBS[0].id)) {
    const html = renderReveal(rewardOf(item)), visible = text(html);
    const variant = MYTHIC_VARIANTS.find(variant => variant.variant === item.mythicVariant)!;
    assert.ok(html.includes("mythic-ceremony"));
    assert.ok(html.includes('aria-label="Di sản đã thức tỉnh: ' + item.name + '"'));
    assert.ok(html.includes('tabindex="-1"'));
    assert.ok(visible.includes("Di sản đã thức tỉnh"));
    assert.ok(visible.includes(item.name)); assert.ok(visible.includes(variant.label));
    assert.ok(visible.includes("Một trong " + cosmeticsByRarity("MYTHIC").length + " vật phẩm Mythic"));
    assert.ok(visible.includes("Hiệu ứng đi cùng khi trang bị"));
    assert.ok(visible.includes("Trang bị trong kho"));
    assert.ok(visible.includes("Mở tiếp · 100 EX"));
    assert.ok(visible.includes("Trở về rương"));
    assert.equal(visible.includes("A FAMILIAR DISCOVERY"), false);
  }
});
test("Mythic duplicate ceremony still stores the copy and never claims an EX refund or trade-up eligibility", () => {
  const html = renderReveal(rewardOf(cosmeticsByRarity("MYTHIC")[0], true)), visible = text(html);
  assert.ok(visible.includes("Bản sao mới đã cất vào kho"));
  assert.equal(visible.includes("Có thể dùng để đổi đồ"), false);
  assert.equal(visible.includes("+25 EX"), false);
});
test("ordinary rewards retain existing headings, actions, and duplicate trade-up copy", () => {
  const item = cosmeticsByRarity("COMMON")[0], html = renderReveal(rewardOf(item, true)), visible = text(html);
  assert.equal(html.includes("mythic-ceremony"), false);
  assert.ok(html.includes('<h2 tabindex="-1">' + item.name + "</h2>"));
  for (const label of ["Xem trong kho", "Mở tiếp · 100 EX", "Quay lại", "Bản sao mới đã cất vào kho", "Có thể dùng để đổi đồ"]) assert.ok(visible.includes(label), label);
});
test("ceremony entrance is bounded transform/opacity motion with reduced-motion support and existing focus semantics", async () => {
  const css = await readFile(new URL("../src/app/mythic-ceremony.css", import.meta.url), "utf8");
  const reveal = await readFile(new URL("../src/components/chest/RewardReveal.tsx", import.meta.url), "utf8");
  const keyframes = css.match(/@keyframes mythic-ceremony-enter\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(keyframes);
  const properties = Array.from(keyframes.matchAll(/([a-z-]+)\s*:/g), ([, name]) => name);
  assert.deepEqual([...new Set(properties)].sort(), ["opacity", "transform"]);
  assert.ok(css.includes("850ms")); assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.equal(css.includes("infinite"), false);
  assert.ok(reveal.includes("focus({ preventScroll: true })"));
  assert.equal(reveal.includes("requestAnimationFrame"), false);
  assert.equal(reveal.includes("IntersectionObserver"), false);
});
