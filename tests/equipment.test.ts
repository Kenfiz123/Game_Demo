import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUBS } from "../src/data/clubs";
import { CLUB_COSMETICS, CLUB_REWARD_TIERS, getClubMythics } from "../src/data/clubCosmetics";
import { COSMETICS, cosmeticsByRarity, getCosmeticById } from "../src/data/cosmetics";
import { getMythicImage, getMythicTheme, getMythicVariant, MYTHIC_THEMES, MYTHIC_VARIANTS } from "../src/data/mythicCatalog";
import { getMythicHeritage } from "../src/data/mythicHeritage";
import { EQUIP_SLOTS, equipItemInState, getEquipSlot, sanitizeEquipped, unequipItemInState, validateEquipped } from "../src/lib/equipmentEngine";
import { createDemoState, parseStoredState, saveXperienceState, STORAGE_KEY } from "../src/lib/storage";
import { createOpening } from "../src/lib/gameEngine";
import { createTradeUp } from "../src/lib/tradeUpEngine";
import type { EquipSlot } from "../src/types/gamification";

test("all 73 clubs have five preserved lower tiers and eight separate Mythic inventory IDs", () => {
  assert.equal(COSMETICS.length, 949); assert.equal(CLUB_COSMETICS.length, 949);
  assert.equal(cosmeticsByRarity("MYTHIC").length, 584); assert.equal(CLUB_REWARD_TIERS.length, 6);
  assert.equal(new Set(COSMETICS.map(item => item.id)).size, 949);
  for (const club of CLUBS) {
    const items = CLUB_COSMETICS.filter(item => item.clubId === club.id);
    assert.equal(items.length, 13);
    assert.deepEqual(items.slice(0, 5).map(item => item.rarity), ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]);
    assert.deepEqual(items.slice(0, 5).map(item => item.image), Array(5).fill(club.image));
    const mythics = getClubMythics(club.id);
    assert.equal(mythics.length, 8);
    assert.deepEqual(mythics.map(item => item.mythicVariant), MYTHIC_VARIANTS.map(variant => variant.variant));
    assert.deepEqual(mythics.map(item => item.id), MYTHIC_VARIANTS.map(variant => "club-" + club.id + "-" + variant.suffix));
    assert.equal(getCosmeticById("club-" + club.id + "-mythic")?.mythicVariant, "PRISM");
    assert.deepEqual(mythics.map(item => item.image), Array(8).fill(getMythicImage(club)));
    assert.ok(mythics.every(item => item.image !== club.image && item.image === "/assets/mythic-clubs/" + club.id + ".webp"));
    assert.deepEqual(mythics.map(item => item.type), ["EFFECT", "LOGO", "AVATAR", "AVATAR", "TITLE", "EFFECT", "EFFECT", "FRAME"]);
  }
  assert.deepEqual(getClubMythics("unknown-club"), []);
});
test("club discipline metadata retains twelve themes without sharing the club-exclusive Mythic image paths", () => {
  assert.equal(MYTHIC_THEMES.length, 12);
  assert.equal(new Set(CLUBS.map(getMythicTheme)).size, 12);
  for (const club of CLUBS) assert.ok(MYTHIC_THEMES.includes(getMythicTheme(club)));
  for (const id of ["football-team-hn", "fptufc-hn", "ffc-hcm"]) assert.equal(getMythicTheme(CLUBS.find(club => club.id === id)!), "football");
  for (const id of ["vovinam-hn", "fvc-hcm", "fvc-dn", "taekwondo-hn", "nunchaku-hn", "muaythai-hn"]) assert.equal(getMythicTheme(CLUBS.find(club => club.id === id)!), "martial");
  assert.equal(getMythicTheme(CLUBS.find(club => club.id === "hnf-hcm")!), "technology");
  assert.equal(getMythicTheme(CLUBS.find(club => club.id === "beatking-hcm")!), "dance");
});
test("variant metadata identifies every cosmetic separately and falls back to legacy Prism safely", () => {
  for (const variant of MYTHIC_VARIANTS) assert.equal(getMythicVariant(variant.variant), variant);
  assert.equal(getMythicVariant().variant, "PRISM");
});
test("football legacy titles use the requested Messi inspiration without claiming endorsement", () => {
  for (const id of ["football-team-hn", "fptufc-hn", "ffc-hcm"]) {
    const item = getCosmeticById("club-" + id + "-mythic-title")!;
    assert.equal(item.name, "Truyền Nhân Của Messi"); assert.equal(item.heritage, "Messi");
    assert.ok(item.description.includes("không phải xác nhận"));
  }
  for (const club of CLUBS) {
    const heritage = getMythicHeritage(club);
    assert.ok(heritage.mentor.length > 0);
    assert.equal(getCosmeticById("club-" + club.id + "-mythic-title")?.heritage, heritage.mentor);
  }
  assert.equal(getMythicHeritage(CLUBS.find(club => club.id === "iskate-hn")!).isHistoricalPerson, false);
  assert.equal(getMythicHeritage(CLUBS.find(club => club.id === "unicamp-hn")!).isHistoricalPerson, false);
  assert.equal(getMythicHeritage(CLUBS.find(club => club.id === "dango-hn")!).mentor, "Bậc Thầy Thế Giới Mộng");
  assert.equal(getMythicHeritage(CLUBS.find(club => club.id === "jsc-hcm")!).mentor, "Bậc Thầy Nhật Phong");
  assert.equal(getMythicHeritage(CLUBS.find(club => club.id === "evo-dn")!).mentor, "Bậc Thầy Tổ Chức");
  assert.equal(getMythicHeritage(CLUBS.find(club => club.id === "hnf-hcm")!).mentor, "Vint Cerf");
});
test("all 584 Mythic IDs are individually reachable from the real chest engine", () => {
  const pool = cosmeticsByRarity("MYTHIC");
  for (let index = 0; index < pool.length; index++) {
    let step = 0;
    const result = createOpening(createDemoState(), "chest", () => step++ === 0 ? .999 : (index + .5) / pool.length);
    assert.ok(result.success); assert.equal(result.reward.item.id, pool[index].id);
  }
});
test("every owned Mythic variant can equip its proper slot without consuming copies or EX", () => {
  for (const item of cosmeticsByRarity("MYTHIC")) {
    const state = { ...createDemoState(), ownedItemIds: [item.id, item.id] };
    const before = structuredClone(state);
    const next = equipItemInState(state, item.id);
    assert.ok(next); assert.equal(next.equipped[item.type as EquipSlot], item.id);
    assert.equal(next.exPoints, state.exPoints); assert.deepEqual(next.ownedItemIds, state.ownedItemIds);
    assert.deepEqual(next.history, state.history); assert.deepEqual(next.tradeHistory, state.tradeHistory);
    assert.deepEqual(state, before);
  }
});
test("unowned, unknown, ordinary, and mismatched-slot items cannot equip", () => {
  const mythic = cosmeticsByRarity("MYTHIC")[0];
  assert.equal(equipItemInState(createDemoState(), mythic.id), null);
  assert.equal(equipItemInState({ ...createDemoState(), ownedItemIds: ["retired-item"] }, "retired-item"), null);
  for (const item of COSMETICS.filter(item => item.rarity !== "MYTHIC")) {
    assert.equal(getEquipSlot(item), null);
    assert.equal(equipItemInState({ ...createDemoState(), ownedItemIds: [item.id] }, item.id), null);
  }
  for (const item of getClubMythics(CLUBS[0].id)) {
    const state = { ...createDemoState(), ownedItemIds: [item.id] };
    for (const slot of EQUIP_SLOTS.filter(slot => slot !== item.type)) assert.equal(equipItemInState(state, item.id, slot), null);
  }
});
test("one selection per slot replaces only that slot and preserves independent avatar/effect variants", () => {
  const items = getClubMythics(CLUBS[0].id);
  let state = { ...createDemoState(), ownedItemIds: items.map(item => item.id) };
  const avatar1 = items.find(item => item.mythicVariant === "AURORA")!;
  const avatar2 = items.find(item => item.mythicVariant === "CELESTIAL")!;
  const prism = items.find(item => item.mythicVariant === "PRISM")!;
  const phoenix = items.find(item => item.mythicVariant === "PHOENIX")!;
  state = equipItemInState(state, avatar1.id)!;
  state = equipItemInState(state, prism.id)!;
  state = equipItemInState(state, avatar2.id)!;
  assert.deepEqual(state.equipped, { AVATAR: avatar2.id, EFFECT: prism.id });
  state = equipItemInState(state, phoenix.id)!;
  assert.deepEqual(state.equipped, { AVATAR: avatar2.id, EFFECT: phoenix.id });
  assert.deepEqual(state.ownedItemIds, items.map(item => item.id));
});
test("unequipping removes the slot, not the item; invalid runtime slots are rejected", () => {
  const item = cosmeticsByRarity("MYTHIC")[0];
  const owned = { ...createDemoState(), ownedItemIds: [item.id] };
  const equipped = equipItemInState(owned, item.id)!;
  const next = unequipItemInState(equipped, "EFFECT");
  assert.ok(next); assert.deepEqual(next.equipped, {}); assert.deepEqual(next.ownedItemIds, [item.id]);
  assert.equal(unequipItemInState(equipped, "BACKGROUND" as EquipSlot), null);
  assert.equal(equipped.equipped.EFFECT, item.id);
});
test("legacy v2 states without equipment keep exact balances, duplicate copies and history", () => {
  const item = getCosmeticById("club-" + CLUBS[0].id + "-mythic")!;
  const original = { ...createDemoState(), exPoints: 123, ownedItemIds: [item.id, item.id, "student-badge"] };
  const { equipped: _equipped, ...legacy } = original;
  assert.ok(_equipped);
  const parsed = parseStoredState(JSON.stringify(legacy));
  assert.deepEqual(parsed, original);
});
test("equipment persists across reload by independent item ID rather than artwork URL", () => {
  const items = getClubMythics(CLUBS[0].id);
  let state = { ...createDemoState(), ownedItemIds: items.map(item => item.id) };
  for (const slot of EQUIP_SLOTS) state = equipItemInState(state, items.find(item => item.type === slot)!.id)!;
  assert.deepEqual(parseStoredState(JSON.stringify(state)), state);
  assert.equal(Object.keys(state.equipped).length, 5);
  assert.equal(new Set(items.map(item => item.image)).size, 1);
});
test("malformed equipment is sanitized without changing inventory copies or balance", () => {
  const mythics = getClubMythics(CLUBS[0].id);
  const logo = mythics.find(item => item.type === "LOGO")!, avatar = mythics.find(item => item.type === "AVATAR")!;
  const ordinary = cosmeticsByRarity("COMMON")[0];
  const state = { ...createDemoState(), exPoints: 88, ownedItemIds: [logo.id, logo.id, avatar.id, ordinary.id] };
  const invalid = { LOGO: logo.id, AVATAR: logo.id, TITLE: "unowned", FRAME: ordinary.id, EFFECT: 123, UNKNOWN: avatar.id };
  assert.deepEqual(sanitizeEquipped(invalid, state.ownedItemIds), { LOGO: logo.id });
  assert.equal(validateEquipped(invalid, state.ownedItemIds), false);
  const parsed = parseStoredState(JSON.stringify({ ...state, equipped: invalid }));
  assert.deepEqual(parsed.equipped, { LOGO: logo.id }); assert.equal(parsed.exPoints, 88);
  assert.deepEqual(parsed.ownedItemIds, state.ownedItemIds);
});
test("invalid equipment cannot overwrite valid stored state", () => {
  const state = createDemoState(), raw = JSON.stringify(state);
  const values = new Map([[STORAGE_KEY, raw]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const unowned = cosmeticsByRarity("MYTHIC")[0];
  assert.equal(saveXperienceState({ ...state, equipped: { EFFECT: unowned.id } }, storage), false);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
test("equipped Mythics remain owned and equipped while ordinary trade-ups still cannot create Mythics", () => {
  const mythic = cosmeticsByRarity("MYTHIC")[0], input = cosmeticsByRarity("EPIC")[0];
  const state = equipItemInState({ ...createDemoState(), ownedItemIds: [mythic.id, ...Array(5).fill(input.id)] }, mythic.id)!;
  const trade = createTradeUp(state, Array(5).fill(input.id), () => 0); assert.ok(trade.success && trade.reward);
  assert.equal(trade.reward.item.rarity, "LEGENDARY"); assert.deepEqual(trade.next.equipped, state.equipped);
  assert.ok(trade.next.ownedItemIds.includes(mythic.id));
  const invalid = createTradeUp({ ...state, ownedItemIds: Array(5).fill(mythic.id) }, Array(5).fill(mythic.id), () => { throw new Error("Must not draw"); });
  assert.deepEqual(invalid, { success: false, reason: "UNSUPPORTED_RARITY" });
});
