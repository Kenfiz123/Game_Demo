import { test } from "node:test";
import assert from "node:assert/strict";
import { CHEST_PITY_LIMIT, getChestPity, isValidChestPity } from "../src/lib/chestPity";
import { createOpening } from "../src/lib/gameEngine";
import { createDemoState, parseStoredState, saveXperienceState, STORAGE_KEY } from "../src/lib/storage";
import { parseLegacyImport } from "../src/lib/server/legacyImport";
import { StoreError } from "../src/lib/server/storeError";
import type { OpeningHistoryRecord, XperienceState } from "../src/types/gamification";

const commonOnly = { COMMON: 100, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 };
const mythicOnly = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 100 };
function record(rarity: OpeningHistoryRecord["rarity"] = "COMMON", game?: OpeningHistoryRecord["game"]): OpeningHistoryRecord {
  return { id: crypto.randomUUID(), itemId: "archived-history-item", itemName: "A recorded reward", rarity, ...(game ? { game } : {}),
    cost: 100, timestamp: "2026-10-11T00:00:00.000Z", isDuplicate: false, compensation: 0 };
}
function configuredState(chestPity = 0): XperienceState {
  const state = createDemoState(); state.chestPity = chestPity; state.settings.chestOdds = { ...commonOnly }; return state;
}

test("pity counter accepts only safe whole numbers from0 through199 and starts at0", () => {
  assert.equal(CHEST_PITY_LIMIT, 200); assert.equal(createDemoState().chestPity, 0);
  for (const value of [0, 1, 198, 199]) assert.equal(isValidChestPity(value), true);
  for (const value of [undefined, null, -1, 200, 999, .5, Number.NaN, Infinity, "199", true, {}]) assert.equal(isValidChestPity(value), false);
});

test("old newest-first history counts valid chest records only, including legacy undefined game, until the latest chestMythic", () => {
  const history = [record("RARE", "orbit"), record("COMMON", "chest"), record("MYTHIC", "orbit"),
    record("LEGENDARY"), { ...record(), timestamp: "bad-date" }, { game: "chest", rarity: "COMMON" },
    { ...record(), game: "unknown" }, null, record("MYTHIC", "chest"), record("COMMON", "chest")];
  assert.equal(getChestPity({ history }), 2);
  assert.equal(getChestPity({ chestPity: 0, history }), 0);
  assert.equal(getChestPity({ chestPity: 147, history }), 147);
  assert.equal(getChestPity({ chestPity: 200, history }), 2);
  assert.equal(getChestPity({ history: Array.from({ length: 500 }, () => record()) }), 199);
  assert.equal(getChestPity({ history: [record("MYTHIC"), record()] }), 0);
  assert.equal(getChestPity({ history: null }), 0);
});

test("200 actual consecutive chest openings guarantee exactly the200th reward even with zeroMythic odds", () => {
  let state = configuredState();
  for (let opening = 1; opening < CHEST_PITY_LIMIT; opening += 1) {
    const result = createOpening(state, "chest", () => 0); assert.ok(result.success);
    assert.equal(result.reward.item.rarity, "COMMON"); assert.equal(result.next.chestPity, opening);
    state = result.next;
  }
  const forced = createOpening(state, "chest", () => .999999); assert.ok(forced.success);
  assert.equal(forced.reward.item.rarity, "MYTHIC"); assert.equal(forced.next.chestPity, 0);
  assert.equal(forced.next.history.length, 200); assert.equal(forced.next.ownedItemIds.length, 200);
  assert.equal(forced.next.exPoints, createDemoState().exPoints - 200 * 100);
  const next = createOpening(forced.next, "chest", () => 0); assert.ok(next.success);
  assert.equal(next.reward.item.rarity, "COMMON"); assert.equal(next.next.chestPity, 1);
});

test("an early naturally rolled chestMythic resets pity and any LuckyOrbit result leaves it unchanged", () => {
  const state = configuredState(73); state.settings.chestOdds = { ...mythicOnly };
  const mythic = createOpening(state, "chest", () => 0); assert.ok(mythic.success);
  assert.equal(mythic.reward.item.rarity, "MYTHIC"); assert.equal(mythic.next.chestPity, 0);
  const ready = configuredState(199);
  for (const random of [0, .2, .5, .999999]) {
    const orbit = createOpening(ready, "orbit", () => random); assert.ok(orbit.success);
    assert.equal(orbit.next.chestPity, 199);
    const forced = createOpening(orbit.next, "chest", () => random); assert.ok(forced.success);
    assert.equal(forced.reward.item.rarity, "MYTHIC"); assert.equal(forced.next.chestPity, 0);
  }
});

test("insufficientEX or invalid chest settings never consume a pity guarantee, draw or mutate input", () => {
  const insufficient = { ...configuredState(199), exPoints: 99 };
  const badSettings = configuredState(199); badSettings.settings.chestOdds.COMMON = 99;
  for (const [state, reason] of [[insufficient, "INSUFFICIENT_EX"], [badSettings, "INVALID_SETTINGS"]] as const) {
    const before = structuredClone(state);
    assert.deepEqual(createOpening(state, "chest", () => { throw new Error("Must not draw"); }), { success: false, reason });
    assert.deepEqual(state, before);
  }
});

test("browser migration derives missing or malformed counters and preserves valid explicit counters through reload", () => {
  const state = configuredState(17); state.history = [record("COMMON"), record("EPIC", "chest"), record("MYTHIC", "chest")];
  const { chestPity: _counter, ...legacy } = state; assert.equal(_counter, 17);
  assert.equal(parseStoredState(JSON.stringify(legacy)).chestPity, 2);
  assert.equal(parseStoredState(JSON.stringify({ ...legacy, version: 1 })).chestPity, 2);
  for (const chestPity of [-1, 200, 1.5, null, "199"]) assert.equal(parseStoredState(JSON.stringify({ ...state, chestPity })).chestPity, 2);
  assert.deepEqual(parseStoredState(JSON.stringify(state)), state);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(saveXperienceState(state, storage), true);
  const saved = storage.getItem(STORAGE_KEY);
  assert.equal(saveXperienceState({ ...state, chestPity: 200 }, storage), false);
  assert.equal(saveXperienceState(legacy as XperienceState, storage), false);
  assert.equal(storage.getItem(STORAGE_KEY), saved);
});

test("explicit server imports derive only missing counters and reject every malformed explicit counter instead of repairing it", () => {
  const state = configuredState(199); state.history = [record(), record("MYTHIC")];
  const { chestPity: _counter, ...legacy } = state; assert.equal(_counter, 199);
  assert.equal(parseLegacyImport(JSON.stringify(legacy)).chestPity, 1);
  assert.equal(parseLegacyImport(JSON.stringify(state)).chestPity, 199);
  for (const chestPity of [-1, 200, 1.5, null, "199", true, {}]) {
    assert.throws(() => parseLegacyImport(JSON.stringify({ ...state, chestPity })),
      (error: unknown) => error instanceof StoreError && error.code === "INVALID_LEGACY");
  }
});
