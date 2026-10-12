import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { emptyEconomy, economyDay, forgeChance } from "../src/data/eventEconomy";
import { createDemoState } from "../src/lib/storage";
import { XperienceStore, type StoreOptions } from "../src/lib/server/store";
import { StoreError } from "../src/lib/server/storeError";
import { forgeMythic, isPersistedEconomy } from "../src/lib/server/economyEngine";
import type { BackendCommand, BackendErrorCode } from "../src/types/backend";
import type { PlayerEconomy } from "../src/types/economy";

const NOW = Date.parse("2026-10-11T08:00:00Z");
const legendary = cosmeticsByRarity("LEGENDARY")[0].id;
const common = cosmeticsByRarity("COMMON")[0].id;
function harness(options: StoreOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "xperience-economy-test-"));
  const path = join(directory, "test.sqlite");
  const stores: XperienceStore[] = [];
  const open = (overrides: StoreOptions = {}) => {
    const store = new XperienceStore(path, { now: () => NOW, ...options, ...overrides }); stores.push(store); return store;
  };
  const close = (store: XperienceStore) => { store.close(); stores.splice(stores.indexOf(store), 1); };
  const database = (operation: (db: DatabaseSync) => void) => {
    const db = new DatabaseSync(path); try { operation(db); } finally { db.close(); }
  };
  return { path, open, close, database, cleanup: () => {
    for (const store of stores) store.close();
    rmSync(directory, { recursive: true, force: true });
  } };
}
function guest(store: XperienceStore) {
  const session = store.bootstrapSession(); assert.ok(session.token);
  return { token: session.token, id: session.snapshot.player.id, snapshot: session.snapshot };
}
function command(store: XperienceStore, player: ReturnType<typeof guest>, value: BackendCommand, key = randomUUID()) {
  return store.execute(player.token, key, value, player.id);
}
function seedItems(store: XperienceStore, player: ReturnType<typeof guest>, ids: string[]) {
  return command(store, player, { type: "import-legacy", raw: JSON.stringify({ ...createDemoState(), ownedItemIds: ids }) });
}
function listedId(reply: ReturnType<typeof command>): string {
  assert.ok(reply.result.success && "listingId" in reply.result && reply.result.listingId);
  return reply.result.listingId;
}
function expectCode(operation: () => unknown, code: BackendErrorCode) {
  assert.throws(operation, (error: unknown) => error instanceof StoreError && error.code === code);
}

test("schema v1 migrates without changing inventory, loadout, history, EX, revision or sessions", () => {
  const h = harness();
  try {
    let store = h.open(); const player = guest(store);
    seedItems(store, player, [legendary, legendary]);
    const before = command(store, player, { type: "play", game: "chest" });
    h.close(store);
    h.database(db => db.exec(`DROP TABLE item_trail; DROP TABLE item_copies; DROP TABLE collector_discoveries;
      DROP TABLE collector_profiles; DROP TABLE account_attempts; DROP TABLE accounts;
      DROP TABLE market_listings; DROP TABLE player_economies; PRAGMA user_version = 1;`));
    store = h.open(); const after = store.getSnapshot(player.token)!;
    assert.deepEqual(after.state, before.snapshot.state); assert.equal(after.revision, before.snapshot.revision);
    assert.deepEqual(after.economy, emptyEconomy(NOW));
    h.database(db => {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 3);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM player_economies").get()!.count, 1);
    });
    h.close(store); store = h.open(); assert.deepEqual(store.getSnapshot(player.token), after);
  } finally { h.cleanup(); }
});

test("daily claim is atomic, once per Vietnam calendar day, with replay returning current balance only", () => {
  let now = Date.parse("2026-10-10T16:59:59Z");
  const h = harness({ now: () => now });
  try {
    const store = h.open(); const player = guest(store); const key = randomUUID();
    assert.equal(player.snapshot.revision, 0); assert.equal(player.snapshot.economy!.day, "2026-10-10");
    const claim = command(store, player, { type: "claim-event", eventId: "daily-visit" }, key);
    assert.equal(claim.snapshot.economy!.coinBalance, 20); assert.equal(claim.snapshot.revision, 1);
    assert.deepEqual(command(store, player, { type: "claim-event", eventId: "daily-visit" }, key), claim);
    assert.deepEqual(command(store, player, { type: "claim-event", eventId: "daily-visit" }).result, { success: false, reason: "ALREADY_CLAIMED" });
    now += 2000;
    const daily = store.getSnapshot(player.token)!;
    assert.equal(daily.economy!.day, "2026-10-11"); assert.deepEqual(daily.economy!.claimedEventIds, []);
    assert.equal(command(store, player, { type: "claim-event", eventId: "daily-visit" }, key).snapshot.economy!.coinBalance, 20);
    const next = command(store, player, { type: "claim-event", eventId: "daily-visit" });
    assert.equal(next.snapshot.economy!.coinBalance, 40); assert.equal(next.snapshot.revision, 2);
    h.close(store); assert.deepEqual(h.open().getSnapshot(player.token), next.snapshot);
  } finally { h.cleanup(); }
});

test("only successful chest opens and processed normal trades advance daily event counters", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store);
    seedItems(store, player, Array(5).fill(common));
    assert.deepEqual(command(store, player, { type: "claim-event", eventId: "open-three" }).result, { success: false, reason: "EVENT_NOT_READY" });
    command(store, player, { type: "play", game: "orbit" });
    assert.equal(store.getSnapshot(player.token)!.economy!.progress.chests, 0);
    for (let index = 0; index < 10; index++) command(store, player, { type: "play", game: "chest" });
    const three = command(store, player, { type: "claim-event", eventId: "open-three" });
    assert.equal(three.snapshot.economy!.coinBalance, 35);
    const ten = command(store, player, { type: "claim-event", eventId: "open-ten" });
    assert.equal(ten.snapshot.economy!.coinBalance, 115); assert.equal(ten.snapshot.economy!.progress.chests, 10);
    command(store, player, { type: "trade-up", itemIds: Array(5).fill(legendary) });
    assert.equal(store.getSnapshot(player.token)!.economy!.progress.trades, 0);
    const settings = createDemoState().settings; settings.tradeUpOdds.COMMON = 0;
    command(store, player, { type: "settings", settings });
    const roll = command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) });
    assert.ok(roll.result.success && "won" in roll.result && !roll.result.won);
    assert.equal(roll.snapshot.economy!.progress.trades, 1);
    assert.equal(command(store, player, { type: "claim-event", eventId: "trade-once" }).snapshot.economy!.coinBalance, 140);
  } finally { h.cleanup(); }
});

test("failed chest opens, imported history and injected client coin fields cannot farm event rewards", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store);
    command(store, player, { type: "import-legacy", raw: JSON.stringify({ ...createDemoState(), exPoints: 0,
      coinBalance: 999999, economy: { ...emptyEconomy(NOW), coinBalance: 999999, progress: { chests: 10, trades: 1 } } }) });
    command(store, player, { type: "play", game: "chest" });
    const snapshot = store.getSnapshot(player.token)!;
    assert.deepEqual(snapshot.economy, emptyEconomy(NOW));
    expectCode(() => command(store, player, { type: "claim-event", eventId: "daily-visit", coins: 999 } as unknown as BackendCommand), "INVALID_REQUEST");
    assert.equal(store.getSnapshot(player.token)!.economy!.coinBalance, 0);
  } finally { h.cleanup(); }
});

test("forge success spends exactly five Legendary copies and coins, keeps duplicates, and replays once", () => {
  const h = harness({ random: () => 0 });
  try {
    const store = h.open(); const player = guest(store);
    const mythic = cosmeticsByRarity("MYTHIC")[0].id;
    seedItems(store, player, [...Array(6).fill(legendary), mythic]);
    command(store, player, { type: "claim-event", eventId: "daily-visit" });
    const key = randomUUID(); const value: BackendCommand = { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 20 };
    const forged = command(store, player, value, key);
    assert.ok(forged.result.success && "won" in forged.result && forged.result.won && forged.result.reward);
    if ("reward" in forged.result && forged.result.reward) {
      assert.equal(forged.result.reward.item.rarity, "MYTHIC"); assert.equal(forged.result.reward.isDuplicate, true);
    }
    assert.equal(forged.snapshot.economy!.coinBalance, 0); assert.equal(forged.snapshot.economy!.forgeHistory[0].chance, 2);
    assert.equal(forged.snapshot.economy!.forgeHistory[0].ruleVersion, 2);
    assert.deepEqual(forged.snapshot.state.ownedItemIds, [legendary, mythic, mythic]);
    assert.deepEqual(command(store, player, value, key), forged);
    assert.equal(forged.snapshot.economy!.progress.trades, 0);
    h.close(store); assert.deepEqual(h.open().getSnapshot(player.token), forged.snapshot);
  } finally { h.cleanup(); }
});

test("failed forge still consumes its five inputs and chosen coins exactly once", () => {
  const h = harness({ random: () => 0.999 });
  try {
    const store = h.open(); const player = guest(store); seedItems(store, player, Array(6).fill(legendary));
    command(store, player, { type: "claim-event", eventId: "daily-visit" });
    const key = randomUUID(); const value: BackendCommand = { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 };
    const failed = command(store, player, value, key);
    assert.ok(failed.result.success && "won" in failed.result && !failed.result.won);
    assert.deepEqual(failed.snapshot.state.ownedItemIds, [legendary]); assert.equal(failed.snapshot.economy!.coinBalance, 10);
    assert.equal(failed.snapshot.economy!.forgeHistory.length, 1);
    assert.deepEqual(command(store, player, value, key), failed);
    const rejected = command(store, player, value);
    assert.deepEqual(rejected.result, { success: false, reason: "INSUFFICIENT_ITEMS" });
    assert.deepEqual(rejected.snapshot, failed.snapshot);
  } finally { h.cleanup(); }
});

test("forge rejects insufficient coins, wrong rarity, forged ownership and invalid coin steps without consumption", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const seeded = seedItems(store, player, Array(5).fill(legendary));
    assert.deepEqual(command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 }).result, { success: false, reason: "INSUFFICIENT_COINS" });
    assert.deepEqual(command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(common), coins: 10 }).result, { success: false, reason: "INVALID_SELECTION" });
    for (const coins of [-10, 0, 1, 9, 251, 260, 750, 751, 760, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectCode(() => command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins }), "INVALID_REQUEST");
    }
    assert.deepEqual(store.getSnapshot(player.token), seeded.snapshot);
  } finally { h.cleanup(); }
});

test("paid coins increase forge probability from 1% to 25% and never guarantee a Mythic", () => {
  const state = { ...createDemoState(), ownedItemIds: Array(5).fill(legendary) };
  const economy = { ...emptyEconomy(NOW), coinBalance: 800 };
  assert.equal(forgeChance(0), 0); assert.equal(forgeChance(10), 1); assert.equal(forgeChance(250), 25);
  for (const coins of [10, 250]) {
    const boundary = forgeChance(coins) / 100;
    const win = forgeMythic(state, economy, Array(5).fill(legendary), coins, NOW, () => boundary - 0.0001);
    const loss = forgeMythic(state, economy, Array(5).fill(legendary), coins, NOW, () => boundary);
    assert.equal(win.result.won, true); assert.equal(loss.result.won, false);
    assert.equal(win.economy.coinBalance, 800 - coins); assert.equal(loss.economy.coinBalance, 800 - coins);
    assert.equal(loss.state.ownedItemIds.length, 0);
    assert.equal(loss.economy.forgeHistory[0].ruleVersion, 2); assert.equal(isPersistedEconomy(loss.economy), true);
  }
});

test("invalid paid forge amounts cannot consume inventory, equipment, wallet or randomness", () => {
  const state = { ...createDemoState(), ownedItemIds: Array(5).fill(legendary) };
  const economy = { ...emptyEconomy(NOW), coinBalance: 800 };
  const beforeState = structuredClone(state), beforeEconomy = structuredClone(economy);
  for (const coins of [-10, 0, 1, 9, 11, 251, 260, 750, NaN, Infinity]) {
    const result = forgeMythic(state, economy, state.ownedItemIds, coins, NOW, () => { throw new Error("Invalid forge must not draw"); });
    assert.deepEqual(result.result, { success: false, reason: "INVALID_COINS" });
    assert.equal(result.state, state); assert.equal(result.economy, economy);
    assert.deepEqual(state, beforeState); assert.deepEqual(economy, beforeEconomy);
  }
});

test("legacy forge receipts keep their historical odds across reload and new paid-only forges", () => {
  const h = harness({ random: () => 0.999 });
  try {
    let store = h.open(); const player = guest(store); seedItems(store, player, Array(5).fill(legendary));
    const history = [
      { coins: 0, chance: 5, won: false },
      { coins: 10, chance: 6, won: false },
      { coins: 750, chance: 80, won: true, rewardItemId: cosmeticsByRarity("MYTHIC")[0].id },
    ].map(receipt => ({ ...receipt, id: randomUUID(), timestamp: new Date(NOW - 86400000).toISOString(), inputItemIds: Array(5).fill(legendary) }));
    const economy: PlayerEconomy = { ...emptyEconomy(NOW), coinBalance: 20, forgeHistory: history };
    assert.equal(isPersistedEconomy(economy), true);
    h.database(db => db.prepare("UPDATE player_economies SET economy_json = ? WHERE player_id = ?").run(JSON.stringify(economy), player.id));
    h.close(store); store = h.open();
    const before = store.getSnapshot(player.token)!;
    assert.deepEqual(before.economy, economy);
    expectCode(() => command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 0 }), "INVALID_REQUEST");
    assert.deepEqual(store.getSnapshot(player.token), before);
    const forged = command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 });
    assert.equal(forged.snapshot.economy!.forgeHistory[0].chance, 1);
    assert.equal(forged.snapshot.economy!.forgeHistory[0].ruleVersion, 2);
    assert.deepEqual(forged.snapshot.economy!.forgeHistory.slice(1), history);
    h.close(store); store = h.open();
    assert.deepEqual(store.getSnapshot(player.token), forged.snapshot);
  } finally { h.cleanup(); }
});

test("history validation distinguishes legacy and paid-only receipts and rejects unknown rule versions", () => {
  const base = emptyEconomy(NOW);
  const record = { id: randomUUID(), timestamp: new Date(NOW).toISOString(), inputItemIds: Array(5).fill(legendary), coins: 10, chance: 1, won: false, ruleVersion: 2 };
  for (const receipt of [record, { ...record, coins: 250, chance: 25 },
    { ...record, coins: 0, chance: 5, ruleVersion: undefined },
    { ...record, coins: 10, chance: 6, ruleVersion: undefined },
    { ...record, coins: 750, chance: 80, ruleVersion: undefined }]) {
    assert.equal(isPersistedEconomy({ ...base, forgeHistory: [receipt] }), true);
  }
  for (const receipt of [
    { ...record, coins: 0, chance: 0 }, { ...record, coins: 260, chance: 25 },
    { ...record, coins: 750, chance: 80 }, { ...record, chance: 6 },
    { ...record, ruleVersion: undefined }, { ...record, ruleVersion: 1 },
    { ...record, ruleVersion: 3 }, { ...record, ruleVersion: "2" }, { ...record, ruleVersion: null },
  ]) assert.equal(isPersistedEconomy({ ...base, forgeHistory: [receipt] }), false);
});

test("marketplace escrows one owned copy and cancellation returns exactly that copy, without auto-equipping", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const other = guest(store);
    const avatar = cosmeticsByRarity("MYTHIC").find(item => item.type === "AVATAR")!.id;
    seedItems(store, player, [avatar, avatar]); command(store, player, { type: "equip", itemId: avatar });
    const first = command(store, player, { type: "market-list", itemId: avatar, price: 10 });
    assert.deepEqual(first.snapshot.state.ownedItemIds, [avatar]); assert.equal(first.snapshot.state.equipped.AVATAR, avatar);
    const second = command(store, player, { type: "market-list", itemId: avatar, price: 15 });
    assert.deepEqual(second.snapshot.state.ownedItemIds, []); assert.deepEqual(second.snapshot.state.equipped, {});
    const listingId = listedId(second);
    assert.deepEqual(command(store, other, { type: "market-cancel", listingId }).result, { success: false, reason: "NOT_OWNER" });
    const cancelled = command(store, player, { type: "market-cancel", listingId });
    assert.deepEqual(cancelled.snapshot.state.ownedItemIds, [avatar]); assert.deepEqual(cancelled.snapshot.state.equipped, {});
    assert.deepEqual(command(store, player, { type: "market-cancel", listingId }).result, { success: false, reason: "LISTING_UNAVAILABLE" });
    assert.equal(store.getMarket(player.token)!.ownListings.length, 1);
  } finally { h.cleanup(); }
});

test("market purchase transfers one escrow copy and coins atomically, preserves duplicates, and updates both revisions", () => {
  const h = harness();
  try {
    const store = h.open(); const seller = guest(store); const buyer = guest(store); const rival = guest(store);
    seedItems(store, seller, [legendary]); seedItems(store, buyer, [legendary]);
    command(store, buyer, { type: "claim-event", eventId: "daily-visit" }); command(store, rival, { type: "claim-event", eventId: "daily-visit" });
    const listed = command(store, seller, { type: "market-list", itemId: legendary, price: 15 }); const listingId = listedId(listed);
    assert.deepEqual(command(store, seller, { type: "market-buy", listingId }).result, { success: false, reason: "SELF_PURCHASE" });
    const key = randomUUID(); const purchase = command(store, buyer, { type: "market-buy", listingId }, key);
    assert.ok(purchase.result.success && "reward" in purchase.result && purchase.result.reward?.isDuplicate);
    assert.deepEqual(purchase.snapshot.state.ownedItemIds, [legendary, legendary]); assert.equal(purchase.snapshot.economy!.coinBalance, 5);
    const sellerAfter = store.getSnapshot(seller.token)!;
    assert.deepEqual(sellerAfter.state.ownedItemIds, []); assert.equal(sellerAfter.economy!.coinBalance, 15);
    assert.equal(sellerAfter.revision, listed.snapshot.revision + 1);
    assert.deepEqual(command(store, buyer, { type: "market-buy", listingId }, key), purchase);
    assert.deepEqual(command(store, rival, { type: "market-buy", listingId }).result, { success: false, reason: "LISTING_UNAVAILABLE" });
    assert.equal(store.getSnapshot(rival.token)!.economy!.coinBalance, 20);
    assert.equal(store.getMarket(buyer.token)!.listings.length, 0);
    h.close(store); const restarted = h.open();
    assert.deepEqual(restarted.getSnapshot(buyer.token), purchase.snapshot); assert.deepEqual(restarted.getSnapshot(seller.token), sellerAfter);
  } finally { h.cleanup(); }
});

test("market rejects invalid prices, unowned items, insufficient balance, invalid identity and listing limit", () => {
  const h = harness();
  try {
    const store = h.open(); const seller = guest(store); const buyer = guest(store);
    seedItems(store, seller, Array(21).fill(common));
    for (const price of [0, -1, 0.5, 1_000_001, Number.MAX_SAFE_INTEGER, Number.NaN]) {
      expectCode(() => command(store, seller, { type: "market-list", itemId: common, price }), "INVALID_REQUEST");
    }
    assert.deepEqual(command(store, buyer, { type: "market-list", itemId: common, price: 1 }).result, { success: false, reason: "INSUFFICIENT_ITEMS" });
    assert.deepEqual(command(store, seller, { type: "market-list", itemId: "unknown-item", price: 1 }).result, { success: false, reason: "INVALID_SELECTION" });
    const listed = command(store, seller, { type: "market-list", itemId: common, price: 1 }); const listingId = listedId(listed);
    assert.deepEqual(command(store, buyer, { type: "market-buy", listingId }).result, { success: false, reason: "INSUFFICIENT_COINS" });
    expectCode(() => store.execute(buyer.token, randomUUID(), { type: "market-cancel", listingId }, seller.id), "SESSION_CHANGED");
    for (let index = 1; index < 20; index++) command(store, seller, { type: "market-list", itemId: common, price: index });
    assert.deepEqual(command(store, seller, { type: "market-list", itemId: common, price: 1 }).result, { success: false, reason: "LISTING_LIMIT" });
    assert.equal(store.getMarket(seller.token)!.ownListings.length, 20);
    assert.deepEqual(store.getSnapshot(seller.token)!.state.ownedItemIds, [common]);
    assert.equal(store.getMarket("invalid-token"), null);
  } finally { h.cleanup(); }
});

test("market pages use stable UUID cursors, bounded public and own listings, with no duplicate page entries", () => {
  const h = harness();
  try {
    const store = h.open(); const owners = Array.from({ length: 3 }, () => guest(store));
    for (const owner of owners) {
      seedItems(store, owner, Array(20).fill(common));
      for (let index = 0; index < 20; index++) command(store, owner, { type: "market-list", itemId: common, price: index + 1 });
    }
    const first = store.getMarket(owners[0].token)!; assert.equal(first.listings.length, 40); assert.ok(first.nextCursor);
    assert.equal(first.ownListings.length, 20);
    const second = store.getMarket(owners[0].token, first.nextCursor!)!;
    assert.equal(second.listings.length, 20); assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.listings, ...second.listings].map(listing => listing.id)).size, 60);
    expectCode(() => store.getMarket(owners[0].token, "invalid-cursor"), "INVALID_REQUEST");
    expectCode(() => store.getMarket(owners[0].token, randomUUID()), "INVALID_REQUEST");
  } finally { h.cleanup(); }
});

test("market transaction rollback restores both players, escrow status and idempotency after a write error", () => {
  const h = harness();
  try {
    const store = h.open(); const seller = guest(store); const buyer = guest(store);
    seedItems(store, seller, [legendary]); command(store, buyer, { type: "claim-event", eventId: "daily-visit" });
    const listingId = listedId(command(store, seller, { type: "market-list", itemId: legendary, price: 10 }));
    const beforeSeller = store.getSnapshot(seller.token); const beforeBuyer = store.getSnapshot(buyer.token); const key = randomUUID();
    h.database(db => db.exec("CREATE TRIGGER fail_market BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'test failure'); END;"));
    expectCode(() => command(store, buyer, { type: "market-buy", listingId }, key), "STORAGE_UNAVAILABLE");
    assert.deepEqual(store.getSnapshot(seller.token), beforeSeller); assert.deepEqual(store.getSnapshot(buyer.token), beforeBuyer);
    assert.equal(store.getMarket(buyer.token)!.listings[0].id, listingId);
    h.database(db => db.exec("DROP TRIGGER fail_market"));
    assert.equal(command(store, buyer, { type: "market-buy", listingId }, key).result.success, true);
    assert.equal(store.getSnapshot(seller.token)!.economy!.coinBalance, 10);
  } finally { h.cleanup(); }
});

test("two connections serialize competing purchases so one seller payment and one item transfer exist", () => {
  const h = harness();
  try {
    const first = h.open(); const second = h.open(); const seller = guest(first); const buyer = guest(first); const rival = guest(second);
    seedItems(first, seller, [legendary]); command(first, buyer, { type: "claim-event", eventId: "daily-visit" }); command(second, rival, { type: "claim-event", eventId: "daily-visit" });
    const listingId = listedId(command(first, seller, { type: "market-list", itemId: legendary, price: 20 }));
    assert.equal(command(first, buyer, { type: "market-buy", listingId }).result.success, true);
    assert.equal(command(second, rival, { type: "market-buy", listingId }).result.success, false);
    const snapshots = [seller, buyer, rival].map(player => second.getSnapshot(player.token)!);
    assert.equal(snapshots.reduce((sum, snapshot) => sum + snapshot.economy!.coinBalance, 0), 40);
    assert.equal(snapshots.reduce((sum, snapshot) => sum + snapshot.state.ownedItemIds.length, 0), 1);
    assert.equal(snapshots[0].economy!.coinBalance, 20);
  } finally { h.cleanup(); }
});

test("independent Node processes racing to buy one listing produce exactly one purchase and preserve all coins", async () => {
  const h = harness();
  try {
    const store = h.open(); const seller = guest(store); const buyer = guest(store); const rival = guest(store);
    seedItems(store, seller, [legendary]);
    command(store, buyer, { type: "claim-event", eventId: "daily-visit" }); command(store, rival, { type: "claim-event", eventId: "daily-visit" });
    const listingId = listedId(command(store, seller, { type: "market-list", itemId: legendary, price: 20 }));
    const workerSource = `
      const { XperienceStore } = require(${JSON.stringify(join(process.cwd(), "src/lib/server/store.ts"))});
      const { randomUUID } = require("node:crypto");
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => { input += chunk; });
      process.stdin.on("end", () => {
        let store;
        try {
          const { path, token, playerId, listingId, now } = JSON.parse(input);
          store = new XperienceStore(path, { now: () => now });
          const reply = store.execute(token, randomUUID(), { type: "market-buy", listingId }, playerId);
          process.stdout.write(JSON.stringify({ success: reply.result.success, reason: reply.result.reason }));
        } catch { process.stderr.write("Marketplace test worker failed"); process.exitCode = 1; }
        finally { if (store) store.close(); }
      });
    `;
    const runWorker = (player: ReturnType<typeof guest>) => new Promise<{ code: number | null; output: string; errors: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--eval", workerSource], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      let output = ""; let errors = "";
      child.stdout.on("data", chunk => { output += String(chunk); }); child.stderr.on("data", chunk => { errors += String(chunk); });
      child.once("error", reject); child.once("close", code => resolve({ code, output, errors }));
      // Session credentials travel only through stdin and are never printed.
      child.stdin.end(JSON.stringify({ path: h.path, token: player.token, playerId: player.id, listingId, now: NOW }));
    });
    const outcomes = await Promise.allSettled([runWorker(buyer), runWorker(rival)]);
    const results: { success: boolean; reason?: string }[] = [];
    for (const outcome of outcomes) {
      assert.equal(outcome.status, "fulfilled");
      if (outcome.status === "fulfilled") {
        assert.equal(outcome.value.code, 0, outcome.value.errors);
        assert.equal(outcome.value.output.includes(buyer.token) || outcome.value.output.includes(rival.token), false);
        results.push(JSON.parse(outcome.value.output));
      }
    }
    assert.equal(results.filter(result => result.success).length, 1);
    assert.equal(results.filter(result => result.reason === "LISTING_UNAVAILABLE").length, 1);
    const snapshots = [seller, buyer, rival].map(player => store.getSnapshot(player.token)!);
    assert.equal(snapshots.reduce((sum, snapshot) => sum + snapshot.economy!.coinBalance, 0), 40);
    assert.equal(snapshots.reduce((sum, snapshot) => sum + snapshot.state.ownedItemIds.length, 0), 1);
    assert.equal(snapshots[0].economy!.coinBalance, 20);
  } finally { h.cleanup(); }
});

test("demo reset cancels only the player's active escrow and resets their own wallet, not completed sales", () => {
  const h = harness();
  try {
    const store = h.open(); const seller = guest(store); const buyer = guest(store);
    seedItems(store, seller, [legendary, legendary]); seedItems(store, buyer, [common]);
    command(store, buyer, { type: "claim-event", eventId: "daily-visit" });
    const sold = listedId(command(store, seller, { type: "market-list", itemId: legendary, price: 10 }));
    command(store, buyer, { type: "market-buy", listingId: sold });
    const ownActive = listedId(command(store, seller, { type: "market-list", itemId: legendary, price: 10 }));
    const otherActive = listedId(command(store, buyer, { type: "market-list", itemId: common, price: 5 }));
    const beforeBuyer = store.getSnapshot(buyer.token)!;
    const reset = command(store, seller, { type: "reset-demo" });
    assert.deepEqual(reset.snapshot.economy, emptyEconomy(NOW)); assert.deepEqual(reset.snapshot.state, createDemoState());
    assert.deepEqual(store.getSnapshot(buyer.token), beforeBuyer);
    assert.deepEqual(store.getMarket(buyer.token)!.listings.map(listing => listing.id), [otherActive]);
    assert.deepEqual(command(store, seller, { type: "market-cancel", listingId: ownActive }).result, { success: false, reason: "LISTING_UNAVAILABLE" });
    h.database(db => assert.equal(db.prepare("SELECT status FROM market_listings WHERE id = ?").get(sold)!.status, "SOLD"));
  } finally { h.cleanup(); }
});

test("demo reset keeps today's claimed events so reset cannot mint the same daily coins twice", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store);
    command(store, player, { type: "claim-event", eventId: "daily-visit" });
    const reset = command(store, player, { type: "reset-demo" });
    assert.deepEqual(reset.snapshot.economy, { ...emptyEconomy(NOW), claimedEventIds: ["daily-visit"] });
    assert.deepEqual(command(store, player, { type: "claim-event", eventId: "daily-visit" }).result, { success: false, reason: "ALREADY_CLAIMED" });
    assert.equal(store.getSnapshot(player.token)!.economy!.coinBalance, 0);
  } finally { h.cleanup(); }
});

test("corrupt or missing economy data fails closed instead of resetting a wallet or allowing reset/market mutations", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store); const base = emptyEconomy(NOW);
    const invalid: unknown[] = [null, [], { ...base, coinBalance: -1 }, { ...base, coinBalance: 0.5 },
      { ...base, day: "2026-02-31" }, { ...base, progress: { chests: -1, trades: 0 } },
      { ...base, claimedEventIds: ["daily-visit", "daily-visit"] }, { ...base, claimedEventIds: ["injected-event"] },
      { ...base, forgeHistory: [{}] }, { ...base, extra: true }];
    for (const economy of invalid) {
      h.database(db => db.prepare("UPDATE player_economies SET economy_json = ? WHERE player_id = ?").run(JSON.stringify(economy), player.id));
      expectCode(() => store.getSnapshot(player.token), "STORAGE_UNAVAILABLE");
      expectCode(() => store.getMarket(player.token), "STORAGE_UNAVAILABLE");
      expectCode(() => command(store, player, { type: "reset-demo" }), "STORAGE_UNAVAILABLE");
      expectCode(() => command(store, player, { type: "claim-event", eventId: "daily-visit" }), "STORAGE_UNAVAILABLE");
    }
    h.database(db => db.prepare("DELETE FROM player_economies WHERE player_id = ?").run(player.id));
    expectCode(() => store.bootstrapSession(player.token), "STORAGE_UNAVAILABLE");
    assert.equal(isPersistedEconomy(base), true);
  } finally { h.cleanup(); }
});

test("safe integer balance overflow rejects seller payment and event claims without losing escrow or funds", () => {
  const h = harness();
  try {
    const store = h.open(); const seller = guest(store); const buyer = guest(store);
    seedItems(store, seller, [legendary]); command(store, buyer, { type: "claim-event", eventId: "daily-visit" });
    const listingId = listedId(command(store, seller, { type: "market-list", itemId: legendary, price: 10 }));
    const economy: PlayerEconomy = { ...emptyEconomy(NOW), coinBalance: Number.MAX_SAFE_INTEGER };
    h.database(db => db.prepare("UPDATE player_economies SET economy_json = ? WHERE player_id = ?").run(JSON.stringify(economy), seller.id));
    assert.deepEqual(command(store, buyer, { type: "market-buy", listingId }).result, { success: false, reason: "COIN_LIMIT" });
    assert.deepEqual(command(store, seller, { type: "claim-event", eventId: "daily-visit" }).result, { success: false, reason: "COIN_LIMIT" });
    assert.equal(store.getSnapshot(buyer.token)!.economy!.coinBalance, 20); assert.equal(store.getSnapshot(seller.token)!.economy!.coinBalance, Number.MAX_SAFE_INTEGER);
    assert.equal(store.getMarket(buyer.token)!.listings.length, 1);
  } finally { h.cleanup(); }
});

test("daily normalization preserves earned coins and forge history while resetting only task progress and claims", () => {
  let now = NOW; const h = harness({ now: () => now, random: () => 0.999 });
  try {
    const store = h.open(); const player = guest(store); seedItems(store, player, Array(5).fill(legendary));
    command(store, player, { type: "claim-event", eventId: "daily-visit" });
    command(store, player, { type: "play", game: "chest" });
    const forged = command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 });
    now += 24 * 60 * 60 * 1000;
    const normalized = store.getSnapshot(player.token)!.economy!;
    assert.equal(normalized.day, economyDay(now)); assert.equal(normalized.coinBalance, 10);
    assert.deepEqual(normalized.progress, { chests: 0, trades: 0 }); assert.deepEqual(normalized.claimedEventIds, []);
    assert.deepEqual(normalized.forgeHistory, forged.snapshot.economy!.forgeHistory);
    command(store, player, { type: "grant-test-ex" });
    h.database(db => assert.equal(JSON.parse(db.prepare("SELECT economy_json FROM player_economies WHERE player_id = ?").get(player.id)!.economy_json as string).day, economyDay(now)));
  } finally { h.cleanup(); }
});
