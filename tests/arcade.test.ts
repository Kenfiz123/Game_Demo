import { test } from "node:test";
import assert from "node:assert/strict";
import { CHEST_RARITIES, DUPLICATE_COMPENSATION, STARTING_EX_POINTS } from "../src/data/chestConfig";
import { ORBIT_RARITIES, ORBIT_SECTORS, REEL_WINNER_INDEX, orbitLandingRotation } from "../src/data/arcadeConfig";
import { COSMETICS, cosmeticsByRarity } from "../src/data/cosmetics";
import { createOpening } from "../src/lib/gameEngine";
import { createDemoState, parseStoredState } from "../src/lib/storage";
import { pickWeightedRarity, pickItemOfRarity, secureRandom } from "../src/lib/chestRandom";
import { buildRewardReel } from "../src/lib/rewardReel";
const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };
test("all probabilities total 100 and every configured rarity has cosmetics", () => {
  assert.equal(CHEST_RARITIES.reduce((a, b) => a + b.probability, 0), 100);
  assert.equal(ORBIT_RARITIES.reduce((a, b) => a + b.probability, 0), 100);
  for (const rarity of CHEST_RARITIES) assert.ok(cosmeticsByRarity(rarity.rarity).length);
});
test("weighted chest outcomes obey all rarity intervals", () => {
  const cases = [[0, "COMMON"], [.54999, "COMMON"], [.55001, "UNCOMMON"], [.79999, "UNCOMMON"],
    [.80001, "RARE"], [.91999, "RARE"], [.92001, "EPIC"], [.97999, "EPIC"],
    [.98001, "LEGENDARY"], [.99799, "LEGENDARY"], [.99801, "MYTHIC"], [.999999, "MYTHIC"]] as const;
  for (const [value, rarity] of cases) assert.equal(pickWeightedRarity(() => value), rarity);
});
test("secure RNG stays in [0, 1)", () => {
  for (let i = 0; i < 500; i++) { const value = secureRandom(); assert.ok(value >= 0 && value < 1); }
});
test("insufficient points do not draw, charge, or mutate state", () => {
  for (const game of ["chest", "orbit"] as const) {
    const state = { ...createDemoState(), exPoints: 99 };
    const before = structuredClone(state);
    const result = createOpening(state, game, () => { throw new Error("Should not draw"); });
    assert.deepEqual(result, { success: false, reason: "INSUFFICIENT_EX" });
    assert.deepEqual(state, before);
  }
});
test("new chest reward costs 100 and commits exactly one owned item and history record", () => {
  const state = createDemoState(); const result = createOpening(state, "chest", () => 0);
  assert.ok(result.success);
  assert.equal(result.next.exPoints, STARTING_EX_POINTS - 100);
  assert.equal(result.next.ownedItemIds.length, 1);
  assert.equal(result.next.history.length, 1);
  assert.equal(result.next.history[0].game, "chest");
  assert.equal(result.next.history[0].itemId, result.reward.item.id);
  assert.equal(result.reward.isDuplicate, false);
  assert.deepEqual(state, createDemoState());
});
test("duplicate costs the full 100 EX and stores another consumable copy", () => {
  const first = createOpening(createDemoState(), "chest", () => 0); assert.ok(first.success);
  const second = createOpening(first.next, "chest", () => 0); assert.ok(second.success);
  assert.equal(DUPLICATE_COMPENSATION, 0);
  assert.equal(second.next.exPoints, STARTING_EX_POINTS - 200);
  assert.deepEqual(second.next.ownedItemIds, [first.reward.item.id, first.reward.item.id]);
  assert.equal(second.next.history.length, 2);
  assert.equal(second.reward.isDuplicate, true);
  assert.equal(second.reward.compensation, DUPLICATE_COMPENSATION);
  assert.notEqual(first.id, second.id);
});
test("exact-cost play never produces negative EX", () => {
  const result = createOpening({ ...createDemoState(), exPoints: 150 }, "orbit", () => 0);
  assert.ok(result.success); assert.equal(result.next.exPoints, 0);
});
test("all eight orbit draws land at the rendered pointer and award their rarity", () => {
  for (let index = 0; index < ORBIT_SECTORS.length; index++) {
    const result = createOpening(createDemoState(), "orbit", sequence((index + .5) / 8, .5));
    assert.ok(result.success);
    assert.equal(result.sectorIndex, index);
    assert.equal(result.reward.item.rarity, ORBIT_SECTORS[index]);
    assert.equal(result.next.exPoints, STARTING_EX_POINTS - 150);
    assert.equal(result.next.history[0].game, "orbit");
    assert.equal(((index + .5) * 45 + orbitLandingRotation(index)) % 360, 0);
  }
});
test("orbit distribution exactly matches published odds over evenly-spaced draws", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 800; i++) {
    const result = createOpening(createDemoState(), "orbit", sequence((i + .5) / 800, 0)); assert.ok(result.success);
    counts.set(result.reward.item.rarity, (counts.get(result.reward.item.rarity) ?? 0) + 1);
  }
  for (const rate of ORBIT_RARITIES) assert.equal(counts.get(rate.rarity), rate.probability * 8);
  assert.equal(counts.has("MYTHIC"), false);
});
test("all 584 club Mythics can be selected but their reel entries contain no identity", () => {
  const first = pickItemOfRarity("MYTHIC", () => 0);
  const last = pickItemOfRarity("MYTHIC", () => .999999);
  assert.notEqual(first.id, last.id);
  assert.equal(cosmeticsByRarity("MYTHIC").length, 584);
  for (const item of cosmeticsByRarity("MYTHIC")) {
    const reel = buildRewardReel(item, () => 0);
    assert.deepEqual(reel[REEL_WINNER_INDEX], { kind: "MYTHIC_VAULT", id: "mythic-vault" });
    assert.ok(!JSON.stringify(reel).includes(item.id));
    assert.ok(!JSON.stringify(reel).includes(item.name));
  }
});
test("decorative Mythic vaults can occur even when the actual reward is Common", () => {
  const winner = COSMETICS[0]; const reel = buildRewardReel(winner, sequence(.999, 0));
  assert.equal(reel[0].kind, "MYTHIC_VAULT");
  assert.deepEqual(reel[REEL_WINNER_INDEX], { kind: "COSMETIC", item: winner });
  assert.ok(reel.length > REEL_WINNER_INDEX + 2);
  assert.ok(reel.every((entry) => !("winner" in entry)));
});
test("saved balances, collection, and activity survive a round trip", () => {
  const result = createOpening(createDemoState(), "orbit", () => 0); assert.ok(result.success);
  assert.deepEqual(parseStoredState(JSON.stringify(result.next)), result.next);
});
test("legacy chest history without game remains supported", () => {
  const result = createOpening(createDemoState(), "chest", () => 0); assert.ok(result.success);
  delete result.next.history[0].game;
  assert.equal(parseStoredState(JSON.stringify(result.next)).history.length, 1);
});
test("malformed storage falls back safely and invalid history is filtered", () => {
  for (const raw of [null, "", "{", "null", "[]", '{"exPoints":-20}', '{"exPoints":1.5}'])
    assert.deepEqual(parseStoredState(raw), createDemoState());
  const state = { exPoints: 75, ownedItemIds: ["a", "a", 3], history: [{ timestamp: "bad" }, null] };
  assert.deepEqual(parseStoredState(JSON.stringify(state)), { ...createDemoState(), exPoints: 75, ownedItemIds: ["a"], history: [] });
});
