import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLUBS } from "../src/data/clubs";
import { getClubMythics } from "../src/data/clubCosmetics";
import { MythicArt } from "../src/components/ui/MythicArt";
import type { CosmeticItem, MythicVariant } from "../src/types/gamification";

Object.assign(globalThis, { React });

interface ElementTag { tag: string; attributes: Record<string, string>; classes: Set<string>; }
interface CssBlock { header: string; body: string; parents: readonly string[]; }

const render = (item: CosmeticItem, compact = false, animated = true) =>
  renderToStaticMarkup(createElement(MythicArt, { item, compact, animated }));
const elements = (html: string): ElementTag[] => Array.from(html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi), ([, tag, content]) => {
  const attributes = Object.fromEntries(Array.from(content.matchAll(/([\w:-]+)="([^"]*)"/g), ([, key, value]) => [key, value]));
  return { tag, attributes, classes: new Set((attributes.class ?? "").split(/\s+/).filter(Boolean)) };
});
const withClass = (tags: ElementTag[], name: string) => tags.filter(tag => tag.classes.has(name));

// Inspect balanced blocks rather than matching only the first frame/media rule.
// Quoted CSS values can contain braces; they are not structural delimiters.
function structuralCharacter(css: string, start: number, wanted: "{" | "}") {
  let quote = "";
  for (let index = start; index < css.length; index += 1) {
    const character = css[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === wanted) return index;
  }
  return -1;
}

function cssBlocks(css: string, parents: readonly string[] = []): CssBlock[] {
  const blocks: CssBlock[] = [];
  let cursor = 0;
  while (cursor < css.length) {
    const open = structuralCharacter(css, cursor, "{");
    if (open < 0) break;
    const header = css.slice(cursor, open).trim();
    let end = open + 1, depth = 1;
    while (depth > 0) {
      const nextOpen = structuralCharacter(css, end, "{");
      const nextClose = structuralCharacter(css, end, "}");
      assert.ok(nextClose >= 0, "CSS blocks must be balanced");
      if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; end = nextOpen + 1; }
      else { depth -= 1; end = nextClose + 1; }
    }
    const body = css.slice(open + 1, end - 1);
    blocks.push({ header, body, parents });
    if (header.startsWith("@")) blocks.push(...cssBlocks(body, [...parents, header]));
    cursor = end;
  }
  return blocks;
}

const declarations = (body: string) => Object.fromEntries(Array.from(body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]*)/g), ([, property, value]) => [property, value.trim()]));
const selectors = (header: string) => header.split(",").map(selector => selector.trim());
const loadCss = async () => cssBlocks((await readFile(new URL("../src/app/mythic-royal.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, ""));
const ordinaryRules = (blocks: CssBlock[]) => blocks.filter(block => !block.header.startsWith("@") && !block.parents.some(parent => /^@(?:-webkit-)?keyframes\b/.test(parent)));

const exclusiveGeometry: Record<MythicVariant, string> = {
  PRISM: "royal-shard", SOVEREIGN: "royal-seal-rays", AURORA: "royal-aurora-field",
  CELESTIAL: "royal-orbit-plane", PHOENIX: "royal-flare", COMET: "royal-comet-field",
  REGALIA: "royal-regalia-ornament", LEGACY: "royal-title-corner",
};

for (const item of getClubMythics(CLUBS[0].id)) {
  test(`upgraded ${item.mythicVariant} keeps its own geometry and intentionally scales compact detail`, () => {
    const variant = item.mythicVariant!;
    for (const compact of [false, true]) {
      const html = render(item, compact), tags = elements(html);
      const count = (name: string, expected: number) => assert.equal(withClass(tags, name).length, expected, variant + ": " + name);
      assert.equal(withClass(tags, "royal-mythic")[0].attributes["data-mythic-fx"], "2");
      for (const [other, marker] of Object.entries(exclusiveGeometry)) assert.equal(withClass(tags, marker).length > 0, other === variant, variant + " must not borrow " + other + " geometry");
      count("royal-atmosphere", compact ? 0 : 1);
      count("royal-horizon", variant === "LEGACY" ? 0 : 1);
      count("royal-star", variant === "REGALIA" ? 0 : compact ? 2 : 4);
      count("royal-lustre", 1); count("royal-metal-sweep", 1);
      count("royal-core-media", 1);
      const media = html.match(/<div class="royal-core-media">([\s\S]*?)<\/div>/)?.[1];
      assert.ok(media, "crest image and its mask must share one content box inside the padded core");
      const mediaTags = elements(media);
      assert.ok(mediaTags.some(tag => tag.tag === "img" && (tag.attributes.src ?? "").includes(encodeURIComponent(item.image!))));
      assert.equal(withClass(mediaTags, "royal-lustre").length, 1, "reflection must not be a sibling aligned to the padded outer core");
      const lustre = withClass(tags, "royal-lustre")[0];
      assert.equal(lustre.attributes["data-lustre-ready"], "false", "the reflection must wait for the actual responsive image to load");
      assert.equal(lustre.attributes.style, undefined, "SSR must not eagerly download a second raw 512px CSS mask per card");
      assert.equal(withClass(tags, "royal-core")[0].classes.has("royal-motion"), false, "the crest itself must not spin with its surround");
      switch (variant) {
        case "PRISM": count("royal-prism", 2); count("royal-shard", compact ? 2 : 4); break;
        case "SOVEREIGN": count("royal-seal-rays", 1); count("royal-seal-ring", 1); count("royal-seal-sweep", 1); count("royal-sigil", 2); break;
        case "AURORA": {
          const ribbons = compact ? 2 : 3;
          count("royal-aurora-field", 1); count("royal-aurora", ribbons);
          const artwork = tags.filter(tag => tag.tag === "svg");
          assert.equal(artwork.length, ribbons);
          for (const svg of artwork) {
            assert.equal(svg.attributes.viewBox, "0 0 300 300");
            assert.equal(svg.attributes["aria-hidden"], "true"); assert.equal(svg.attributes.focusable, "false");
            assert.equal(svg.classes.has("royal-motion"), false, "animate a compositor wrapper, not the SVG paint tree");
          }
          const paths = tags.filter(tag => tag.tag === "path");
          assert.equal(paths.length, ribbons * 3, "soft ribbons need broad, medium and hairline strokes");
          for (const path of paths) assert.ok(path.attributes.d.includes("C"), "Aurora must use curved ribbons, not angular polygon shards");
          assert.equal(tags.filter(tag => tag.tag === "stop").length, ribbons * 4);
          assert.equal(tags.some(tag => /^(?:animate|animatemotion|animatetransform)$/i.test(tag.tag)), false, "SVG must not introduce motion outside the shared CSS gates");
          break;
        }
        case "CELESTIAL": {
          count("royal-nebula", 1);
          for (const name of ["royal-orbit-plane", "royal-orbit", "royal-planet", "royal-satellite"]) count(name, compact ? 2 : 3);
          for (const plane of withClass(tags, "royal-orbit-plane")) assert.equal(plane.classes.has("royal-motion"), false, "fixed 3D orbit tilt must not be replaced by a flat spinning plane");
          break;
        }
        case "PHOENIX":
          count("royal-wing", 1); count("royal-flare", 1); count("royal-plume", compact ? 0 : 2); count("royal-ember", compact ? 3 : 6);
          assert.ok(tags.some(tag => tag.tag === "img" && (tag.attributes.src ?? "").includes(encodeURIComponent("/assets/mythic/phoenix-mantle.webp"))));
          break;
        case "COMET": count("royal-comet-field", 1); count("royal-comet", 3); break;
        case "REGALIA": {
          count("royal-regalia-ring", 1); count("royal-regalia-facet", 1); count("royal-gem", 4); count("royal-regalia-ornament", 1);
          const ornament = withClass(tags, "royal-regalia-ornament")[0];
          assert.equal(ornament.tag, "svg"); assert.equal(ornament.classes.has("royal-motion"), false);
          assert.equal(ornament.attributes["aria-hidden"], "true"); assert.equal(ornament.attributes.focusable, "false");
          assert.equal(tags.filter(tag => tag.tag === "path").length, 2);
          break;
        }
        case "LEGACY":
          count("royal-legacy-plaque", 1); count("royal-legacy-sweep", 1); count("royal-title-line", 1); count("royal-title-diamond", 1);
          count("royal-title-dust", compact ? 0 : 1); count("royal-title-corner", 4);
          for (const corner of withClass(tags, "royal-title-corner")) assert.equal(corner.classes.has("royal-motion"), false);
          assert.ok(tags.some(tag => tag.tag === "strong"), "heritage remains native title text, not a rasterized label");
          break;
      }
    }
  });
}

test("Aurora gradient IDs remain unique when duplicate club art and compact equipment render in one tree", () => {
  const first = getClubMythics(CLUBS[0].id).find(item => item.mythicVariant === "AURORA")!;
  const second = getClubMythics(CLUBS[1].id).find(item => item.mythicVariant === "AURORA")!;
  const html = renderToStaticMarkup(createElement("div", null,
    createElement(MythicArt, { item: first }),
    createElement(MythicArt, { item: second, compact: true }),
    createElement(MythicArt, { item: first }),
  ));
  const tags = elements(html);
  const gradients = tags.filter(tag => tag.tag.toLowerCase() === "lineargradient").map(tag => tag.attributes.id);
  assert.equal(gradients.length, 8);
  assert.ok(gradients.every(Boolean)); assert.equal(new Set(gradients).size, 8, "duplicate inventory cards must not collide with each other's SVG paint server");
  const references = tags.filter(tag => tag.tag === "g").map(tag => tag.attributes.stroke);
  assert.deepEqual(references.sort(), gradients.map(id => "url(#" + id + ")").sort(), "each ribbon must reference its own local gradient exactly once");
});

test("full and compact Mythic effects retain their identity with a bounded DOM and moving-layer budget", context => {
  const budgets: { variant: MythicVariant | undefined; compact: boolean; nodes: number; moving: number }[] = [];
  for (const item of getClubMythics(CLUBS[0].id)) for (const compact of [false, true]) {
    const tags = elements(render(item, compact));
    const shell = withClass(tags, "royal-mythic");
    assert.equal(shell.length, 1, item.id);
    assert.equal(shell[0].attributes["data-item-id"], item.id);
    assert.equal(shell[0].attributes["data-mythic-variant"], item.mythicVariant);
    assert.equal(shell[0].attributes["data-motion-active"], "false");
    assert.equal(shell[0].attributes["data-motion-enabled"], "true");
    assert.equal(shell[0].classes.has("royal-compact"), compact);
    assert.ok(tags.length <= (compact ? 55 : 65), item.id + " must not multiply decorative DOM nodes: " + tags.length);
    const moving = withClass(tags, "royal-motion").length;
    assert.ok(moving > 0 && moving <= (compact ? 8 : 16), item.id + " exceeds its moving-layer budget: " + moving);
    budgets.push({ variant: item.mythicVariant, compact, nodes: tags.length, moving });
    assert.ok(tags.some(tag => tag.tag === "img" && (tag.attributes.src ?? "").includes(encodeURIComponent(item.image!))), item.id + " must retain its actual per-club Mythic crest");
    assert.equal(render(item, compact).includes(encodeURIComponent(CLUBS[0].image)), false, "ordinary club art must never replace the exclusive Mythic crest");
    assert.equal(withClass(tags, "royal-core").length, 1, "equipment styling requires the shared core hook");
    if (item.mythicVariant === "LEGACY") {
      assert.equal(withClass(tags, "royal-legacy-plaque").length, 1);
      assert.equal(withClass(tags, "royal-legacy-copy").length, 1);
      assert.ok(render(item, compact).includes(item.name), "the native heritage title must remain readable text");
    } else assert.equal(withClass(tags, "royal-signature").length, 1);
  }
  context.diagnostic("Measured Mythic DOM/layers: " + JSON.stringify(budgets));
});

test("Mythic effect keyframes animate transform and opacity only, never repaint/layout properties", async () => {
  const blocks = await loadCss();
  const frames = blocks.filter(block => block.parents.some(parent => /^@(?:-webkit-)?keyframes\b/.test(parent)) && !block.header.startsWith("@"));
  assert.ok(frames.length > 0, "the upgraded effects must retain actual keyframes");
  for (const frame of frames) {
    const properties = Object.keys(declarations(frame.body));
    assert.ok(properties.length > 0, frame.header);
    for (const property of properties) assert.ok(["transform", "opacity"].includes(property), frame.parents.join(" → ") + ": " + property + " must stay static");
  }
});

test("motion gates pause animated elements and pseudo-elements by default, require both live flags, and honor reduced-motion", async () => {
  const rules = ordinaryRules(await loadCss());
  const paused = rules.filter(rule => /^paused\s*!important$/.test(declarations(rule.body)["animation-play-state"] ?? "")).flatMap(rule => selectors(rule.header));
  const running = rules.filter(rule => /^running\s*!important$/.test(declarations(rule.body)["animation-play-state"] ?? "")).flatMap(rule => selectors(rule.header));
  const reduced = rules.filter(rule => rule.parents.some(parent => /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(parent)) && /^none\s*!important$/.test(declarations(rule.body).animation ?? "")).flatMap(rule => selectors(rule.header));
  for (const suffix of ["", "::before", "::after"]) {
    assert.ok(paused.some(selector => selector.endsWith(".royal-motion" + suffix)), "default pause must include " + (suffix || "elements"));
    assert.ok(running.some(selector => selector.endsWith(".royal-motion" + suffix)), "live gate must include " + (suffix || "elements"));
    assert.ok(reduced.some(selector => selector.endsWith(".royal-motion" + suffix) || selector.endsWith("*" + suffix)), "reduced motion must include " + (suffix || "elements"));
  }
  assert.ok(running.length >= 3);
  for (const selector of running) {
    assert.ok(selector.includes('[data-motion-active="true"]'), "no offscreen or hidden-tab bypass: " + selector);
    assert.ok(selector.includes('[data-motion-enabled="true"]'), "no manual-pause bypass: " + selector);
  }
});

test("every CSS animation belongs to an explicitly gated motion layer, including pseudo-element owners", async () => {
  const rendered = getClubMythics(CLUBS[0].id).flatMap(item => [false, true].flatMap(compact => elements(render(item, compact))));
  const animated = ordinaryRules(await loadCss()).filter(rule => {
    const values = declarations(rule.body);
    const animation = values.animation ?? values["animation-name"] ?? values["-webkit-animation"] ?? values["-webkit-animation-name"];
    return animation && !/^none(?:\s*!important)?$/.test(animation);
  });
  assert.ok(animated.length > 0);
  for (const rule of animated) for (const selector of selectors(rule.header)) {
    const names = Array.from(selector.matchAll(/\.([\w-]+)/g), ([, name]) => name);
    assert.ok(names.length > 0, "animation needs a scoped class owner: " + selector);
    const owner = names[names.length - 1];
    const matches = withClass(rendered, owner);
    assert.ok(matches.length > 0, "animation selector must correspond to a rendered layer: " + selector);
    assert.ok(matches.every(tag => tag.classes.has("royal-motion")), "animation bypasses visibility/manual/reduced-motion gates: " + selector);
  }
});

test("the crest reflection reuses loaded responsive image pixels through a ref without a second eager mask request", async () => {
  const source = await readFile(new URL("../src/components/ui/MythicArt.tsx", import.meta.url), "utf8");
  assert.match(source, /onLoad=\{event\s*=>\s*\{/);
  assert.match(source, /event\.currentTarget\.currentSrc/);
  assert.match(source, /const\s+node\s*=\s*lustre\.current/);
  assert.match(source, /if\s*\(!node\)\s*return/);
  assert.match(source, /node\.style\.maskImage\s*=\s*mask/);
  assert.match(source, /node\.style\.setProperty\("-webkit-mask-image",\s*mask\)/);
  assert.match(source, /node\.dataset\.lustreReady\s*=\s*"true"/);
  assert.equal(/\b(?:useState|fetch|XMLHttpRequest)\b/.test(source), false, "a loaded crest reflection must not create React updates or its own network request");
  const rules = ordinaryRules(await loadCss());
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-core-media") && declarations(rule.body).position === "relative"), "the image/mask pair needs its own shared positioning reference");
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-lustre") && declarations(rule.body).inset === "0"), "the reflection must exactly cover that same content box");
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-lustre") && declarations(rule.body).opacity === "0"), "uninitialized mask must never become an unmasked rectangle");
  assert.ok(rules.some(rule => selectors(rule.header).includes('.royal-lustre[data-lustre-ready="true"]') && declarations(rule.body).opacity === "1"));
});

test("shared Mythic artwork rendering is deterministic, does not mutate rewards, and has no economy or timer dependencies", async () => {
  const source = await readFile(new URL("../src/components/ui/MythicArt.tsx", import.meta.url), "utf8");
  const allowed = new Set(["next/image", "react", "@/data/clubs", "@/data/mythicCatalog", "@/lib/visibleMotion", "@/types/gamification"]);
  for (const [, dependency] of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) assert.ok(allowed.has(dependency), "presentation must not import an economy/storage subsystem: " + dependency);
  assert.equal(/\b(?:requestAnimationFrame|setInterval|setTimeout|localStorage|sessionStorage|useXperience)\b/.test(source), false);
  assert.equal(/\b(?:Math\.random|crypto\.|playGame|tradeUp|equipItem|unequipItem)\b/.test(source), false);
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("Mythic artwork must never draw a reward or random decoration"); };
  try {
    for (const item of getClubMythics(CLUBS[0].id)) {
      const frozen = Object.freeze({ ...item });
      const before = JSON.stringify(frozen);
      for (const compact of [false, true]) assert.equal(render(frozen, compact), render(frozen, compact));
      assert.equal(JSON.stringify(frozen), before);
    }
  } finally { Math.random = originalRandom; }
});
