import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { XperienceStore } from "../src/lib/server/store";
import { StoreError } from "../src/lib/server/storeError";
import { createDemoState } from "../src/lib/storage";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import type { BackendCommand } from "../src/types/backend";
import type { OpeningHistoryRecord } from "../src/types/gamification";

function harness() {
  const directory = mkdtempSync(join(tmpdir(), "xperience-pity-test-"));
  const path = join(directory, "pity.sqlite");
  let store = new XperienceStore(path, { random: () => 0 });
  const database = <T>(operation: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(path); try { return operation(db); } finally { db.close(); } };
  return { path, get store() { return store; }, database,
    restart: () => { store.close(); store = new XperienceStore(path, { random: () => 0 }); },
    cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function guest(store: XperienceStore) {
  const session = store.bootstrapSession(); assert.ok(session.token);
  return { token: session.token, id: session.snapshot.player.id, snapshot: session.snapshot };
}
function command(store: XperienceStore, player: ReturnType<typeof guest>, value: BackendCommand, key = randomUUID()) {
  return store.execute(player.token, key, value, player.id);
}
const commonOnly = { COMMON: 100, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 0 };
function history(rarity: OpeningHistoryRecord["rarity"], game?: OpeningHistoryRecord["game"]): OpeningHistoryRecord {
  return { id: randomUUID(), itemId: "archived-item", itemName: "Archived reward", rarity, game, cost: 100,
    timestamp: "2026-10-11T00:00:00.000Z", isDuplicate: false, compensation: 0 };
}

test("authoritative200 actual chests, reconnect and retries persist the guarantee exactly once with matching copy identity", () => {
  const h = harness();
  try {
    const player = guest(h.store); const settings = createDemoState().settings; settings.chestOdds = { ...commonOnly };
    command(h.store, player, { type: "settings", settings });
    for (let opening = 1; opening < 199; opening += 1) {
      const reply = command(h.store, player, { type: "play", game: "chest" });
      assert.ok(reply.result.success && "reward" in reply.result && reply.result.reward);
      assert.equal(reply.result.reward.item.rarity, "COMMON"); assert.equal(reply.snapshot.state.chestPity, opening);
    }
    const key199 = randomUUID(); const lastCommon = command(h.store, player, { type: "play", game: "chest" }, key199);
    assert.equal(lastCommon.snapshot.state.chestPity, 199);
    assert.deepEqual(command(h.store, player, { type: "play", game: "chest" }, key199), lastCommon);
    h.restart(); assert.deepEqual(h.store.getSnapshot(player.token), lastCommon.snapshot);
    const key200 = randomUUID(); const forced = command(h.store, player, { type: "play", game: "chest" }, key200);
    assert.ok(forced.result.success && "reward" in forced.result && forced.result.reward);
    assert.equal(forced.result.reward.item.rarity, "MYTHIC"); assert.equal(forced.snapshot.state.chestPity, 0);
    assert.equal(forced.snapshot.state.history.length, 200); assert.equal(forced.snapshot.collector!.copies.length, 200);
    assert.equal(forced.snapshot.collector!.copies.at(-1)!.origin, "CHEST");
    assert.deepEqual(command(h.store, player, { type: "play", game: "chest" }, key200), forced);
    h.restart(); assert.deepEqual(h.store.getSnapshot(player.token), forced.snapshot);
    assert.equal(command(h.store, player, { type: "play", game: "chest" }).snapshot.state.chestPity, 1);
  } finally { h.cleanup(); }
});

test("old native rows normalize history-derived pity on read without rewriting SQL bytes, revision or schema", () => {
  const h = harness();
  try {
    const player = guest(h.store), state = createDemoState();
    state.history = [history("MYTHIC", "orbit"), history("COMMON", "chest"), history("RARE"), history("MYTHIC", "chest")];
    const { chestPity: _pity, ...old } = state; assert.equal(_pity, 0);
    const raw = JSON.stringify(old, null, 2);
    h.database(db => db.prepare("UPDATE players SET state_json = ?, revision = 41 WHERE id = ?").run(raw, player.id));
    h.restart(); const loaded = h.store.getSnapshot(player.token)!;
    assert.equal(loaded.state.chestPity, 2); assert.equal(loaded.revision, 41);
    h.database(db => {
      assert.equal(db.prepare("SELECT state_json FROM players WHERE id = ?").get(player.id)!.state_json, raw);
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 3);
    });
    const updated = command(h.store, player, { type: "grant-test-ex" });
    assert.equal(updated.snapshot.state.chestPity, 2); assert.equal(updated.snapshot.revision, 42);
    h.database(db => assert.equal(JSON.parse(db.prepare("SELECT state_json FROM players WHERE id = ?").get(player.id)!.state_json as string).chestPity, 2));
  } finally { h.cleanup(); }
});

test("malformed explicit authoritative counters fail reads and commands closed without overwriting a save", () => {
  const h = harness();
  try {
    const player = guest(h.store); const state = createDemoState();
    for (const chestPity of [-1, 200, .5, null, "199", true, {}]) {
      const raw = JSON.stringify({ ...state, chestPity });
      h.database(db => db.prepare("UPDATE players SET state_json = ? WHERE id = ?").run(raw, player.id));
      for (const operation of [() => h.store.getSnapshot(player.token), () => command(h.store, player, { type: "grant-test-ex" })]) {
        assert.throws(operation, (error: unknown) => error instanceof StoreError && error.code === "STORAGE_UNAVAILABLE");
      }
      h.database(db => assert.equal(db.prepare("SELECT state_json FROM players WHERE id = ?").get(player.id)!.state_json, raw));
    }
  } finally { h.cleanup(); }
});

test("failed SQL commit rolls back a forced draw, its counter reset, minted copy and idempotency receipt together", () => {
  const h = harness();
  try {
    const player = guest(h.store); const state = createDemoState(); state.chestPity = 199; state.settings.chestOdds = { ...commonOnly };
    const before = command(h.store, player, { type: "import-legacy", raw: JSON.stringify(state) }).snapshot;
    const key = randomUUID();
    h.database(db => db.exec("CREATE TRIGGER fail_pity_operation BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'test failure'); END;"));
    assert.throws(() => command(h.store, player, { type: "play", game: "chest" }, key),
      (error: unknown) => error instanceof StoreError && error.code === "STORAGE_UNAVAILABLE");
    assert.deepEqual(h.store.getSnapshot(player.token), before);
    h.database(db => db.exec("DROP TRIGGER fail_pity_operation"));
    const forced = command(h.store, player, { type: "play", game: "chest" }, key);
    assert.equal(forced.snapshot.state.chestPity, 0); assert.equal(forced.snapshot.collector!.copies.length, 1);
    assert.equal(forced.snapshot.state.history[0].rarity, "MYTHIC");
    assert.deepEqual(command(h.store, player, { type: "play", game: "chest" }, key), forced);
  } finally { h.cleanup(); }
});

test("register and cross-browser login retain chest pity, while logout starts a new guest at0", async () => {
  const h = harness();
  try {
    const player = guest(h.store); const state = createDemoState(); state.chestPity = 137;
    command(h.store, player, { type: "import-legacy", raw: JSON.stringify(state) });
    const registered = await h.store.registerAccount(player.token, "pity_collector", "Long collector password2026!", "Pity Collector");
    assert.equal(registered.snapshot.state.chestPity, 137);
    const loggedOut = h.store.logoutAccount(registered.token); assert.equal(loggedOut.snapshot.state.chestPity, 0);
    const restored = await h.store.loginAccount(undefined, "pity_collector", "Long collector password2026!");
    assert.equal(restored.snapshot.state.chestPity, 137);
    h.restart(); assert.equal(h.store.getSnapshot(restored.token)!.state.chestPity, 137);
  } finally { h.cleanup(); }
});

test("events, Orbit and even a successful Mythic forge do not advance or reset chest pity; demo reset starts at0", () => {
  const h = harness();
  try {
    const player = guest(h.store); const state = createDemoState();
    state.chestPity = 123; state.ownedItemIds = Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id);
    command(h.store, player, { type: "import-legacy", raw: JSON.stringify(state) });
    assert.equal(command(h.store, player, { type: "claim-event", eventId: "daily-visit" }).snapshot.state.chestPity, 123);
    assert.equal(command(h.store, player, { type: "play", game: "orbit" }).snapshot.state.chestPity, 123);
    const forged = command(h.store, player, { type: "forge-mythic", itemIds: state.ownedItemIds, coins: 10 });
    assert.ok(forged.result.success && "won" in forged.result && forged.result.won);
    assert.equal(forged.snapshot.state.chestPity, 123);
    assert.equal(command(h.store, player, { type: "reset-demo" }).snapshot.state.chestPity, 0);
  } finally { h.cleanup(); }
});

test("two SQLite connections share the latest pity counter and cannot award the same guarantee twice", () => {
  const h = harness(); let other: XperienceStore | undefined;
  try {
    const player = guest(h.store); const state = createDemoState(); state.chestPity = 198; state.settings.chestOdds = { ...commonOnly };
    command(h.store, player, { type: "import-legacy", raw: JSON.stringify(state) });
    other = new XperienceStore(h.path, { random: () => 0 });
    const key = randomUUID(); const first = command(h.store, player, { type: "play", game: "chest" }, key);
    assert.equal(first.snapshot.state.chestPity, 199);
    const forced = command(other, player, { type: "play", game: "chest" });
    assert.equal(forced.snapshot.state.chestPity, 0); assert.equal(forced.snapshot.state.history[0].rarity, "MYTHIC");
    const next = command(h.store, player, { type: "play", game: "chest" });
    assert.equal(next.snapshot.state.chestPity, 1); assert.equal(next.snapshot.state.history[0].rarity, "COMMON");
    const retried = command(other, player, { type: "play", game: "chest" }, key);
    assert.deepEqual(retried.result, first.result); assert.deepEqual(retried.snapshot, next.snapshot);
    assert.equal(retried.snapshot.state.history.filter(record => record.rarity === "MYTHIC").length, 1);
    assert.equal(retried.snapshot.collector!.copies.length, 3);
  } finally { other?.close(); h.cleanup(); }
});
