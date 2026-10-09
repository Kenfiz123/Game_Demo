import { test } from "node:test";
import assert from "node:assert/strict";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { createDefaultSettings, DEFAULT_TRADE_UP_ODDS, TRADE_UP_PATHS, validateArcadeSettings, validateChestOdds } from "../src/data/economyConfig";
import { createOpening } from "../src/lib/gameEngine";
import { pickWeightedRarity } from "../src/lib/chestRandom";
import { buildRewardReel } from "../src/lib/rewardReel";
import { createTradeUp } from "../src/lib/tradeUpEngine";
import { createDemoState, loadXperienceState, parseStoredState, saveXperienceState, STORAGE_KEY, STORAGE_V1_BACKUP_KEY } from "../src/lib/storage";
import type { Rarity } from "../src/types/gamification";

const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };
const onlyRarity = (rarity: Rarity): Record<Rarity, number> => ({ COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0, [rarity]: 100 });
const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("trade-up defaults match the requested 80/60/30/5 chances and stop at Legendary", () => {
  assert.deepEqual(DEFAULT_TRADE_UP_ODDS, { COMMON: 80, UNCOMMON: 60, RARE: 30, EPIC: 5 });
  assert.deepEqual(TRADE_UP_PATHS.map(path => path.targetRarity), ["UNCOMMON", "RARE", "EPIC", "LEGENDARY"]);
  assert.equal(TRADE_UP_PATHS.length, 4);
});
test("chest settings require finite percentages totaling 100, while allowing disabled tiers", () => {
  assert.ok(validateChestOdds(createDefaultSettings().chestOdds));
  assert.ok(validateChestOdds(onlyRarity("COMMON")));
  assert.ok(validateChestOdds({ COMMON: 55.00000000001, UNCOMMON: 25, RARE: 12, EPIC: 6, LEGENDARY: 1.8, MYTHIC: .2 }));
  for (const value of [null, [], {}, { ...onlyRarity("COMMON"), COMMON: -1 }, { ...onlyRarity("COMMON"), COMMON: 101 },
    { ...onlyRarity("COMMON"), RARE: Infinity }, { ...onlyRarity("COMMON"), RARE: NaN }, { ...onlyRarity("COMMON"), COMMON: 99 }]) {
    assert.equal(validateChestOdds(value), false);
  }
  assert.equal(validateArcadeSettings({ ...createDefaultSettings(), tradeUpOdds: { COMMON: 80, UNCOMMON: 60, RARE: 30, EPIC: -1 } }), false);
});
test("all configured chest tiers can be forced through the real engine without leaking Mythic identity in the reel", () => {
  for (const rarity of ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"] as const) {
    const state = createDemoState();
    state.settings.chestOdds = onlyRarity(rarity);
    for (const value of [0, .5, .999999]) assert.equal(pickWeightedRarity(() => value, state.settings.chestOdds), rarity);
    const result = createOpening(state, "chest", () => .5);
    assert.ok(result.success);
    assert.equal(result.reward.item.rarity, rarity);
    const reel = buildRewardReel(result.reward.item, () => .5, state.settings.chestOdds);
    assert.ok(reel.every(entry => rarity === "MYTHIC" ? entry.kind === "MYTHIC_VAULT" : entry.kind === "COSMETIC" && entry.item.rarity === rarity));
  }
});
test("custom chest interval boundaries skip zero-probability Mythic", () => {
  const odds = { COMMON: 10, UNCOMMON: 20, RARE: 30, EPIC: 30, LEGENDARY: 10, MYTHIC: 0 };
  for (const [value, rarity] of [[0, "COMMON"], [.099999, "COMMON"], [.100001, "UNCOMMON"], [.300001, "RARE"], [.600001, "EPIC"], [.900001, "LEGENDARY"], [.999999, "LEGENDARY"]] as const)
    assert.equal(pickWeightedRarity(() => value, odds), rarity);
});
test("invalid chest settings do not charge or mutate, and Orbit ignores chest settings", () => {
  const state = createDemoState();
  state.settings.chestOdds.COMMON = 20;
  const before = structuredClone(state);
  assert.deepEqual(createOpening(state, "chest", () => { throw new Error("Must not draw"); }), { success: false, reason: "INVALID_SETTINGS" });
  assert.deepEqual(state, before);
  const orbit = createOpening(state, "orbit", () => .999999);
  assert.ok(orbit.success); assert.notEqual(orbit.reward.item.rarity, "MYTHIC");
});
test("successful contracts consume exactly five same-rarity copies and award one next-tier random item", () => {
  for (const path of TRADE_UP_PATHS) {
    const input = cosmeticsByRarity(path.inputRarity)[0];
    const outputPool = cosmeticsByRarity(path.targetRarity);
    const preserved = cosmeticsByRarity("MYTHIC")[0];
    const state = { ...createDemoState(), ownedItemIds: [preserved.id, ...Array(6).fill(input.id)] };
    const before = structuredClone(state);
    const result = createTradeUp(state, Array(5).fill(input.id), sequence(0, .999999));
    assert.ok(result.success); assert.ok(result.won); assert.ok(result.reward);
    assert.equal(result.reward.item.id, outputPool.at(-1)!.id);
    assert.equal(result.reward.item.rarity, path.targetRarity);
    assert.equal(result.reward.compensation, 0);
    assert.deepEqual(result.next.ownedItemIds, [preserved.id, input.id, result.reward.item.id]);
    assert.equal(result.next.exPoints, state.exPoints);
    assert.equal(result.next.history.length, 0);
    assert.equal(result.next.tradeHistory.length, 1);
    assert.equal(result.next.tradeHistory[0].chance, path.defaultChance);
    assert.deepEqual(state, before);
  }
});
test("failure consumes all five copies without award, EX refund, or another random draw", () => {
  const input = cosmeticsByRarity("COMMON")[0];
  const state = { ...createDemoState(), ownedItemIds: Array(5).fill(input.id) };
  let calls = 0;
  const result = createTradeUp(state, Array(5).fill(input.id), () => { calls++; return .8; });
  assert.ok(result.success); assert.equal(result.won, false); assert.equal(result.reward, null);
  assert.equal(calls, 1); assert.equal(result.next.ownedItemIds.length, 0);
  assert.equal(result.next.exPoints, state.exPoints);
  assert.equal(result.next.tradeHistory[0].won, false);
  assert.equal(result.next.tradeHistory[0].rewardItemId, undefined);
});
test("trade-up success boundaries obey all requested odds", () => {
  for (const path of TRADE_UP_PATHS) {
    const input = cosmeticsByRarity(path.inputRarity)[0];
    const state = { ...createDemoState(), ownedItemIds: Array(5).fill(input.id) };
    const win = createTradeUp(state, state.ownedItemIds, sequence(path.defaultChance / 100 - 1e-6, 0));
    const loss = createTradeUp(state, state.ownedItemIds, () => path.defaultChance / 100);
    assert.ok(win.success && win.won); assert.ok(loss.success && !loss.won);
  }
});
test("evenly spaced contract rolls produce the requested exact success percentages", () => {
  for (const path of TRADE_UP_PATHS) {
    const input = cosmeticsByRarity(path.inputRarity)[0];
    const state = { ...createDemoState(), ownedItemIds: Array(5).fill(input.id) };
    let wins = 0;
    for (let index = 0; index < 100; index++) {
      const result = createTradeUp(state, state.ownedItemIds, sequence((index + .5) / 100, 0));
      assert.ok(result.success);
      if (result.won) wins++;
    }
    assert.equal(wins, path.defaultChance);
  }
});
test("every possible output is uniformly addressable in its next-rarity pool", () => {
  for (const path of TRADE_UP_PATHS) {
    const input = cosmeticsByRarity(path.inputRarity)[0];
    const pool = cosmeticsByRarity(path.targetRarity);
    const state = { ...createDemoState(), ownedItemIds: Array(5).fill(input.id) };
    for (let index = 0; index < pool.length; index++) {
      const result = createTradeUp(state, state.ownedItemIds, sequence(0, (index + .5) / pool.length));
      assert.ok(result.success && result.reward); assert.equal(result.reward.item.id, pool[index].id);
    }
  }
});
test("duplicate contract output adds one copy rather than compensation", () => {
  const input = cosmeticsByRarity("COMMON")[0], output = cosmeticsByRarity("UNCOMMON")[0];
  const state = { ...createDemoState(), ownedItemIds: [...Array(5).fill(input.id), output.id, output.id] };
  const result = createTradeUp(state, Array(5).fill(input.id), () => 0);
  assert.ok(result.success && result.reward); assert.equal(result.reward.isDuplicate, true);
  assert.deepEqual(result.next.ownedItemIds, [output.id, output.id, output.id]);
});
test("contracts accept different clubs of one tier but reject mixed tiers and wrong item counts", () => {
  const inputs = cosmeticsByRarity("COMMON").slice(0, 5).map(item => item.id);
  const state = { ...createDemoState(), ownedItemIds: inputs };
  const valid = createTradeUp(state, inputs, () => 0); assert.ok(valid.success);
  const rare = cosmeticsByRarity("RARE")[0];
  for (const selection of [inputs.slice(0, 4), [...inputs, inputs[0]], [...inputs.slice(0, 4), rare.id], [...inputs.slice(0, 4), "student-badge"]]) {
    assert.deepEqual(createTradeUp(state, selection, () => { throw new Error("Must not draw"); }), { success: false, reason: "INVALID_SELECTION" });
  }
});
test("insufficient stacked copies cannot be reused or consumed", () => {
  const input = cosmeticsByRarity("COMMON")[0];
  const state = { ...createDemoState(), ownedItemIds: Array(4).fill(input.id) };
  const before = structuredClone(state);
  assert.deepEqual(createTradeUp(state, Array(5).fill(input.id), () => { throw new Error("Must not draw"); }), { success: false, reason: "INSUFFICIENT_ITEMS" });
  assert.deepEqual(state, before);
});
test("Legendary and Mythic can never be traded and no path can award Mythic", () => {
  for (const rarity of ["LEGENDARY", "MYTHIC"] as const) {
    const input = cosmeticsByRarity(rarity)[0];
    const state = { ...createDemoState(), ownedItemIds: Array(5).fill(input.id) };
    assert.deepEqual(createTradeUp(state, state.ownedItemIds, () => { throw new Error("Must not draw"); }), { success: false, reason: "UNSUPPORTED_RARITY" });
  }
  assert.ok(TRADE_UP_PATHS.every(path => (path.targetRarity as Rarity) !== "MYTHIC"));
});
test("custom zero and 100 percent trade settings work without altering chest odds", () => {
  const input = cosmeticsByRarity("COMMON")[0];
  const state = { ...createDemoState(), ownedItemIds: Array(5).fill(input.id) };
  state.settings.tradeUpOdds.COMMON = 0;
  const loss = createTradeUp(state, state.ownedItemIds, () => 0); assert.ok(loss.success && !loss.won);
  state.settings.tradeUpOdds.COMMON = 100;
  const win = createTradeUp(state, state.ownedItemIds, () => .999999); assert.ok(win.success && win.won);
  state.settings.tradeUpOdds.COMMON = NaN;
  assert.deepEqual(createTradeUp(state, state.ownedItemIds, () => { throw new Error("Must not draw"); }), { success: false, reason: "INVALID_SETTINGS" });
});
test("legacy ownership, balances, compensated history and obsolete IDs survive migration without fabricated copies", () => {
  const opening = createOpening(createDemoState(), "chest", () => 0); assert.ok(opening.success);
  const oldRecord = { ...opening.next.history[0], isDuplicate: true, compensation: 25 };
  const legacy = { version: 1, exPoints: 925, ownedItemIds: ["student-badge", opening.reward.item.id, opening.reward.item.id], history: [oldRecord, { ...oldRecord, id: "second-duplicate" }] };
  const migrated = parseStoredState(JSON.stringify(legacy));
  assert.equal(migrated.version, 2); assert.equal(migrated.exPoints, 925);
  assert.deepEqual(migrated.ownedItemIds, ["student-badge", opening.reward.item.id]);
  assert.deepEqual(migrated.history, legacy.history);
  assert.deepEqual(migrated.tradeHistory, []);
});
test("v2 duplicate stacks, settings, and successful or failed trade history survive reload", () => {
  const input = cosmeticsByRarity("COMMON")[0];
  const state = { ...createDemoState(), ownedItemIds: Array(10).fill(input.id) };
  state.settings.chestOdds = onlyRarity("EPIC");
  const won = createTradeUp(state, Array(5).fill(input.id), () => 0); assert.ok(won.success);
  const lost = createTradeUp(won.next, Array(5).fill(input.id), () => .999999); assert.ok(lost.success);
  assert.deepEqual(parseStoredState(JSON.stringify(lost.next)), lost.next);
  assert.deepEqual(parseStoredState(JSON.stringify(state)), state);
});
test("invalid v2 settings and malformed trade records are repaired without removing valid copies or EX", () => {
  const state = { ...createDemoState(), exPoints: 77, ownedItemIds: ["a", "a"], settings: { bad: true }, tradeHistory: [{ won: true }, null] };
  const parsed = parseStoredState(JSON.stringify(state));
  assert.equal(parsed.exPoints, 77); assert.deepEqual(parsed.ownedItemIds, ["a", "a"]);
  assert.deepEqual(parsed.settings, createDefaultSettings()); assert.deepEqual(parsed.tradeHistory, []);
});
test("saving a v1 state backs up exact raw JSON before writing v2 and never overwrites that backup", () => {
  const raw = '{"exPoints":900,"ownedItemIds":["student-badge"],"history":[]}';
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  const migrated = loadXperienceState(storage);
  assert.equal(saveXperienceState(migrated, storage), true);
  assert.equal(storage.getItem(STORAGE_V1_BACKUP_KEY), raw);
  const otherRaw = '{"version":1,"exPoints":901,"ownedItemIds":[],"history":[]}';
  storage.setItem(STORAGE_KEY, otherRaw);
  assert.equal(saveXperienceState(loadXperienceState(storage), storage), true);
  assert.equal(storage.getItem(STORAGE_V1_BACKUP_KEY), raw);
  assert.equal(loadXperienceState(storage).exPoints, 901);
});
test("a failed v1 backup blocks saving and leaves the original state untouched", () => {
  const raw = '{"exPoints":900,"ownedItemIds":[],"history":[]}';
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  const guarded = { getItem: storage.getItem, setItem: (key: string, value: string) => {
    if (key === STORAGE_V1_BACKUP_KEY) throw new Error("Quota exceeded");
    storage.setItem(key, value);
  } };
  assert.equal(saveXperienceState(createDemoState(), guarded), false);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
test("storage failures and future schemas cannot overwrite prior data", () => {
  assert.equal(saveXperienceState(createDemoState(), { getItem: () => { throw new Error("Blocked"); }, setItem: () => { throw new Error("Must not write"); } }), false);
  const raw = JSON.stringify({ ...createDemoState(), version: 3 });
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  assert.equal(saveXperienceState(createDemoState(), storage), false); assert.equal(storage.getItem(STORAGE_KEY), raw);
});
test("invalid state cannot overwrite a valid v2 inventory", () => {
  const raw = JSON.stringify(createDemoState());
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  assert.equal(saveXperienceState({ ...createDemoState(), exPoints: -1 }, storage), false);
  assert.equal(saveXperienceState({ ...createDemoState(), exPoints: Number.MAX_SAFE_INTEGER + 1 }, storage), false);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
test("fresh demo settings are independent objects so edits never change defaults or other sessions", () => {
  const first = createDemoState(), second = createDemoState();
  first.settings.tradeUpOdds.COMMON = 0;
  first.settings.chestOdds.COMMON = 0;
  assert.equal(second.settings.tradeUpOdds.COMMON, 80); assert.equal(second.settings.chestOdds.COMMON, 55);
});
