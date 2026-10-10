import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLUBS } from "../src/data/clubs";
import { getClubMythics } from "../src/data/clubCosmetics";
import { MYTHIC_FINISHES, MythicArt } from "../src/components/ui/MythicArt";
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
  PRISM: "royal-shard", SOVEREIGN: "royal-court-aura", AURORA: "royal-aurora-veil",
  CELESTIAL: "royal-galaxy-cloud", PHOENIX: "royal-flare", COMET: "royal-comet-field",
  REGALIA: "royal-regalia-bezel", LEGACY: "royal-title-corner",
};

for (const item of getClubMythics(CLUBS[0].id)) {
  test(`upgraded ${item.mythicVariant} keeps its own geometry and intentionally scales compact detail`, () => {
    const variant = item.mythicVariant!;
    for (const compact of [false, true]) {
      const html = render(item, compact), tags = elements(html);
      const count = (name: string, expected: number) => assert.equal(withClass(tags, name).length, expected, variant + ": " + name);
      assert.equal(withClass(tags, "royal-mythic")[0].attributes["data-mythic-fx"], "4");
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
      const finish = variant === "SOVEREIGN" || variant === "AURORA" || variant === "CELESTIAL" || variant === "COMET" || variant === "REGALIA" ? MYTHIC_FINISHES[variant] : undefined;
      count("royal-finish", finish ? 1 : 0);
      count("royal-finish-lustre", finish ? 1 : 0); count("royal-finish-sweep", finish ? 1 : 0);
      if (finish) {
        const frame = withClass(tags, "royal-finish")[0];
        assert.equal(frame.classes.has("royal-motion"), true, "the finish must retain the shared motion-gate hook independently of the club crest");
        assert.equal(frame.attributes["aria-hidden"], "true");
        assert.ok(frame.classes.has("royal-finish-" + variant.toLowerCase()));
        const reflection = withClass(tags, "royal-finish-lustre")[0];
        assert.equal(reflection.attributes["data-lustre-ready"], "false");
        assert.equal(reflection.attributes.style, undefined, "frame reflection must wait for responsive image pixels, not make its own eager request");
        assert.ok(withClass(tags, "royal-finish-sweep")[0].classes.has("royal-motion"));
        assert.ok(tags.some(tag => tag.tag === "img" && (tag.attributes.src ?? "").includes(encodeURIComponent(finish))));
        for (const obsolete of ["royal-seal-rays", "royal-seal-ring", "royal-seal-sweep", "royal-sigil", "royal-aurora-field", "royal-aurora", "royal-nebula", "royal-orbit-plane", "royal-orbit", "royal-planet", "royal-satellite"]) count(obsolete, 0);
        assert.equal(tags.some(tag => /^(?:defs|lineargradient|animate|animatemotion|animatetransform)$/i.test(tag.tag)), false, "accent geometry must not introduce duplicate gradient IDs or unmanaged SVG motion");
        if (variant !== "AURORA") assert.equal(tags.some(tag => tag.tag === "svg"), false, "only Aurora uses static curved SVG accents");
      }
      switch (variant) {
        case "PRISM": count("royal-prism", 2); count("royal-shard", compact ? 2 : 4); break;
        case "SOVEREIGN":
          count("royal-court-aura", 1); count("royal-court-jewel", 2);
          assert.equal(Array.from(html.matchAll(/<span class="royal-court-jewel [^"]*"[^>]*><i><\/i><\/span>/g)).length, 2, "each gated orbit must carry its own visible diamond");
          break;
        case "AURORA": {
          count("royal-aurora-veil", 1); count("royal-light-ribbon", 2); count("royal-flow-geometry", 2);
          const artwork = tags.filter(tag => tag.tag === "svg");
          assert.equal(artwork.length, 2);
          for (const svg of artwork) {
            assert.equal(svg.attributes.viewBox, "0 0 100 100");
            assert.equal(svg.attributes["aria-hidden"], "true"); assert.equal(svg.attributes.focusable, "false");
            assert.equal(svg.classes.has("royal-motion"), false, "animate the ribbon wrapper, never its SVG paint tree");
          }
          const paths = tags.filter(tag => tag.tag === "path");
          assert.equal(paths.length, 6, "each ribbon retains a filled curved body and two curved edge highlights");
          for (const path of paths) assert.ok(path.attributes.d.includes("C"), "Aurora must remain curved light, not straight bars");
          assert.equal(tags.some(tag => tag.attributes.id), false, "static ribbons need no shared paint-server IDs");
          break;
        }
        case "CELESTIAL":
          count("royal-galaxy-cloud", 1); count("royal-constellation", 2); count("royal-orbit-track", 2);
          for (const track of withClass(tags, "royal-orbit-track")) assert.equal(track.classes.has("royal-motion"), false, "ellipse planes remain fixed while their stars orbit");
          assert.equal(Array.from(html.matchAll(/<div class="royal-orbit-track [^"]*"[^>]*><span class="royal-constellation [^"]*"><i><\/i><b><\/b><\/span><\/div>/g)).length, 2, "each fixed orbit plane contains a gated star owner with two visible stars");
          break;
        case "PHOENIX":
          count("royal-wing", 1); count("royal-flare", 1); count("royal-plume", compact ? 0 : 2); count("royal-ember", compact ? 3 : 6);
          assert.ok(tags.some(tag => tag.tag === "img" && (tag.attributes.src ?? "").includes(encodeURIComponent("/assets/mythic/phoenix-mantle.webp"))));
          break;
        case "COMET": count("royal-comet-field", 1); count("royal-comet", 3); count("royal-comet-wake", compact ? 0 : 1); break;
        case "REGALIA": {
          count("royal-regalia-bezel", 1); count("royal-regalia-radiance", compact ? 0 : 1);
          count("royal-regalia-glint", compact ? 2 : 4);
          for (const obsolete of ["royal-regalia-ring", "royal-regalia-facet", "royal-gem", "royal-regalia-ornament"]) count(obsolete, 0);
          const bezel = withClass(tags, "royal-regalia-bezel")[0];
          assert.equal(bezel.classes.has("royal-motion"), false, "the inner setting stays aligned with the equipped avatar");
          assert.equal(bezel.attributes["aria-hidden"], "true");
          for (const glint of withClass(tags, "royal-regalia-glint")) {
            assert.equal(glint.classes.has("royal-motion"), true, "jewelry glints use the same offscreen/manual/reduced-motion gate");
            assert.equal(glint.attributes["aria-hidden"], "true");
          }
          assert.equal(tags.some(tag => tag.tag === "svg" || tag.tag === "path"), false, "crown material must come from the sculpted finish, not the old octagon");
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

test("five unique sculpted frame paths surround all 73 private crests without replacing owned avatar or achievement identity", () => {
  assert.deepEqual(MYTHIC_FINISHES, {
    SOVEREIGN: "/assets/mythic-finishes/sovereign-v3.webp",
    AURORA: "/assets/mythic-finishes/aurora-v3.webp",
    CELESTIAL: "/assets/mythic-finishes/celestial-v3.webp",
    COMET: "/assets/mythic-finishes/comet-v3.webp",
    REGALIA: "/assets/mythic-finishes/regalia-v5.webp",
  });
  assert.equal(new Set(Object.values(MYTHIC_FINISHES)).size, 5);
  let count = 0;
  for (const club of CLUBS) for (const [variant, src] of Object.entries(MYTHIC_FINISHES)) {
    const item = getClubMythics(club.id).find(candidate => candidate.mythicVariant === variant);
    assert.ok(item, club.id + ": " + variant);
    assert.equal(item.image, "/assets/mythic-clubs/" + club.id + ".webp");
    assert.notEqual(item.image, src, "shared finish must not become the club's owned crest");
    for (const compact of [false, true]) {
      const html = render(item, compact), tags = elements(html);
      assert.equal(withClass(tags, "royal-mythic")[0].attributes["data-item-id"], item.id);
      const frame = html.match(/<div class="royal-finish [^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
      const core = html.match(/<div class="royal-core-media">([\s\S]*?)<\/div>/)?.[1];
      assert.ok(frame); assert.ok(core);
      const frameImages = elements(frame).filter(tag => tag.tag === "img");
      const coreImages = elements(core).filter(tag => tag.tag === "img");
      assert.equal(frameImages.length, 1); assert.equal(coreImages.length, 1);
      assert.ok(frameImages[0].attributes.src.includes(encodeURIComponent(src)));
      assert.ok(coreImages[0].attributes.src.includes(encodeURIComponent(item.image!)));
      assert.equal(coreImages[0].attributes.src.includes(encodeURIComponent(src)), false);
      assert.equal(tags.some(tag => /^(?:lineargradient|animate|animatemotion|animatetransform)$/i.test(tag.tag)), false);
      count += 1;
    }
  }
  assert.equal(count, 730);
});

test("all five sculpted frames contain distinct substantial artwork, a genuinely open center and transparent corners within 200KB", async () => {
  const encodedHashes = new Set<string>(), decodedHashes = new Set<string>();
  for (const [variant, path] of Object.entries(MYTHIC_FINISHES)) {
    const file = await readFile(new URL("../public" + path, import.meta.url));
    assert.ok(file.byteLength > 0 && file.byteLength < 200000, variant + " must stay within its 200000-byte image budget");
    encodedHashes.add(createHash("sha256").update(file).digest("hex"));
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, "webp", variant);
    assert.equal(metadata.width, 640, variant); assert.equal(metadata.height, 640, variant);
    assert.equal(metadata.hasAlpha, true, variant + " must preserve real alpha, not a painted background");
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    decodedHashes.add(createHash("sha256").update(data).digest("hex"));
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    assert.equal(alpha(320, 320), 0, variant + " must leave the club crest's exact center genuinely open");
    for (const [x, y] of [[0, 0], [639, 0], [0, 639], [639, 639]]) assert.equal(alpha(x, y), 0, variant + " corner " + x + "," + y);
    let visiblePerimeter = 0, opaquePerimeter = 0;
    for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
      const radius = Math.hypot(x - 319.5, y - 319.5);
      if (radius < info.width * .22) continue;
      const value = alpha(x, y);
      if (value >= 16) visiblePerimeter += 1;
      if (value >= 240) opaquePerimeter += 1;
    }
    assert.ok(visiblePerimeter > info.width * info.height * .05, variant + " needs substantial visible perimeter material");
    assert.ok(opaquePerimeter > info.width * info.height * .03, variant + " must not fake transparency with near-invisible artwork");
  }
  assert.equal(encodedHashes.size, 5, "the five frame files must not be renamed duplicates");
  assert.equal(decodedHashes.size, 5, "the five finishes must remain distinct after decoding, not just re-encoding");
});

test("Regalia generated source and optimized crown leave a genuinely transparent portrait-sized aperture", async context => {
  const specifications = [
    { path: "../design/source/mythic-finishes/regalia-v5.png", format: "png", centerY: .5574, radius: .24 },
    { path: "../public" + MYTHIC_FINISHES.REGALIA, format: "webp", centerY: .555, radius: .23 },
  ];
  for (const spec of specifications) {
    const file = await readFile(new URL(spec.path, import.meta.url));
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, spec.format);
    assert.equal(metadata.hasAlpha, true, spec.path + " must preserve the generated artwork's real transparency");
    assert.equal(metadata.width, metadata.height, "the round portrait aperture must not be stretched");
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const centerX = info.width * .5, centerY = info.height * spec.centerY, radius = info.width * spec.radius;
    let samples = 0, maximumAlpha = 0;
    for (let y = Math.ceil(centerY - radius); y <= Math.floor(centerY + radius); y += 1) {
      for (let x = Math.ceil(centerX - radius); x <= Math.floor(centerX + radius); x += 1) {
        if (Math.hypot(x - centerX, y - centerY) > radius) continue;
        maximumAlpha = Math.max(maximumAlpha, data[(y * info.width + x) * info.channels + 3]);
        samples += 1;
      }
    }
    assert.ok(samples > info.width * info.height * .15, "the clear aperture must fit a real portrait, not merely one transparent center pixel");
    assert.ok(maximumAlpha <= 10, spec.path + " crown material must not cover the selected avatar; maximum center alpha: " + maximumAlpha);
    context.diagnostic(spec.format + " crown aperture: " + samples + " pixels checked; max alpha " + maximumAlpha + "/255");
  }
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

test("v4 frames and visible accents retain real transform motion at noticeable durations in both full and compact cards", async () => {
  const blocks = await loadCss();
  const rules = ordinaryRules(blocks).filter(rule => !rule.parents.some(parent => /prefers-reduced-motion/.test(parent)));
  const seconds = (value: string) => {
    const match = value.match(/^([\d.]+)(ms|s)$/);
    assert.ok(match, "motion duration must be an explicit bounded time: " + value);
    return Number(match[1]) / (match[2] === "ms" ? 1000 : 1);
  };
  // Resolve this stylesheet's positive class-only motion rules, including compact
  // overrides. This is a CSS contract check, not a browser performance measure.
  const animationFor = (ownerClasses: string[], compact: boolean) => {
    const owners = new Set(ownerClasses);
    const available = new Set([...ownerClasses, "royal-mythic", ...(compact ? ["royal-compact"] : [])]);
    const applicable = rules.flatMap((rule, order) => selectors(rule.header).flatMap(selector => {
      if (!/^[.\w\s-]+$/.test(selector)) return [];
      const classes = Array.from(selector.matchAll(/\.([\w-]+)/g), match => match[1]);
      return classes.length && owners.has(classes[classes.length - 1]) && classes.every(name => available.has(name))
        ? [{ rule, order, specificity: classes.length }] : [];
    })).sort((left, right) => left.specificity - right.specificity || left.order - right.order);
    let name = "", duration = 0;
    for (const { rule } of applicable) {
      const values = declarations(rule.body);
      if (values.animation) {
        const shorthand = values.animation.match(/^([\w-]+)\s+([\d.]+(?:ms|s))\b/);
        assert.ok(shorthand, ownerClasses.join(" ") + " must not lose its actual looping motion");
        name = shorthand[1]; duration = seconds(shorthand[2]);
      }
      if (values["animation-name"]) name = values["animation-name"];
      if (values["animation-duration"]) duration = seconds(values["animation-duration"]);
    }
    return { name, duration };
  };
  const assertTransforms = (name: string) => {
    const transforms = new Set(blocks.filter(block => block.parents.includes("@keyframes " + name))
      .map(block => declarations(block.body).transform).filter(Boolean));
    assert.ok(transforms.size >= 2, name + " must change position or angle, not merely pulse opacity");
    assert.ok([...transforms].some(value => /\b(?:translate\w*|rotate\w*)\(/.test(value)), name + " must have visible positional/angular motion");
  };
  const frames = [
    ["sovereign", "royal-court-float", 4.8], ["aurora", "royal-aurora-float", 5.4],
    ["celestial", "royal-celestial-float", 6], ["comet", "royal-comet-float", 3.8],
  ] as const;
  assert.equal(new Set(frames.map(([, name]) => name)).size, 4, "each finish needs its own motion choreography");
  for (const [variant, name, duration] of frames) for (const compact of [false, true]) {
    assert.deepEqual(animationFor(["royal-finish", "royal-finish-" + variant, "royal-motion"], compact), { name, duration });
    assert.ok(duration > 0 && duration <= 10, "main finishes must move noticeably, not use the old 13–23s loops");
    assertTransforms(name);
  }
  const accents = [
    ["royal-court-jewel", 0, "royal-court-orbit", 7], ["royal-court-jewel", 1, "royal-court-orbit", 10],
    ["royal-light-ribbon", 0, "royal-light-flow", 3.8], ["royal-light-ribbon", 1, "royal-light-flow", 5.4],
    ["royal-constellation", 0, "royal-orbit-travel", 9], ["royal-constellation", 1, "royal-orbit-travel", 13],
    ["royal-comet", 0, "royal-comet-flight", 4.8], ["royal-comet", 1, "royal-comet-flight", 6], ["royal-comet", 2, "royal-comet-flight", 7.2],
  ] as const;
  for (const [owner, index, name, duration] of accents) for (const compact of [false, true]) {
    assert.deepEqual(animationFor([owner, owner + "-" + index, "royal-motion"], compact), { name, duration }, owner + " must not regress to compact opacity-only twinkling");
    assertTransforms(name);
  }
  assert.deepEqual(animationFor(["royal-comet-wake", "royal-motion"], false), { name: "royal-comet-wake", duration: 6 });
  assertTransforms("royal-comet-wake");
});

test("Regalia keeps its crown setting still while jewelry glints move without spinning or obscuring the club crest", async () => {
  const blocks = await loadCss();
  const rules = ordinaryRules(blocks).filter(rule => !rule.parents.some(parent => /prefers-reduced-motion/.test(parent)));
  const valuesFor = (selector: string) => rules.filter(rule => selectors(rule.header).includes(selector))
    .reduce((values, rule) => ({ ...values, ...declarations(rule.body) }), {} as Record<string, string>);
  assert.equal(valuesFor(".royal-finish-regalia").animation, "none", "a crown worn around an avatar must stay aligned rather than float away");
  for (const layer of ["royal-regalia-glint", "royal-regalia-radiance"]) {
    const values = valuesFor("." + layer);
    const animation = values.animation?.match(/^([\w-]+)\s+([\d.]+)s\b/);
    assert.ok(animation, layer + " needs actual jewelry motion, not a static effect label");
    assert.ok(Number(animation[2]) > 0 && Number(animation[2]) <= 12, layer + " motion must be bounded and perceptible");
    const frames = blocks.filter(block => block.parents.includes("@keyframes " + animation[1]) && !block.header.startsWith("@"));
    const transforms = new Set(frames.map(frame => declarations(frame.body).transform).filter(Boolean));
    assert.ok(transforms.size >= 2, layer + " must have real transform motion, not only an opacity toggle");
    assert.ok(frames.some(frame => declarations(frame.body).opacity !== undefined), layer + " highlights need their own gentle illumination choreography");
  }
  for (const selector of [".equipped-profile-frame .royal-core", ".equipped-profile-frame .royal-signature"]) {
    assert.equal(valuesFor(selector).display, "none", selector + " must not replace or cover the independently equipped avatar");
  }
});

test("an equipped crown replaces only the nested avatar surround and label, preserving its independently owned crest and living light", async () => {
  const rules = ordinaryRules(await loadCss());
  const scope = ".equipped-profile-portrait:has(.equipped-profile-frame .variant-regalia) .equipped-profile-avatar";
  const valuesFor = (selector: string) => rules.filter(rule => selectors(rule.header).includes(selector))
    .reduce((values, rule) => ({ ...values, ...declarations(rule.body) }), {} as Record<string, string>);
  for (const layer of ["royal-finish", "royal-signature"]) {
    assert.equal(valuesFor(scope + " ." + layer).display, "none", "the crown already supplies its own surround and club label");
  }
  const core = valuesFor(scope + " .royal-core");
  assert.equal(core.width, "87%", "the selected avatar crest must stay readable inside the crown's clear opening");
  assert.equal(core["--royal-core-padding"], "0px");
  assert.equal(core.background, "none"); assert.equal(core["box-shadow"], "none");
  assert.notEqual(core.display, "none"); assert.notEqual(core.visibility, "hidden");

  for (const rule of rules) {
    const values = declarations(rule.body);
    if (values.display !== "none" && values.visibility !== "hidden") continue;
    for (const selector of selectors(rule.header)) {
      if (selector.endsWith(".royal-finish")) {
        assert.equal(selector, scope + " .royal-finish", "a Crown-specific integration must never globally hide other avatar finishes");
      }
      if (selector.endsWith(".royal-signature")) {
        assert.ok([scope + " .royal-signature", ".royal-compact .royal-signature", ".equipped-profile-frame .royal-signature"].includes(selector), "standalone full-size avatar labels must remain visible: " + selector);
      }
      if (selector.includes(".equipped-profile-avatar")) {
        assert.ok([scope + " .royal-finish", scope + " .royal-signature"].includes(selector), "the worn crown must retain the avatar's own crest, alpha reflection, aura, ribbons and stars: " + selector);
      }
    }
  }

  const source = await readFile(new URL("../src/components/inventory/EquippedProfile.tsx", import.meta.url), "utf8");
  assert.match(source, /new Set\(state\.ownedItemIds\)/, "equipment must still be selected from owned items, not preview art");
  assert.match(source, /item\.type\s*===\s*slot\s*&&\s*owned\.has\(item\.id\)/, "frame and avatar slots must validate ownership independently");
  assert.match(source, /className="equipped-profile-frame"><CosmeticArt item=\{equipped\.FRAME\} animated\//);
  assert.match(source, /className="equipped-profile-avatar">\{equipped\.AVATAR\s*\?\s*<CosmeticArt item=\{equipped\.AVATAR\} animated\//, "a crown must not substitute its own club crest for the selected avatar");
  for (const variant of ["AURORA", "CELESTIAL"]) {
    const avatar = getClubMythics(CLUBS[1].id).find(item => item.mythicVariant === variant)!;
    const html = render(avatar), tags = elements(html);
    assert.equal(withClass(tags, "royal-finish").length, 1, "standalone avatar artwork keeps its own finish");
    assert.equal(withClass(tags, "royal-signature").length, 1, "the nested label is hidden by the worn-crown scope, not removed globally");
    assert.equal(withClass(tags, "royal-lustre").length, 1);
    assert.equal(withClass(tags, "royal-star").length, 4);
    assert.equal(withClass(tags, "royal-core").length, 1);
    assert.ok(tags.some(tag => tag.tag === "img" && (tag.attributes.src ?? "").includes(encodeURIComponent(avatar.image!))));
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

test("crest and sculpted-frame reflections reuse loaded responsive pixels and stay hidden until their masks are ready", async () => {
  const source = await readFile(new URL("../src/components/ui/MythicArt.tsx", import.meta.url), "utf8");
  assert.match(source, /onLoad=\{event\s*=>\s*\{/);
  assert.match(source, /event\.currentTarget\.currentSrc/);
  assert.match(source, /const\s+node\s*=\s*lustre\.current/);
  assert.match(source, /if\s*\(!node\)\s*return/);
  assert.match(source, /node\.style\.maskImage\s*=\s*mask/);
  assert.match(source, /node\.style\.setProperty\("-webkit-mask-image",\s*mask\)/);
  assert.match(source, /node\.dataset\.lustreReady\s*=\s*"true"/);
  const frame = source.match(/function RoyalFinish\b[\s\S]*?(?=\n\/\*\*)/)?.[0];
  assert.ok(frame, "sculpted frames need their own image-load reflection lifecycle");
  assert.match(frame, /onLoad=\{event\s*=>\s*\{/);
  assert.match(frame, /if\s*\(!lustre\.current\)\s*return/);
  assert.match(frame, /event\.currentTarget\.currentSrc/);
  assert.match(frame, /lustre\.current\.style\.maskImage\s*=\s*mask/);
  assert.match(frame, /lustre\.current\.style\.setProperty\("-webkit-mask-image",\s*mask\)/);
  assert.match(frame, /lustre\.current\.dataset\.lustreReady\s*=\s*"true"/);
  assert.match(source, /<RoyalFinish\s+key=\{variant\}/, "changing a finish must reset its loaded-image mask");
  assert.equal(/\b(?:useState|fetch|XMLHttpRequest)\b/.test(source), false, "a loaded crest reflection must not create React updates or its own network request");
  const rules = ordinaryRules(await loadCss());
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-core-media") && declarations(rule.body).position === "relative"), "the image/mask pair needs its own shared positioning reference");
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-lustre") && declarations(rule.body).inset === "0"), "the reflection must exactly cover that same content box");
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-lustre") && declarations(rule.body).opacity === "0"), "uninitialized mask must never become an unmasked rectangle");
  assert.ok(rules.some(rule => selectors(rule.header).includes('.royal-lustre[data-lustre-ready="true"]') && declarations(rule.body).opacity === "1"));
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-finish") && ["absolute", "relative"].includes(declarations(rule.body).position)), "frame image and reflection need a shared positioning reference");
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-finish-lustre") && declarations(rule.body).inset === "0"));
  assert.ok(rules.some(rule => selectors(rule.header).includes(".royal-finish-lustre") && declarations(rule.body).opacity === "0"), "frame reflection must remain hidden before its image is loaded");
  assert.ok(rules.some(rule => selectors(rule.header).includes('.royal-finish-lustre[data-lustre-ready="true"]') && declarations(rule.body).opacity === "1"));
});

test("equipped effect art stays fully opaque in its own in-flow showcase", async () => {
  const inventory = ordinaryRules(cssBlocks((await readFile(new URL("../src/app/inventory-upgrade.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "")));
  const base = inventory.filter(rule => rule.parents.length === 0 && selectors(rule.header).includes(".equipped-profile-effect"))
    .reduce((values, rule) => ({ ...values, ...declarations(rule.body) }), {} as Record<string, string>);
  assert.equal(base.position, "relative", "effect must not sit behind the avatar or title");
  assert.equal(base.opacity, "1", "never fade the entire equipped item");
  assert.notEqual(base["z-index"], "-1", "equipped effect is an item showcase, not a background watermark");
  const royal = ordinaryRules(await loadCss());
  for (const selector of [".equipped-profile-effect .royal-core", ".equipped-profile-effect .royal-signature"]) {
    const values = royal.filter(rule => selectors(rule.header).includes(selector))
      .reduce((values, rule) => ({ ...values, ...declarations(rule.body) }), {} as Record<string, string>);
    assert.equal(values.opacity, "1", selector + " must not apply a second opacity multiplier");
  }
  assert.ok(inventory.some(rule => rule.parents.includes("@media (max-width: 700px)")
    && selectors(rule.header).includes(".equipped-profile-effect") && declarations(rule.body).flex === "1 0 100%"), "mobile effect needs its own row rather than overlapping profile text");
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
