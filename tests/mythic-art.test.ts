import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLUBS } from "../src/data/clubs";
import { getClubMythics } from "../src/data/clubCosmetics";
import { MYTHIC_VARIANTS, getMythicImage } from "../src/data/mythicCatalog";
import { MYTHIC_FINISHES, MythicArt } from "../src/components/ui/MythicArt";
import { CosmeticArt } from "../src/components/ui/CosmeticArt";
import type { CosmeticItem, MythicVariant } from "../src/types/gamification";

// Imported TSX uses the classic runtime under the repository's jsx: preserve.
Object.assign(globalThis, { React });

const finishMarkers: Record<MythicVariant, string> = {
  PRISM: "royal-prism", SOVEREIGN: "royal-finish-sovereign", AURORA: "royal-finish-aurora",
  CELESTIAL: "royal-finish-celestial", LEGACY: "royal-legacy-plaque", PHOENIX: "royal-wing",
  COMET: "royal-finish-comet", REGALIA: "royal-finish-regalia",
};
const classes = (html: string) => new Set(Array.from(html.matchAll(/\bclass="([^"]*)"/g), match => match[1].split(/\s+/)).flat());
const images = (html: string) => Array.from(html.matchAll(/<img\b[^>]*>/g), match => match[0]);
const render = (item: CosmeticItem, options: { compact?: boolean; animated?: boolean } = {}) =>
  renderToStaticMarkup(createElement(MythicArt, { item, ...options }));

for (const definition of MYTHIC_VARIANTS) {
  test(`royal ${definition.variant} renders its own finish, inventory ID and new Mythic artwork`, () => {
    const item = getClubMythics(CLUBS[0].id).find(candidate => candidate.mythicVariant === definition.variant);
    assert.ok(item);
    const html = render(item), tokens = classes(html);
    assert.ok(html.includes(`data-item-id="${item.id}"`));
    assert.ok(html.includes(`data-mythic-variant="${definition.variant}"`));
    assert.ok(html.includes('data-mythic-fx="4"'));
    assert.ok(tokens.has("variant-" + definition.variant.toLowerCase()));
    assert.ok(tokens.has(finishMarkers[definition.variant]), definition.variant + " must have its own visible finish");
    for (const [otherVariant, marker] of Object.entries(finishMarkers)) {
      if (otherVariant !== definition.variant) assert.equal(tokens.has(marker), false, definition.variant + " must not reuse " + otherVariant + " finish");
    }
    assert.ok(images(html).some(tag => tag.includes(encodeURIComponent(item.image!))), "render the item image, not just decorative rings");
    const variant = definition.variant;
    if (variant === "SOVEREIGN" || variant === "AURORA" || variant === "CELESTIAL" || variant === "COMET" || variant === "REGALIA") {
      assert.ok(images(html).some(tag => tag.includes(encodeURIComponent(MYTHIC_FINISHES[variant]))), variant + " must render its actual sculpted frame");
      assert.match(html, /<div class="royal-finish [^"]*\broyal-motion\b[^"]*"/, "the decorative finish must participate in shared motion gates");
      assert.notEqual(item.image, MYTHIC_FINISHES[variant], "the decorative finish must never become the owned club avatar image");
    }
    if (definition.variant === "PHOENIX") {
      assert.ok(images(html).some(tag => tag.includes(encodeURIComponent("/assets/mythic/phoenix-mantle.webp"))), "Phoenix must use its generated wing mantle rather than generic CSS triangles");
      assert.equal(Array.from(html.matchAll(/\bclass="royal-wing royal-motion"/g)).length, 1);
    }
    assert.equal(html.includes(encodeURIComponent(CLUBS[0].image)), false);
    assert.ok(html.includes('data-motion-active="false"'));
    assert.ok(html.includes('data-motion-enabled="true"'));
  });
}

test("all 584 Mythic cosmetics render their exact identity and separate royal image through CosmeticArt", () => {
  let count = 0;
  for (const club of CLUBS) {
    for (const item of getClubMythics(club.id)) {
      const html = renderToStaticMarkup(createElement(CosmeticArt, { item, compact: true, animated: true }));
      assert.equal(item.image, getMythicImage(club));
      assert.equal(item.image, "/assets/mythic-clubs/" + club.id + ".webp");
      assert.notEqual(item.image, club.image);
      assert.ok(html.includes(`data-item-id="${item.id}"`), item.id);
      assert.ok(html.includes(`data-mythic-variant="${item.mythicVariant}"`), item.id);
      assert.ok(images(html).some(tag => tag.includes(encodeURIComponent(item.image!))), item.id);
      assert.equal(html.includes(encodeURIComponent(club.image)), false, item.id + " must not fall back to Common club art");
      assert.ok(html.includes('data-motion-active="false"'), item.id);
      count += 1;
    }
  }
  assert.equal(count, 584);
});

test("compact Mythic effects remain enabled while explicit pause disables both sizes, always starting inactive", () => {
  for (const item of getClubMythics(CLUBS[0].id)) {
    for (const compact of [false, true]) {
      for (const animated of [false, true]) {
        const html = render(item, { compact, animated });
        assert.ok(html.includes(`data-motion-enabled="${animated}"`));
        assert.ok(html.includes('data-motion-active="false"'));
        assert.equal(html.includes('data-motion-active="true"'), false);
        assert.equal(classes(html).has("royal-compact"), compact);
      }
    }
  }
});

test("legacy Mythic records without a variant preserve their item ID and safely use the Prism finish", () => {
  const prism = getClubMythics(CLUBS[0].id).find(item => item.mythicVariant === "PRISM")!;
  const html = render({ ...prism, mythicVariant: undefined });
  assert.ok(html.includes(`data-item-id="${prism.id}"`));
  assert.ok(html.includes('data-mythic-variant="PRISM"'));
  assert.ok(classes(html).has("royal-prism"));
});

test("royal motion CSS starts paused, runs only under both gates and honors reduced-motion", async () => {
  const css = await readFile(new URL("../src/app/mythic-royal.css", import.meta.url), "utf8");
  assert.match(css, /\.royal-motion(?:\s*,[^{}]*)?\s*\{\s*animation-play-state:\s*paused\s*!important\s*;/);
  assert.match(css, /\.royal-mythic\[data-motion-active="true"\]\[data-motion-enabled="true"\]\s+\.royal-motion(?:\s*,[^{}]*)?\s*\{\s*animation-play-state:\s*running\s*!important\s*;/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.royal-mythic\s+\.royal-motion(?:\s*,[^{}]*)?\s*\{\s*animation:\s*none\s*!important\s*;/);
  const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.ok(layout.includes('import "./mythic-royal.css"'), "motion rules must be imported into the application");
});

test("enabled artwork subscribes to shared visible-motion cleanup without excluding compact equipment", async () => {
  const source = await readFile(new URL("../src/components/ui/MythicArt.tsx", import.meta.url), "utf8");
  const effect = source.match(/useEffect\(\(\) => \{([\s\S]*?)\},\s*\[animated\]\)/)?.[1];
  assert.ok(effect, "effect must re-subscribe when the explicit animation switch changes");
  assert.match(effect, /if\s*\(!shell\.current\s*\|\|\s*!animated\)\s*return/);
  assert.match(effect, /return\s+observeVisibleMotion\(shell\.current\)/);
  assert.equal(/\bcompact\b/.test(effect), false, "compact profile/header gear must use the same visibility and tab gates");
  assert.equal(/(?:requestAnimationFrame|setInterval|setTimeout)\s*\(/.test(source), false, "ambient artwork must not create timer or frame loops");
});
