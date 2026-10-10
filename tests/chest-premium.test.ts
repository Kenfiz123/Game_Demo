import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChestVisual } from "../src/components/chest/ChestVisual";
import { RewardReveal } from "../src/components/chest/RewardReveal";
import { CHEST_RARITIES } from "../src/data/chestConfig";
import { cosmeticsByRarity } from "../src/data/cosmetics";

Object.assign(globalThis, { React });
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function cssBlock(css: string, marker: string) {
  const markerStart = css.indexOf(marker);
  assert.notEqual(markerStart, -1, marker);
  const start = css.indexOf("{", markerStart);
  let depth = 1;
  for (let cursor = start + 1; cursor < css.length; cursor += 1) {
    if (css[cursor] === "{") depth += 1;
    if (css[cursor] === "}") depth -= 1;
    if (depth === 0) return css.slice(start + 1, cursor);
  }
  assert.fail(`Unclosed CSS block: ${marker}`);
}

test("premium chest keeps its existing artwork and starts static until the shared visibility gate enables motion", async () => {
  const idle = renderToStaticMarkup(createElement(ChestVisual, { charging: false }));
  const charging = renderToStaticMarkup(createElement(ChestVisual, { charging: true }));
  assert.ok(idle.includes('class="chest-object" data-motion-active="false"'));
  assert.ok(idle.includes(encodeURIComponent("/assets/chest-premium.webp")));
  assert.ok(charging.includes('class="chest-stage is-charging"'));
  const source = await readFile(new URL("../src/components/chest/ChestVisual.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("return observeVisibleMotion(element)"), "observer subscription must clean up on unmount");
  for (const resource of ["requestAnimationFrame", "setInterval", "setTimeout", "addEventListener", "IntersectionObserver", "canvas"]) assert.equal(source.includes(resource), false, resource);
});

test("premium chest motion uses only transform and opacity with paused-default and reduced-motion rules", async () => {
  const css = await readFile(new URL("../src/app/chest-premium.css", import.meta.url), "utf8");
  const keyframes = Array.from(css.matchAll(/@keyframes [\w-]+\s*\{([\s\S]*?)\n\}/g), ([, body]) => body);
  assert.equal(keyframes.length, 2);
  for (const body of keyframes) {
    const properties = Array.from(body.matchAll(/([a-z-]+)\s*:/g), ([, property]) => property);
    assert.ok(properties.length > 0);
    assert.ok(properties.every(property => property === "transform" || property === "opacity"));
  }
  assert.ok(css.includes('chest-object[data-motion-active="true"] { animation-play-state: running; }'));
  assert.ok(css.includes("animation-play-state: paused;"));
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.equal(Array.from(css.matchAll(/\binfinite\b/g)).length, 1, "only the observed chest artwork gets ambient motion");
  for (const expensive of ["backdrop-filter", "filter: blur", "will-change", "transition: all"]) assert.equal(css.includes(expensive), false, expensive);
});

test("every rarity reveals the real artwork with Vietnamese collection actions and retained-copy semantics", () => {
  for (const { rarity } of CHEST_RARITIES) {
    const item = cosmeticsByRarity(rarity)[0];
    for (const isDuplicate of [false, true]) {
      const reward = { item, isDuplicate, compensation: 0 };
      const before = JSON.stringify(reward);
      const html = renderToStaticMarkup(createElement(RewardReveal, {
        reward, cost: 100, onOpenAgain: () => {}, onInventory: () => {}, onClose: () => {},
      }));
      const visible = text(html);
      assert.ok(html.includes("premium-reveal"));
      assert.ok(visible.includes(item.name));
      assert.ok(visible.includes("Mở tiếp · 100 EX"));
      assert.ok(visible.includes(rarity === "MYTHIC" ? "Trang bị trong kho" : "Xem trong kho"));
      assert.ok(visible.includes(isDuplicate ? "Bản sao mới đã cất vào kho" : "Đã cất vào bộ sưu tập của bạn"));
      assert.equal(visible.includes("Có thể dùng để đổi đồ"), isDuplicate && rarity !== "LEGENDARY" && rarity !== "MYTHIC");
      assert.equal(visible.includes("View collection"), false);
      assert.equal(visible.includes("Added to your collection"), false);
      assert.equal(JSON.stringify(reward), before);
    }
  }
});

test("chest journey is descriptive phase UI, without outcome-based highlighting or a fabricated percentage", async () => {
  const source = await readFile(new URL("../src/components/chest/ChestOpening.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('const currentStep = game.phase === "result" ? 2 : rolling ? 1 : 0;'));
  assert.ok(source.includes('["Niêm phong", "Khám phá", "Sở hữu"]'));
  assert.ok(source.includes('aria-current={currentStep === index ? "step" : undefined}'));
  assert.equal(source.includes("progressbar"), false);
  assert.equal(source.includes("is-winner"), false);
  assert.equal(source.includes("data-winner"), false);
  assert.ok(source.includes('settled={game.phase === "settling"} onLanded={game.onLanded}'));
});

test("compact mobile and laptop layouts shrink decorative chest art while preserving the opening button target", async () => {
  const css = await readFile(new URL("../src/app/chest-premium.css", import.meta.url), "utf8");
  for (const [media, height] of [
    ["@media (max-width: 700px)", 185],
    ["@media (max-width: 370px)", 170],
    ["@media (min-width: 961px) and (max-height: 800px)", 185],
  ] as const) {
    const block = cssBlock(css, media);
    const art = cssBlock(block, ".chest-panel .chest-stage, .chest-panel .chest-object");
    assert.ok(art.includes(`height: ${height}px;`));
    assert.equal(block.includes(".play-button"), false, "compact layout must not shrink the action target");
    assert.equal(block.includes(".chest-journey { display: none"), false, "phase navigation stays discoverable");
  }
  const button = cssBlock(css, ".chest-panel .play-button");
  assert.ok(button.includes("width: min(100%, 292px)"));
  assert.ok(button.includes("min-height: 49px"));
  const laptop = cssBlock(css, "@media (min-width: 961px) and (max-height: 800px)");
  assert.ok(cssBlock(laptop, ".chest-experience .chest-panel").includes("min-height: 430px"));
  assert.ok(cssBlock(laptop, ".chest-panel .game-intro h2 br").includes("display: none"));
});

test("premium cascade retains observed charging and inherited Mythic reduced motion without overriding reel geometry or timing", async () => {
  const [layout, chest, ceremony, shell] = await Promise.all([
    readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/chest-premium.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/mythic-ceremony.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/experience-premium.css", import.meta.url), "utf8"),
  ]);
  assert.ok(layout.indexOf('"./mythic-ceremony.css"') < layout.indexOf('"./chest-premium.css"'));
  assert.ok(layout.indexOf('"./experience-premium.css"') < layout.indexOf('"./chest-premium.css"'));
  const charge = cssBlock(chest, ".chest-panel .is-charging .chest-object {");
  assert.ok(charge.includes("animation: chest-charge .45s"));
  assert.ok(charge.includes("animation-play-state: paused"));
  assert.ok(cssBlock(chest, '.chest-panel .is-charging .chest-object[data-motion-active="true"]').includes("animation-play-state: running"));
  const reduced = cssBlock(chest, "@media (prefers-reduced-motion: reduce)");
  assert.ok(cssBlock(reduced, ".chest-panel .chest-object, .chest-panel .is-charging .chest-object, .premium-reveal:not(.mythic-ceremony)").includes("animation: none"));
  assert.ok(cssBlock(cssBlock(ceremony, "@media (prefers-reduced-motion: reduce)"), ".reward-reveal.mythic-ceremony").includes("animation: none"));
  const reducedShell = cssBlock(shell, "@media (prefers-reduced-motion: reduce)");
  assert.ok(reducedShell.includes("transform: none"));
  assert.ok(reducedShell.includes(":is(:hover, :active):not(:disabled)"), "reduced-motion transform reset must match disabled-safe hover/press specificity rather than lose to it");
  for (const source of [chest, shell]) {
    assert.equal(source.includes(".reel-track"), false);
    assert.equal(source.includes("--reel-duration"), false);
    assert.equal(source.includes("--reel-distance"), false);
  }
});
