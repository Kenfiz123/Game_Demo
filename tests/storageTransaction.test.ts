import { test } from "node:test";
import assert from "node:assert/strict";
import { STORAGE_TRANSACTION_LOCK, withStorageTransaction } from "../src/lib/storageTransaction";
import type { StorageLockManager } from "../src/lib/storageTransaction";
import { createDemoState, loadXperienceState, saveXperienceState, STORAGE_KEY } from "../src/lib/storage";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { createTradeUp } from "../src/lib/tradeUpEngine";
import { createOpening } from "../src/lib/gameEngine";
import { grantDemoPoints } from "../src/lib/demoPoints";
import { TEST_EX_GRANT } from "../src/data/chestConfig";

function mockLockManager() {
  const tails = new Map<string, Promise<void>>();
  const calls: { name: string; mode: string }[] = [];
  const manager: StorageLockManager = {
    async request<T>(name: string, options: { mode: "exclusive"; signal?: AbortSignal }, operation: () => T | Promise<T>): Promise<T> {
      calls.push({ name, mode: options.mode });
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>(resolve => { release = resolve; });
      tails.set(name, next);
      try {
        await previous;
        if (options.signal?.aborted) throw new Error("Aborted");
        return await operation();
      } finally {
        release();
      }
    },
  };
  return { manager, calls };
}
const memoryStorage = (raw: string) => {
  const values = new Map([[STORAGE_KEY, raw]]);
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("transactions use the same exclusive origin-scoped lock and preserve callback values", async () => {
  const { manager, calls } = mockLockManager();
  const result = await withStorageTransaction(() => 42, { lockManager: manager });
  assert.deepEqual(result, { success: true, value: 42 });
  assert.deepEqual(calls, [{ name: STORAGE_TRANSACTION_LOCK, mode: "exclusive" }]);
});
test("unsupported or denied Web Locks never invoke the mutation callback", async () => {
  let writes = 0;
  assert.deepEqual(await withStorageTransaction(() => { writes++; }, { lockManager: null }), { success: false });
  const denied: StorageLockManager = { request: async () => { throw new Error("Permission denied"); } };
  assert.deepEqual(await withStorageTransaction(() => { writes++; }, { lockManager: denied }), { success: false });
  assert.equal(writes, 0);
});
test("a thrown transaction releases its shared lock and does not deadlock the next mutation", async () => {
  const { manager } = mockLockManager();
  const failed = withStorageTransaction(() => { throw new Error("Save failed"); }, { lockManager: manager });
  const next = withStorageTransaction(() => "ready", { lockManager: manager });
  assert.deepEqual(await failed, { success: false });
  assert.deepEqual(await next, { success: true, value: "ready" });
});
test("aborted pending transactions never mutate and later requests still complete", async () => {
  const { manager } = mockLockManager();
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const first = withStorageTransaction(() => barrier, { lockManager: manager });
  const controller = new AbortController();
  let writes = 0;
  const cancelled = withStorageTransaction(() => { writes++; }, { lockManager: manager, signal: controller.signal });
  controller.abort();
  release();
  await first;
  assert.deepEqual(await cancelled, { success: false });
  assert.equal(writes, 0);
  assert.deepEqual(await withStorageTransaction(() => "done", { lockManager: manager }), { success: true, value: "done" });
});
test("already-aborted requests do not enter the lock manager", async () => {
  const { manager, calls } = mockLockManager();
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await withStorageTransaction(() => { throw new Error("Must not mutate"); }, { lockManager: manager, signal: controller.signal }), { success: false });
  assert.equal(calls.length, 0);
});
test("two tabs cannot consume the same five inventory copies twice", async () => {
  const { manager } = mockLockManager();
  const input = cosmeticsByRarity("COMMON")[0];
  const initial = { ...createDemoState(), ownedItemIds: Array(5).fill(input.id) };
  const storage = memoryStorage(JSON.stringify(initial));
  const submit = () => withStorageTransaction(async () => {
    const state = loadXperienceState(storage);
    // Model independent browser agents that could otherwise overlap between read and save.
    await Promise.resolve();
    const attempt = createTradeUp(state, Array(5).fill(input.id), () => 0);
    if (attempt.success) assert.equal(saveXperienceState(attempt.next, storage), true);
    return attempt;
  }, { lockManager: manager });
  const results = await Promise.all([submit(), submit()]);
  assert.ok(results[0].success && results[0].value.success);
  assert.ok(results[1].success && !results[1].value.success);
  if (results[1].success && !results[1].value.success) assert.equal(results[1].value.reason, "INSUFFICIENT_ITEMS");
  const saved = loadXperienceState(storage);
  assert.equal(saved.tradeHistory.length, 1); assert.equal(saved.ownedItemIds.length, 1);
});
test("concurrent chest opening and EX grants read the latest committed balance without lost updates", async () => {
  const { manager } = mockLockManager();
  const storage = memoryStorage(JSON.stringify(createDemoState()));
  const open = withStorageTransaction(async () => {
    const state = loadXperienceState(storage);
    await Promise.resolve();
    const result = createOpening(state, "chest", () => 0); assert.ok(result.success);
    assert.ok(saveXperienceState(result.next, storage));
  }, { lockManager: manager });
  const grant = withStorageTransaction(async () => {
    const state = loadXperienceState(storage);
    await Promise.resolve();
    assert.ok(saveXperienceState(grantDemoPoints(state), storage));
  }, { lockManager: manager });
  assert.ok((await open).success); assert.ok((await grant).success);
  const saved = loadXperienceState(storage);
  assert.equal(saved.exPoints, createDemoState().exPoints - 100 + TEST_EX_GRANT);
  assert.equal(saved.history.length, 1); assert.equal(saved.ownedItemIds.length, 1);
});
