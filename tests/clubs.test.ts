import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLUBS, CLUB_GROUPS, normalizeClubSearch } from "../src/data/clubs";
import { CLUB_COSMETICS, CLUB_REWARD_TIERS, getClubMythics } from "../src/data/clubCosmetics";
import { getMythicImage, getMythicVariant, MYTHIC_VARIANTS } from "../src/data/mythicCatalog";
import { MythicSpotlight } from "../src/components/clubs/MythicSpotlight";
import { COSMETICS, cosmeticsByRarity, getCosmeticById } from "../src/data/cosmetics";
import { STARTING_EX_POINTS, TEST_EX_GRANT } from "../src/data/chestConfig";
import { createDemoState, parseStoredState } from "../src/lib/storage";
import { grantDemoPoints } from "../src/lib/demoPoints";
import { createOpening } from "../src/lib/gameEngine";
Object.assign(globalThis, { React });
test("all 73 source clubs in 10 groups are represented once", () => {
  assert.equal(CLUBS.length, 73); assert.equal(CLUB_GROUPS.length, 10);
  assert.equal(new Set(CLUBS.map(c => c.id)).size, 73);
  assert.deepEqual(CLUBS.map(c => c.number), Array.from({length:73}, (_,i) => i+1));
  assert.equal(CLUBS.find(c => c.id === "fcode")?.campus, "Hà Nội & Hồ Chí Minh");
});
test("every club has five lower-tier identities plus eight distinct royal Mythics", () => {
  assert.equal(CLUB_COSMETICS.length, 949); assert.equal(COSMETICS.length, 949);
  assert.equal(cosmeticsByRarity("MYTHIC").length, 584);
  assert.ok(COSMETICS.every(item => item.clubId));
  assert.equal(getCosmeticById("student-badge"), undefined);
  assert.equal(getCosmeticById("xperience-founder"), undefined);
  assert.equal(new Set(COSMETICS.map(c => c.id)).size, COSMETICS.length);
  assert.equal(new Set(CLUBS.map(c => c.title)).size, 73);
  for (const club of CLUBS) {
    const rewards = CLUB_COSMETICS.filter(item => item.clubId === club.id);
    assert.equal(rewards.length, 13);
    assert.deepEqual(rewards.slice(0,5).map(item => item.type), ["LOGO", "BADGE", "AVATAR", "TITLE", "FRAME"]);
    assert.deepEqual(rewards.map(item => item.rarity), ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", ...Array.from({length:8},()=>"MYTHIC")]);
    assert.deepEqual(rewards.map(item => item.id), [...CLUB_REWARD_TIERS.filter(tier=>tier.rarity!=="MYTHIC").map(tier=>tier.suffix), ...MYTHIC_VARIANTS.map(variant=>variant.suffix)].map(suffix=>"club-"+club.id+"-"+suffix));
    for (const item of rewards) {
      assert.equal(item.image, item.rarity === "MYTHIC" ? getMythicImage(club) : club.image);
      if (item.rarity === "MYTHIC") assert.notEqual(item.image, club.image);
      assert.equal(getCosmeticById(item.id), item);
      assert.ok(cosmeticsByRarity(item.rarity).includes(item));
    }
  }
});
test("the eight royal Mythic variants cover distinct collectible identities and preserve the old prism ID", () => {
  assert.equal(new Set(MYTHIC_VARIANTS.map(variant=>variant.variant)).size, 8);
  for (const club of CLUBS) {
    const mythics=getClubMythics(club.id);
    assert.equal(mythics.length,8);
    assert.deepEqual(mythics.map(item=>item.mythicVariant),MYTHIC_VARIANTS.map(variant=>variant.variant));
    assert.equal(mythics.find(item=>item.mythicVariant==="PRISM")?.id,"club-"+club.id+"-mythic");
    assert.equal(mythics.find(item=>item.mythicVariant==="LEGACY")?.type,"TITLE");
    assert.ok(mythics.find(item=>item.mythicVariant==="LEGACY")?.heritage);
    assert.equal(mythics.filter(item=>item.heritage).length,1);
    for (const item of mythics) assert.equal(item.type,getMythicVariant(item.mythicVariant).type);
  }
});
test("each club has an exclusive Mythic crest shared by its eight variants, never by another club or lower tier", () => {
  const clubPaths = CLUBS.map(club => getMythicImage(club));
  assert.equal(new Set(clubPaths).size, CLUBS.length, "different clubs must never share a Mythic crest path");
  assert.equal(new Set(cosmeticsByRarity("MYTHIC").map(item => item.image)).size, CLUBS.length);
  for (const club of CLUBS) {
    const path = "/assets/mythic-clubs/" + club.id + ".webp";
    assert.equal(getMythicImage(club), path);
    assert.notEqual(path, club.image, club.id + " must not reuse lower-tier artwork");
    const mythics = getClubMythics(club.id);
    assert.equal(mythics.length, MYTHIC_VARIANTS.length);
    for (const item of mythics) {
      assert.equal(item.image, path, item.id + " must use its own club's exclusive Mythic crest");
      assert.notEqual(item.image, club.image, item.id);
    }
  }
});
test("royal spotlight starts with Sovereign, eight native selectors, a pause control and one live artwork", () => {
  const mythics=getClubMythics(CLUBS[0].id);
  const html=renderToStaticMarkup(createElement(MythicSpotlight,{items:mythics,rarityChance:.2,chance:.2/cosmeticsByRarity("MYTHIC").length}));
  assert.equal(Array.from(html.matchAll(/aria-pressed="true"/g)).length,1);
  assert.equal(Array.from(html.matchAll(/aria-pressed="false"/g)).length,8); // Seven alternatives plus the pause button.
  assert.ok(html.includes(mythics.find(item=>item.mythicVariant==="SOVEREIGN")!.name));
  assert.ok(html.includes("0,000342%"));
  assert.ok(html.includes("Tạm dừng hiệu ứng xem trước"));
  assert.ok(html.includes("Xem trước không cấp vật phẩm"));
  assert.equal(Array.from(html.matchAll(/class="mythic-art\b/g)).length,1);
});
test("every club cosmetic can be drawn by the real chest engine", () => {
  const draw = {COMMON:.25, UNCOMMON:.65, RARE:.85, EPIC:.95, LEGENDARY:.99, MYTHIC:.999} as const;
  for (const item of CLUB_COSMETICS) {
    const pool = cosmeticsByRarity(item.rarity);
    const itemRandom = (pool.indexOf(item) + .5) / pool.length;
    let step = 0;
    const result = createOpening(createDemoState(), "chest", () => step++ === 0 ? draw[item.rarity as keyof typeof draw] : itemRandom);
    assert.ok(result.success); assert.equal(result.reward.item.id, item.id);
  }
});
test("original club logo/avatar/title IDs and saved ownership remain compatible", () => {
  const oldIds = CLUBS.flatMap(club => ["logo", "avatar", "title"].map(suffix => "club-" + club.id + "-" + suffix));
  const state = parseStoredState(JSON.stringify({exPoints:1234,ownedItemIds:oldIds,history:[]}));
  assert.equal(state.exPoints, 1234);
  assert.deepEqual(state.ownedItemIds, oldIds);
  for (const id of oldIds) assert.ok(getCosmeticById(id), id);
  for (const club of CLUBS) {
    assert.equal(getCosmeticById("club-" + club.id + "-logo")?.rarity, "COMMON");
    assert.equal(getCosmeticById("club-" + club.id + "-avatar")?.rarity, "RARE");
    assert.equal(getCosmeticById("club-" + club.id + "-title")?.name, club.title);
  }
});
test("every non-Mythic club cosmetic can also be won in Lucky Orbit", () => {
  const sectors = {COMMON:1, UNCOMMON:2, RARE:3, EPIC:5, LEGENDARY:0} as const;
  for (const item of CLUB_COSMETICS.filter(item => item.rarity !== "MYTHIC")) {
    const pool = cosmeticsByRarity(item.rarity);
    let step = 0;
    const result = createOpening(createDemoState(), "orbit", () => step++ === 0 ? (sectors[item.rarity as keyof typeof sectors] + .5) / 8 : (pool.indexOf(item) + .5) / pool.length);
    assert.ok(result.success); assert.equal(result.reward.item.id, item.id);
  }
});
test("ImageGen Mythic material is optimized, transparent, and has a clear central hole", async () => {
  const asset = fileURLToPath(new URL("../public/assets/mythic-prism-halo.webp", import.meta.url));
  const prompt = JSON.parse(await readFile(new URL("../design/mythic-art-prompt.json", import.meta.url), "utf8"));
  await access(new URL("../design/source/mythic-prism-halo.png", import.meta.url));
  const metadata = await sharp(asset).metadata();
  const stats = await sharp(asset).stats();
  const center = await sharp(asset).extract({left:300,top:300,width:40,height:40}).raw().toBuffer({resolveWithObject:true});
  const centerAlpha = Array.from(center.data).filter((_, index) => index % center.info.channels === 3);
  assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 640); assert.equal(metadata.height, 640);
  assert.equal(metadata.hasAlpha, true); assert.equal(stats.channels[3].min, 0);
  assert.ok(Math.max(...centerAlpha) <= 2, "emblem needs a transparent center, with only negligible lossy-alpha residue");
  assert.ok((await stat(asset)).size < 200_000);
  assert.equal(prompt.mode, "built-in image_gen");
  assert.ok(prompt.prompt.includes("kaleidoscope") && prompt.prompt.includes("transparent"));
});
test("ImageGen five-slot forge retains alpha and stays below 130KB", async () => {
  const asset = fileURLToPath(new URL("../public/assets/forge-five-slot.webp", import.meta.url));
  const prompt = JSON.parse(await readFile(new URL("../design/forge-art-prompt.json", import.meta.url), "utf8"));
  await access(new URL("../design/source/forge-five-slot.png", import.meta.url));
  const [metadata, stats, size] = await Promise.all([sharp(asset).metadata(), sharp(asset).stats(), stat(asset)]);
  assert.equal(metadata.format, "webp"); assert.equal(metadata.width, 1000); assert.equal(metadata.height, 667);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(stats.channels[3].min, 0); assert.ok(stats.channels[3].max > 0 && stats.channels[3].mean < 255);
  assert.ok(size.size < 130_000);
  assert.equal(prompt.mode, "built-in image_gen");
  assert.ok(prompt.prompt.toLowerCase().includes("five") && prompt.prompt.toLowerCase().includes("transparent"));
});
test("test credits start at 50000 and add 10000 without resetting progress", () => {
  assert.equal(STARTING_EX_POINTS, 50_000); assert.equal(TEST_EX_GRANT, 10_000);
  const opening = createOpening(createDemoState(), "chest", () => 0); assert.ok(opening.success);
  const before = structuredClone(opening.next);
  const after = grantDemoPoints(opening.next);
  assert.equal(after.exPoints, before.exPoints + TEST_EX_GRANT);
  assert.deepEqual(after.ownedItemIds, before.ownedItemIds);
  assert.deepEqual(after.history, before.history);
  assert.deepEqual(opening.next, before);
});
test("existing lower balances are not overwritten; a grant preserves legacy data", () => {
  const old = parseStoredState(JSON.stringify({exPoints:900,ownedItemIds:["student-badge"],history:[]}));
  assert.equal(old.exPoints, 900);
  const after = grantDemoPoints(old);
  assert.equal(after.exPoints, 10900);
  assert.deepEqual(after.ownedItemIds, ["student-badge"]);
});
test("test EX cannot overflow the safe integer range", () => {
  const state = {...createDemoState(),exPoints:Number.MAX_SAFE_INTEGER-1};
  assert.equal(grantDemoPoints(state).exPoints, Number.MAX_SAFE_INTEGER);
});
test("club search is accent-insensitive", () => {
  assert.equal(normalizeClubSearch("Câu lạc bộ Đà Nẵng"), "cau lac bo da nang");
  assert.ok(normalizeClubSearch(CLUBS.find(c=>c.id==="fvc-dn")!.name).includes("da nang"));
});
test("all club artwork exists, is compact WebP, and retains genuine transparency", async () => {
  await Promise.all(CLUBS.map(async club => {
    const asset = fileURLToPath(new URL("../public" + club.image, import.meta.url));
    const source = new URL("../design/source/clubs/" + club.id + ".png", import.meta.url);
    await access(source);
    const [metadata, stats, size] = await Promise.all([sharp(asset).metadata(), sharp(asset).stats(), stat(asset)]);
    assert.equal(metadata.format, "webp", club.id);
    assert.equal(metadata.width, 384, club.id);
    assert.equal(metadata.height, 384, club.id);
    assert.equal(metadata.hasAlpha, true, club.id);
    assert.ok(size.size < 100_000, club.id + " should remain below 100 KB");
    const alpha = stats.channels[3];
    assert.ok(alpha && alpha.min === 0 && alpha.max > 0 && alpha.mean < 255, club.id + " needs transparent margins and visible artwork");
  }));
});
test("the saved ImageGen prompt set covers every club exactly once", async () => {
  const prompts = JSON.parse(await readFile(new URL("../design/club-art-prompts.json", import.meta.url), "utf8")) as {id:string;prompt:string}[];
  assert.equal(prompts.length, 73);
  assert.deepEqual(prompts.map(prompt => prompt.id), CLUBS.map(club => club.id));
  assert.ok(prompts.every(prompt => prompt.prompt.includes("transparent") && prompt.prompt.includes("unofficial")));
});
