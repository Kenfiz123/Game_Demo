import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLUBS } from "../src/data/clubs";
import { getClubMythics } from "../src/data/clubCosmetics";
import { MythicArt } from "../src/components/ui/MythicArt";

// TSX retains the repository's classic runtime in node-based SSR tests.
Object.assign(globalThis, { React });

const legacyItems = CLUBS.map(club => {
  const item = getClubMythics(club.id).find(candidate => candidate.mythicVariant === "LEGACY");
  assert.ok(item, club.id + " must retain its Legacy title");
  return item;
});
const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => entities[character]);

test("all 73 Legacy titles preserve exact NFC Vietnamese text without hidden glyph separators", () => {
  assert.equal(legacyItems.length, 73);
  for (const item of legacyItems) {
    assert.ok(item.heritage, item.id + " must retain its mentor");
    assert.equal(item.name, "Truyền Nhân Của " + item.heritage, item.id);
    assert.equal(item.name, item.name.normalize("NFC"), item.id);
    assert.doesNotMatch(item.name, /[\u00AD\u200B-\u200D\u2060\uFEFF\uFFFD]/u, item.id);
  }
  assert.equal(legacyItems.find(item => item.clubId === "js-hn")?.name, "Truyền Nhân Của Ada Lovelace");
});

test("full and compact Legacy plaques render all 73 native title strings without glyph-splitting markup", () => {
  let count = 0;
  for (const item of legacyItems) {
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(MythicArt, { item, compact, animated: false }));
      assert.ok(html.includes("<strong>" + escapeHtml(item.name) + "</strong>"), item.id + " must render one unbroken native title");
      count += 1;
    }
  }
  assert.equal(count, 146);
});

test("Legacy, collection, spotlight and ceremony share the Vietnamese-capable royal serif stack", async () => {
  const filenames = ["globals.css", "mythic-royal.css", "clubs-royal.css", "mythic-ceremony.css"];
  const styles = new Map(await Promise.all(filenames.map(async filename => [
    filename, (await readFile(new URL("../src/app/" + filename, import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, ""),
  ] as const)));
  const root = styles.get("globals.css")!.match(/:root\s*\{([^{}]*)\}/)?.[1];
  assert.ok(root);
  assert.match(root, /--font-royal\s*:\s*Cambria\s*,\s*"Times New Roman"\s*,\s*"Noto Serif"\s*,\s*serif\s*;/);

  const selectors = [
    ["mythic-royal.css", ".royal-legacy-copy strong"],
    ["clubs-royal.css", ".royal-clubs-page .royal-collection-heading h1"],
    ["clubs-royal.css", ".royal-spotlight-intro h3"],
    ["clubs-royal.css", ".royal-spotlight-copy h4"],
    ["mythic-ceremony.css", ".mythic-ceremony-heading h2"],
  ] as const;
  for (const [filename, selector] of selectors) {
    const rules = Array.from(styles.get(filename)!.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      .filter(match => match[1].split(",").some(candidate => candidate.trim() === selector));
    const families = rules.flatMap(match => Array.from(match[2].matchAll(/\bfont-family\s*:\s*([^;{}]+)/g), declaration => declaration[1].trim()));
    assert.ok(families.length > 0, filename + " must set " + selector + " font family");
    for (const family of families) assert.equal(family, "var(--font-royal)", selector);
  }
  for (const [filename, css] of styles) {
    for (const declaration of css.matchAll(/\bfont-family\s*:\s*([^;{}]+)/g)) {
      assert.doesNotMatch(declaration[1], /\bGeorgia\b/i, filename + " must not reintroduce a mixed-glyph Georgia stack");
    }
  }
});
