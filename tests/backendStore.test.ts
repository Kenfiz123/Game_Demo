import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { createDefaultSettings } from "../src/data/economyConfig";
import { GAME_CONFIG } from "../src/data/arcadeConfig";
import { TEST_EX_GRANT } from "../src/data/chestConfig";
import { createDemoState } from "../src/lib/storage";
import { XperienceStore } from "../src/lib/server/store";
import { StoreError } from "../src/lib/server/storeError";
import { parseLegacyImport } from "../src/lib/server/legacyImport";
import type { BackendCommand, BackendErrorCode } from "../src/types/backend";

function expectCode(operation: () => unknown, code: BackendErrorCode) {
  assert.throws(operation, (error: unknown) => error instanceof StoreError && error.code === code);
}
function harness() {
  const directory = mkdtempSync(join(tmpdir(), "xperience-store-test-"));
  const path = join(directory, "nested", "test.sqlite");
  const stores: XperienceStore[] = [];
  const open = (options?: ConstructorParameters<typeof XperienceStore>[1]) => {
    const store = new XperienceStore(path, options); stores.push(store); return store;
  };
  const close = (store: XperienceStore) => { store.close(); stores.splice(stores.indexOf(store), 1); };
  return { path, open, close, cleanup: () => {
    for (const store of stores) store.close();
    rmSync(directory, { recursive: true, force: true });
  } };
}
function guest(store: XperienceStore) {
  const session = store.bootstrapSession();
  assert.ok(session.token);
  return { token: session.token, id: session.snapshot.player.id, snapshot: session.snapshot };
}
function command(store: XperienceStore, player: ReturnType<typeof guest>, value: BackendCommand, key = randomUUID()) {
  return store.execute(player.token, key, value, player.id);
}

test("SQLite creates an anonymous player and persists EX, rewards, history, and settings across restart", () => {
  const h = harness();
  try {
    let store = h.open();
    const player = guest(store);
    const settings = createDefaultSettings();
    settings.chestOdds = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 100 };
    command(store, player, { type: "settings", settings });
    const opened = command(store, player, { type: "play", game: "chest" });
    assert.ok(opened.result.success && "reward" in opened.result && opened.result.reward);
    assert.equal(opened.snapshot.state.exPoints, player.snapshot.state.exPoints - GAME_CONFIG.chest.cost);
    assert.equal(opened.snapshot.state.history.length, 1);
    assert.equal(opened.snapshot.revision, 2);
    h.close(store); store = h.open();
    assert.deepEqual(store.getSnapshot(player.token), opened.snapshot);
    assert.deepEqual(store.bootstrapSession(player.token), { snapshot: opened.snapshot });
    assert.equal(store.health(), true);
    assert.equal(store.getSnapshot("not-a-token"), null);
  } finally { h.cleanup(); }
});

test("session tokens are hashed in SQLite and never included in player snapshots", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store);
    const db = new DatabaseSync(h.path);
    try {
      const rows = db.prepare("SELECT token_hash FROM sessions").all();
      assert.deepEqual(rows.map(row => row.token_hash), [createHash("sha256").update(player.token).digest("hex")]);
      assert.equal(JSON.stringify(player.snapshot).includes(player.token), false);
    } finally { db.close(); }
    h.close(store);
    assert.equal(readFileSync(h.path).includes(Buffer.from(player.token)), false);
  } finally { h.cleanup(); }
});

test("separate players cannot read or mutate one another by supplying a public player ID", () => {
  const h = harness();
  try {
    const store = h.open(); const first = guest(store); const second = guest(store);
    assert.notEqual(first.id, second.id);
    command(store, first, { type: "grant-test-ex" });
    assert.equal(store.getSnapshot(second.token)!.state.exPoints, second.snapshot.state.exPoints);
    expectCode(() => store.execute(first.token, randomUUID(), { type: "grant-test-ex" }, second.id), "SESSION_CHANGED");
    expectCode(() => store.execute("invalid", randomUUID(), { type: "play", game: "chest" }, first.id), "NO_SESSION");
  } finally { h.cleanup(); }
});

test("expired sessions are rejected, bootstrap creates a new guest, and session lifetime is bounded", () => {
  const h = harness();
  try {
    let now = Date.parse("2026-10-10T00:00:00.000Z");
    const store = h.open({ now: () => now, sessionLifetimeMs: 100 }); const player = guest(store);
    now += 99; assert.ok(store.getSnapshot(player.token));
    now += 1; assert.equal(store.getSnapshot(player.token), null);
    expectCode(() => command(store, player, { type: "play", game: "chest" }), "NO_SESSION");
    assert.notEqual(store.bootstrapSession(player.token).snapshot.player.id, player.id);
    expectCode(() => new XperienceStore(":memory:", { sessionLifetimeMs: 0 }), "INVALID_REQUEST");
  } finally { h.cleanup(); }
});

test("retries never spend EX twice, return the identical draw and the latest snapshot, and keys are player-scoped", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const key = randomUUID();
    const opened = command(store, player, { type: "play", game: "chest" }, key);
    const latest = command(store, player, { type: "grant-test-ex" });
    const retried = command(store, player, { type: "play", game: "chest" }, key);
    assert.deepEqual(retried.result, opened.result);
    assert.deepEqual(retried.snapshot, latest.snapshot);
    assert.deepEqual(store.execute(player.token, key.toUpperCase(), { type: "play", game: "chest" }, player.id.toUpperCase()), retried);
    assert.equal(retried.snapshot.state.history.length, 1);
    expectCode(() => command(store, player, { type: "play", game: "orbit" }, key), "IDEMPOTENCY_CONFLICT");
    const other = guest(store);
    assert.equal(command(store, other, { type: "grant-test-ex" }, key).snapshot.state.exPoints, other.snapshot.state.exPoints + TEST_EX_GRANT);
  } finally { h.cleanup(); }
});

test("multiple SQLite connections always mutate the latest state rather than overwrite another tab's rewards", () => {
  const h = harness();
  try {
    const first = h.open(); const player = guest(first); const second = h.open();
    for (let index = 0; index < 12; index += 1) command(index % 2 ? first : second, player, { type: "play", game: "chest" });
    const snapshot = first.getSnapshot(player.token)!;
    assert.deepEqual(snapshot, second.getSnapshot(player.token));
    assert.equal(snapshot.state.ownedItemIds.length, 12);
    assert.equal(snapshot.state.history.length, 12);
    assert.equal(snapshot.state.exPoints, player.snapshot.state.exPoints - 12 * GAME_CONFIG.chest.cost);
    assert.equal(snapshot.revision, 12);
  } finally { h.cleanup(); }
});

test("independent Node processes serialize same-file writes and share idempotency without lost rewards", async () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const sharedKey = randomUUID();
    // Credentials enter the child through stdin, never its command line or output.
    const workerSource = `
      const { XperienceStore } = require(${JSON.stringify(join(process.cwd(), "src/lib/server/store.ts"))});
      const { randomUUID } = require("node:crypto");
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => { input += chunk; });
      process.stdin.on("end", () => {
        let store;
        try {
          const { path, token, playerId, sharedKey } = JSON.parse(input);
          store = new XperienceStore(path);
          store.execute(token, sharedKey, { type: "play", game: "chest" }, playerId);
          for (let index = 0; index < 10; index += 1) {
            store.execute(token, randomUUID(), { type: "play", game: "chest" }, playerId);
          }
          store.execute(token, sharedKey, { type: "play", game: "chest" }, playerId);
          process.stdout.write("done");
        } catch { process.stderr.write("SQLite test worker failed"); process.exitCode = 1; }
        finally { if (store) store.close(); }
      });
    `;
    const runWorker = () => new Promise<{ code: number | null; output: string; errors: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--eval", workerSource], {
        cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      });
      let output = ""; let errors = "";
      child.stdout.on("data", chunk => { output += String(chunk); });
      child.stderr.on("data", chunk => { errors += String(chunk); });
      child.once("error", reject);
      child.once("close", code => resolve({ code, output, errors }));
      child.stdin.end(JSON.stringify({ path: h.path, token: player.token, playerId: player.id, sharedKey }));
    });
    // Always wait for both process handles to close before temporary DB cleanup on Windows.
    const outcomes = await Promise.allSettled([runWorker(), runWorker()]);
    for (const outcome of outcomes) {
      assert.equal(outcome.status, "fulfilled");
      if (outcome.status === "fulfilled") {
        assert.equal(outcome.value.code, 0, outcome.value.errors);
        assert.equal(outcome.value.output, "done");
        assert.equal(outcome.value.output.includes(player.token), false);
        assert.equal(outcome.value.errors.includes(player.token), false);
      }
    }
    const snapshot = store.getSnapshot(player.token)!;
    assert.equal(snapshot.revision, 21);
    assert.equal(snapshot.state.history.length, 21);
    assert.equal(snapshot.state.ownedItemIds.length, 21);
    assert.equal(snapshot.state.exPoints, player.snapshot.state.exPoints - 21 * GAME_CONFIG.chest.cost);
    const db = new DatabaseSync(h.path);
    try { assert.equal(db.prepare("SELECT COUNT(*) AS count FROM operations").get()!.count, 21); }
    finally { db.close(); }
  } finally { h.cleanup(); }
});

test("a database write failure after drawing rolls back EX, inventory, history, revision, and the operation key", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const key = randomUUID();
    const db = new DatabaseSync(h.path);
    try {
      db.exec(`CREATE TRIGGER fail_operation BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
      expectCode(() => command(store, player, { type: "play", game: "chest" }, key), "STORAGE_UNAVAILABLE");
      assert.deepEqual(store.getSnapshot(player.token), player.snapshot);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM operations").get()!.count, 0);
      db.exec("DROP TRIGGER fail_operation");
      const retried = command(store, player, { type: "play", game: "chest" }, key);
      assert.equal(retried.snapshot.state.history.length, 1);
      assert.equal(retried.snapshot.state.exPoints, player.snapshot.state.exPoints - GAME_CONFIG.chest.cost);
    } finally { db.close(); }
  } finally { h.cleanup(); }
});

test("failed attempts are idempotent even after the player adds more EX", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store);
    command(store, player, { type: "import-legacy", raw: JSON.stringify({ ...createDemoState(), exPoints: 0 }) });
    const key = randomUUID();
    const failed = command(store, player, { type: "play", game: "chest" }, key);
    assert.deepEqual(failed.result, { success: false, reason: "INSUFFICIENT_EX" });
    const funded = command(store, player, { type: "grant-test-ex" });
    assert.deepEqual(command(store, player, { type: "play", game: "chest" }, key), { ...funded, result: failed.result });
    assert.equal(funded.snapshot.state.history.length, 0);
  } finally { h.cleanup(); }
});

test("duplicate copies are kept, successful trade consumes five and awards a random item of the next tier", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const common = cosmeticsByRarity("COMMON")[0].id;
    const state = createDemoState(); state.ownedItemIds = Array(6).fill(common); state.settings.tradeUpOdds.COMMON = 100;
    command(store, player, { type: "import-legacy", raw: JSON.stringify(state) });
    const traded = command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) });
    assert.ok(traded.result.success && "won" in traded.result && traded.result.won && traded.result.reward);
    if (traded.result.success && "won" in traded.result) assert.equal(traded.result.reward!.item.rarity, "UNCOMMON");
    assert.equal(traded.snapshot.state.ownedItemIds.length, 2);
    assert.equal(traded.snapshot.state.ownedItemIds.filter(id => id === common).length, 1);
    assert.equal(traded.snapshot.state.tradeHistory.length, 1);
    assert.equal(traded.snapshot.state.exPoints, state.exPoints);
  } finally { h.cleanup(); }
});

test("failed trade consumes exactly five copies once; forged inventory selection never consumes anything", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const common = cosmeticsByRarity("COMMON")[0].id;
    const state = createDemoState(); state.ownedItemIds = Array(6).fill(common); state.settings.tradeUpOdds.COMMON = 0;
    command(store, player, { type: "import-legacy", raw: JSON.stringify(state) });
    const key = randomUUID(); const failedRoll = command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) }, key);
    assert.ok(failedRoll.result.success && "won" in failedRoll.result && !failedRoll.result.won);
    assert.deepEqual(command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) }, key), failedRoll);
    const invalid = command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) });
    assert.deepEqual(invalid.result, { success: false, reason: "INSUFFICIENT_ITEMS" });
    assert.equal(invalid.snapshot.state.ownedItemIds.length, 1);
    assert.equal(invalid.snapshot.state.tradeHistory.length, 1);
  } finally { h.cleanup(); }
});

test("loadout saves only owned equippable Mythics without consuming a copy and survives a new connection", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const avatar = cosmeticsByRarity("MYTHIC").find(item => item.type === "AVATAR")!;
    const state = createDemoState(); state.ownedItemIds = [avatar.id];
    assert.deepEqual(command(store, player, { type: "equip", itemId: avatar.id }).result, { success: false, reason: "INVALID_SELECTION" });
    command(store, player, { type: "import-legacy", raw: JSON.stringify(state) });
    const equipped = command(store, player, { type: "equip", itemId: avatar.id });
    assert.equal(equipped.snapshot.state.equipped.AVATAR, avatar.id);
    assert.deepEqual(equipped.snapshot.state.ownedItemIds, [avatar.id]);
    const otherConnection = h.open(); assert.deepEqual(otherConnection.getSnapshot(player.token), equipped.snapshot);
    assert.deepEqual(command(otherConnection, player, { type: "unequip", slot: "AVATAR" }).snapshot.state.equipped, {});
  } finally { h.cleanup(); }
});

test("local demo tools can be disabled, including settings, EX grants, resets, and legacy import", () => {
  const h = harness();
  try {
    const store = h.open({ demoToolsEnabled: false }); const player = guest(store);
    assert.equal(player.snapshot.demoToolsEnabled, false); assert.equal(player.snapshot.canImportLegacy, false);
    for (const value of [{ type: "grant-test-ex" }, { type: "reset-demo" },
      { type: "settings", settings: createDefaultSettings() },
      { type: "import-legacy", raw: JSON.stringify(createDemoState()) }] as BackendCommand[]) {
      expectCode(() => command(store, player, value), "DEMO_DISABLED");
    }
    assert.ok(command(store, player, { type: "play", game: "orbit" }).result.success);
  } finally { h.cleanup(); }
});

test("legacy import is explicit, once-only and pristine-only, with v2 duplicates and archived IDs retained", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const common = cosmeticsByRarity("COMMON")[0].id;
    const state = createDemoState(); state.exPoints = 12345; state.ownedItemIds = [common, common, "old-archived-item"];
    const key = randomUUID(); const value: BackendCommand = { type: "import-legacy", raw: JSON.stringify(state) };
    const imported = command(store, player, value, key);
    assert.deepEqual(imported.snapshot.state, state);
    assert.equal(imported.snapshot.canImportLegacy, false);
    assert.deepEqual(command(store, player, value, key), imported);
    expectCode(() => command(store, player, value), "IMPORT_NOT_ALLOWED");
    command(store, player, { type: "reset-demo" });
    expectCode(() => command(store, player, value), "IMPORT_NOT_ALLOWED");
    const alreadyPlayed = guest(store); command(store, alreadyPlayed, { type: "play", game: "chest" });
    expectCode(() => command(store, alreadyPlayed, value), "IMPORT_NOT_ALLOWED");
    const v1 = parseLegacyImport(JSON.stringify({ version: 1, exPoints: 30, ownedItemIds: [common, common, "archived"], history: [] }));
    assert.deepEqual(v1.ownedItemIds, [common, "archived"]);
  } finally { h.cleanup(); }
});

test("malformed imports fail closed with no partial state write or lost opportunity to import", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const state = createDemoState();
    for (const raw of ["null", "[]", "{", JSON.stringify({ ...state, version: 3 }), JSON.stringify({ ...state, exPoints: -1 }),
      JSON.stringify({ ...state, history: [{ id: "bad" }] }), JSON.stringify({ ...state, ownedItemIds: [20] }),
      JSON.stringify({ ...state, settings: {} }), JSON.stringify({ ...state, equipped: { INVALID: "x" } })]) {
      expectCode(() => command(store, player, { type: "import-legacy", raw }), "INVALID_LEGACY");
      assert.deepEqual(store.getSnapshot(player.token), player.snapshot);
    }
    assert.equal(command(store, player, { type: "import-legacy", raw: JSON.stringify(state) }).result.success, true);
    expectCode(() => parseLegacyImport("x".repeat(1024 * 1024 + 1)), "INVALID_LEGACY");
  } finally { h.cleanup(); }
});

test("server store rejects malformed identities, commands, and unsupported database versions", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store);
    expectCode(() => store.execute(player.token, "bad-key", { type: "play", game: "chest" }, player.id), "INVALID_REQUEST");
    expectCode(() => command(store, player, { type: "play", game: "invalid" } as unknown as BackendCommand), "INVALID_REQUEST");
    expectCode(() => command(store, player, { type: "unequip", slot: "INVALID" } as unknown as BackendCommand), "INVALID_REQUEST");
    assert.deepEqual(store.getSnapshot(player.token), player.snapshot);
    h.close(store);
    const database = new DatabaseSync(h.path); database.exec("PRAGMA user_version = 2"); database.close();
    expectCode(() => h.open(), "STORAGE_UNAVAILABLE");
  } finally { h.cleanup(); }
});

test("corrupted persisted state fails reads and all mutations closed without rewriting or discarding records", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const state = createDemoState();
    const avatar = cosmeticsByRarity("MYTHIC").find(item => item.type === "AVATAR")!;
    const common = cosmeticsByRarity("COMMON")[0];
    const invalidStates: unknown[] = [null, "state", [],
      { ...state, ownedItemIds: [12] }, { ...state, ownedItemIds: [""] },
      { ...state, history: [{ id: "truncated" }] },
      { ...state, tradeHistory: [{ id: "truncated" }] },
      { ...state, equipped: null }, { ...state, equipped: { INVALID: "x" } },
      { ...state, equipped: { AVATAR: avatar.id } }, { ...state, equipped: { AVATAR: "retired-unowned-mythic" } },
      { ...state, ownedItemIds: [avatar.id], equipped: { LOGO: avatar.id } },
      { ...state, ownedItemIds: [common.id], equipped: { AVATAR: common.id } },
      { ...state, extraUnknownField: "malformed schema" },
      { ...state, settings: { chestOdds: {} } },
    ];
    const db = new DatabaseSync(h.path);
    try {
      for (const invalid of invalidStates) {
        const raw = JSON.stringify(invalid);
        db.prepare("UPDATE players SET state_json = ? WHERE id = ?").run(raw, player.id);
        expectCode(() => store.getSnapshot(player.token), "STORAGE_UNAVAILABLE");
        expectCode(() => store.bootstrapSession(player.token), "STORAGE_UNAVAILABLE");
        for (const value of [{ type: "grant-test-ex" }, { type: "play", game: "chest" }, { type: "reset-demo" }] as BackendCommand[]) {
          expectCode(() => command(store, player, value), "STORAGE_UNAVAILABLE");
        }
        const saved = db.prepare("SELECT state_json, revision FROM players WHERE id = ?").get(player.id)!;
        assert.equal(saved.state_json, raw); assert.equal(saved.revision, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM operations").get()!.count, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM players").get()!.count, 1);
      }
      db.prepare("UPDATE players SET state_json = ? WHERE id = ?").run(JSON.stringify(state), player.id);
      assert.deepEqual(store.getSnapshot(player.token), player.snapshot);
    } finally { db.close(); }
  } finally { h.cleanup(); }
});

test("valid server saves beyond legacy byte/list caps retain archived IDs and full history on read and mutation", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const state = createDemoState();
    state.ownedItemIds = Array(20_001).fill("retired-archived-item");
    const record = {
      id: randomUUID(), itemId: "retired-archived-item", itemName: "Archived reward ".repeat(20),
      rarity: "COMMON" as const, cost: 100, timestamp: new Date().toISOString(), isDuplicate: false, compensation: 0,
    };
    state.history = Array.from({ length: 10_001 }, (_, index) => ({ ...record, id: `${record.id}-${index}` }));
    const raw = JSON.stringify(state); assert.ok(Buffer.byteLength(raw) > 1024 * 1024);
    const db = new DatabaseSync(h.path);
    try { db.prepare("UPDATE players SET state_json = ? WHERE id = ?").run(raw, player.id); }
    finally { db.close(); }
    const loaded = store.getSnapshot(player.token)!;
    assert.deepEqual(loaded.state, state);
    const updated = command(store, player, { type: "grant-test-ex" });
    assert.deepEqual(updated.snapshot.state.ownedItemIds, state.ownedItemIds);
    assert.deepEqual(updated.snapshot.state.history, state.history);
    assert.equal(updated.snapshot.state.exPoints, state.exPoints + TEST_EX_GRANT);
  } finally { h.cleanup(); }
});

test("catalog retirement preserves owned archived loadout references without enabling new unknown equips", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const state = createDemoState();
    state.ownedItemIds = ["retired-avatar-mythic", "retired-avatar-mythic"];
    state.equipped = { AVATAR: "retired-avatar-mythic" };
    const db = new DatabaseSync(h.path);
    try { db.prepare("UPDATE players SET state_json = ? WHERE id = ?").run(JSON.stringify(state), player.id); }
    finally { db.close(); }
    assert.deepEqual(store.getSnapshot(player.token)!.state, state);
    const granted = command(store, player, { type: "grant-test-ex" });
    assert.deepEqual(granted.snapshot.state.equipped, state.equipped);
    assert.deepEqual(granted.snapshot.state.ownedItemIds, state.ownedItemIds);
    const rejected = command(store, player, { type: "equip", itemId: "retired-avatar-mythic" });
    assert.deepEqual(rejected.result, { success: false, reason: "INVALID_SELECTION" });
    assert.deepEqual(rejected.snapshot, granted.snapshot);
    assert.deepEqual(command(store, player, { type: "unequip", slot: "AVATAR" }).snapshot.state.equipped, {});
  } finally { h.cleanup(); }
});
