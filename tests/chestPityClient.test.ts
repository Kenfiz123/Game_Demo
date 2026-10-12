import assert from "node:assert/strict";
import { test } from "node:test";
import { BackendRequestError, bootstrapBackend, sendBackendCommand } from "../src/lib/backendClient";
import { createDemoState } from "../src/lib/storage";
import type { BackendSnapshot } from "../src/types/backend";
import { hasLegacyProgress } from "../src/components/providers/XperienceProvider";

const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const snapshot = (): BackendSnapshot => ({
  player: { id: "test-player", createdAt: "2026-10-12T00:00:00.000Z" },
  state: createDemoState(), revision: 0, demoToolsEnabled: true, canImportLegacy: true,
});
const invalid = (error: unknown) => error instanceof BackendRequestError && error.status === 502;

test("client accepts confirmed pity counters including the guaranteed-next boundary", async t => {
  const stored = snapshot();
  t.mock.method(globalThis, "fetch", async () => response(stored));
  for (const count of [0, 1, 198, 199]) {
    stored.state.chestPity = count;
    assert.equal((await bootstrapBackend()).state.chestPity, count);
  }
});

test("client refuses malformed explicit pity rather than displaying fake progress", async t => {
  const stored = snapshot();
  t.mock.method(globalThis, "fetch", async () => response(stored));
  for (const count of [-1, 200, 201, .5, "199", null, {}, []]) {
    (stored.state as unknown as Record<string, unknown>).chestPity = count;
    await assert.rejects(bootstrapBackend(), invalid);
  }
});

test("pre-pity snapshots derive only chest history without losing existing state", async t => {
  const stored = snapshot();
  const oldState = stored.state as unknown as Record<string, unknown>;
  delete oldState.chestPity;
  stored.state.exPoints = 12_345;
  stored.state.ownedItemIds = ["archived", "archived"];
  const record = { id: "old", itemId: "archived", itemName: "Old reward", cost: 100, timestamp: "2026-10-11T00:00:00.000Z", isDuplicate: false, compensation: 0 };
  stored.state.history = [
    { ...record, game: "orbit", rarity: "MYTHIC" },
    { ...record, game: "chest", rarity: "COMMON" },
    { ...record, rarity: "RARE" },
    { ...record, game: "chest", rarity: "MYTHIC" },
    { ...record, game: "chest", rarity: "COMMON" },
  ];
  t.mock.method(globalThis, "fetch", async () => response(stored));
  const received = await bootstrapBackend();
  assert.equal(received.state.chestPity, 2);
  assert.equal(received.state.exPoints, 12_345);
  assert.deepEqual(received.state.ownedItemIds, stored.state.ownedItemIds);
  assert.deepEqual(received.state.history, stored.state.history);
  assert.equal("chestPity" in oldState, false);
});

test("mutations validate the returned pity before starting any reveal", async t => {
  const stored = snapshot();
  (stored.state as unknown as Record<string, unknown>).chestPity = 200;
  t.mock.method(globalThis, "fetch", async () => response({ snapshot: stored, result: { success: true } }));
  await assert.rejects(sendBackendCommand({ type: "grant-test-ex" }, stored.player.id), invalid);
});

test("legacy mutation replies return their normalized counter and pity-only saves remain importable", async t => {
  const stored = snapshot();
  delete (stored.state as unknown as Record<string, unknown>).chestPity;
  t.mock.method(globalThis, "fetch", async () => response({ snapshot: stored, result: { success: true } }));
  const reply = await sendBackendCommand({ type: "grant-test-ex" }, stored.player.id);
  assert.equal(reply.snapshot.state.chestPity, 0);
  assert.equal(hasLegacyProgress(JSON.stringify({ ...createDemoState(), chestPity: 23 })), true);
});
