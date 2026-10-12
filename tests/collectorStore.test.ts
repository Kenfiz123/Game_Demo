import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { XperienceStore } from "../src/lib/server/store";
import { StoreError } from "../src/lib/server/storeError";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { createDemoState } from "../src/lib/storage";
import { emptyEconomy } from "../src/data/eventEconomy";
import type { BackendCommand, BackendCommandReply } from "../src/types/backend";
import type { CollectorProfile } from "../src/types/collector";

const NOW = Date.parse("2026-10-11T00:00:00Z");
const PASSWORD = "A collector password 2026!";
const common = cosmeticsByRarity("COMMON")[0].id;
const legendary = cosmeticsByRarity("LEGENDARY")[0].id;
const mythic = cosmeticsByRarity("MYTHIC")[0].id;
function harness(random = () => 0) {
  const directory = mkdtempSync(join(tmpdir(), "xperience-collector-test-"));
  const path = join(directory, "collector.sqlite");
  let store: XperienceStore | undefined = new XperienceStore(path, { now: () => NOW, random });
  const database = <T>(operation: (db: DatabaseSync) => T): T => {
    const db = new DatabaseSync(path); try { return operation(db); } finally { db.close(); }
  };
  return {
    path, get store() { assert.ok(store); return store; }, database,
    close: () => { store?.close(); store = undefined; },
    open: () => { store = new XperienceStore(path, { now: () => NOW, random }); },
    restart: () => { store!.close(); store = new XperienceStore(path, { now: () => NOW, random }); },
    cleanup: () => { store?.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}
function guest(store: XperienceStore) {
  const session = store.bootstrapSession(); assert.ok(session.token);
  return { token: session.token, id: session.snapshot.player.id, snapshot: session.snapshot };
}
function command(store: XperienceStore, player: ReturnType<typeof guest>, value: BackendCommand, key = randomUUID()) {
  return store.execute(player.token, key, value, player.id);
}
function seed(store: XperienceStore, player: ReturnType<typeof guest>, ids: string[]) {
  const state = createDemoState(); state.ownedItemIds = ids;
  return command(store, player, { type: "import-legacy", raw: JSON.stringify(state) }).snapshot;
}
function listedId(reply: BackendCommandReply): string {
  assert.ok(reply.result.success && "listingId" in reply.result && reply.result.listingId); return reply.result.listingId;
}
function expectInvalid(operation: () => unknown) {
  assert.throws(operation, (error: unknown) => error instanceof StoreError && error.code === "INVALID_REQUEST");
}

test("schema2 migration preserves exact save/economy bytes, revisions, import status and session while identifying old duplicates and escrow", () => {
  const h = harness();
  try {
    const player = guest(h.store); const state = createDemoState();
    state.exPoints = 123456; state.ownedItemIds = [mythic, mythic, "retired-item"];
    const stateJson = JSON.stringify(state, null, 2);
    const economy = { ...emptyEconomy(NOW), coinBalance: 123, claimedEventIds: ["daily-visit"] };
    const economyJson = JSON.stringify(economy, null, 2); const listingId = randomUUID();
    h.close();
    h.database(db => {
      db.exec(`DROP INDEX market_active_price_asc; DROP INDEX market_active_price_desc; DROP INDEX market_item_sales; DROP INDEX market_buyer_history; DROP INDEX market_seller_history;
        DROP TABLE player_seasons; DROP TABLE collector_wishlist; DROP TABLE item_trail; DROP TABLE item_copies; DROP TABLE collector_discoveries;
        DROP TABLE collector_profiles; DROP TABLE account_attempts; DROP TABLE accounts; PRAGMA user_version = 2;`);
      db.prepare("UPDATE players SET state_json = ?, revision = 42, legacy_imported = 1 WHERE id = ?").run(stateJson, player.id);
      db.prepare("UPDATE player_economies SET economy_json = ? WHERE player_id = ?").run(economyJson, player.id);
      db.prepare("INSERT INTO market_listings (id, item_id, seller_id, price, created_at, status) VALUES (?, ?, ?, 20, ?, 'ACTIVE')")
        .run(listingId, common, player.id, "2026-09-01T00:00:00Z");
    });
    h.open();
    const snapshot = h.store.getSnapshot(player.token)!;
    assert.deepEqual(snapshot.state, state); assert.deepEqual(snapshot.economy, economy);
    assert.equal(snapshot.revision, 42); assert.equal(snapshot.canImportLegacy, false); assert.equal(snapshot.account, null);
    assert.equal(snapshot.collector!.copies.length, 3);
    assert.equal(new Set(snapshot.collector!.copies.map(copy => copy.id)).size, 3);
    assert.equal(new Set(snapshot.collector!.copies.map(copy => copy.serial)).size, 3);
    for (const copy of snapshot.collector!.copies) {
      assert.equal(copy.origin, "LEGACY"); assert.equal(copy.mintedAt, null); assert.equal(copy.originalOwnerName, null);
      assert.deepEqual(h.store.getItemPassport(player.token, copy.id)!.trail, []);
    }
    assert.deepEqual(snapshot.collector!.discoveredItemIds, [common, mythic].sort());
    h.database(db => {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 5);
      const row = db.prepare("SELECT * FROM players WHERE id = ?").get(player.id)!;
      assert.equal(row.state_json, stateJson); assert.equal(row.revision, 42); assert.equal(row.legacy_imported, 1);
      assert.equal(db.prepare("SELECT economy_json FROM player_economies WHERE player_id = ?").get(player.id)!.economy_json, economyJson);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_copies").get()!.count, 4);
    });
    const returned = command(h.store, player, { type: "market-cancel", listingId });
    assert.equal(returned.snapshot.collector!.copies.length, 4);
    const returnedCopy = returned.snapshot.collector!.copies.find(copy => copy.itemId === common)!;
    assert.equal(returnedCopy.origin, "LEGACY"); assert.equal(returnedCopy.mintedAt, null);
    assert.deepEqual(h.store.getItemPassport(player.token, returnedCopy.id)!.trail.map(entry => entry.kind), ["RETURN"]);
    h.restart(); assert.deepEqual(h.store.getSnapshot(player.token), returned.snapshot);
  } finally { h.cleanup(); }
});

test("chest and orbit mint unique persistent identities even for duplicate draws; retry never mints twice", () => {
  const h = harness();
  try {
    const player = guest(h.store); const key = randomUUID();
    const first = command(h.store, player, { type: "play", game: "chest" }, key);
    assert.deepEqual(command(h.store, player, { type: "play", game: "chest" }, key), first);
    const second = command(h.store, player, { type: "play", game: "chest" });
    const third = command(h.store, player, { type: "play", game: "orbit" });
    const copies = third.snapshot.collector!.copies;
    assert.equal(copies.length, 3); assert.equal(new Set(copies.map(copy => copy.serial)).size, 3);
    assert.equal(first.snapshot.collector!.copies[0].id, second.snapshot.collector!.copies[0].id);
    assert.deepEqual(copies.map(copy => copy.origin), ["CHEST", "CHEST", "ORBIT"]);
    for (const copy of copies) {
      assert.equal(copy.mintedAt, new Date(NOW).toISOString());
      assert.deepEqual(h.store.getItemPassport(player.token, copy.id)!.trail.map(entry => entry.kind), ["MINT"]);
    }
    assert.equal(third.snapshot.collector!.discoveredItemIds.length, new Set(third.snapshot.state.ownedItemIds).size);
    h.restart(); assert.deepEqual(h.store.getSnapshot(player.token), third.snapshot);
  } finally { h.cleanup(); }
});

test("item passports are owner-only including escrow; selected serial survives list/cancel/buy without duplicate minting", async () => {
  const h = harness();
  try {
    const seller = guest(h.store), buyer = guest(h.store);
    const account = await h.store.registerAccount(seller.token, "serial_owner", PASSWORD, "Người đầu tiên"); seller.token = account.token;
    const opened = command(h.store, seller, { type: "play", game: "chest" });
    command(h.store, seller, { type: "play", game: "chest" });
    const copy = opened.snapshot.collector!.copies[0];
    assert.equal(copy.originalOwnerName, "Người đầu tiên");
    assert.equal(h.store.getItemPassport(buyer.token, copy.id), null);
    const firstListing = listedId(command(h.store, seller, { type: "market-list", itemId: copy.itemId, price: 10, copyId: copy.id }));
    assert.ok(h.store.getItemPassport(seller.token, copy.id)); assert.equal(h.store.getItemPassport(buyer.token, copy.id), null);
    command(h.store, seller, { type: "market-cancel", listingId: firstListing });
    assert.equal(h.store.getItemPassport(seller.token, copy.id)!.copy.serial, copy.serial);
    const secondListing = listedId(command(h.store, seller, { type: "market-list", itemId: copy.itemId, price: 10, copyId: copy.id }));
    command(h.store, buyer, { type: "claim-event", eventId: "daily-visit" });
    const key = randomUUID(); const purchase = command(h.store, buyer, { type: "market-buy", listingId: secondListing }, key);
    assert.deepEqual(command(h.store, buyer, { type: "market-buy", listingId: secondListing }, key), purchase);
    assert.equal(purchase.snapshot.collector!.copies.length, 1);
    const transferred = purchase.snapshot.collector!.copies[0];
    assert.equal(transferred.id, copy.id); assert.equal(transferred.serial, copy.serial); assert.equal(transferred.origin, "CHEST");
    assert.equal(transferred.transferCount, 1); assert.equal(transferred.originalOwnerName, "Người đầu tiên");
    assert.equal(h.store.getItemPassport(seller.token, copy.id), null);
    const passport = h.store.getItemPassport(buyer.token, copy.id)!;
    assert.deepEqual(passport.trail.map(entry => entry.kind), ["MINT", "LIST", "RETURN", "LIST", "TRANSFER"]);
    assert.equal(JSON.stringify(passport).includes(seller.id), false); assert.equal(JSON.stringify(passport).includes(buyer.id), false);
    assert.ok(purchase.snapshot.collector!.discoveredItemIds.includes(copy.itemId));
    h.restart(); assert.deepEqual(h.store.getItemPassport(buyer.token, copy.id), passport);
  } finally { h.cleanup(); }
});

test("market selection cannot escrow another player's serial or mismatch its catalog ID", () => {
  const h = harness();
  try {
    const first = guest(h.store), second = guest(h.store);
    const one = seed(h.store, first, [common]), two = seed(h.store, second, [common]);
    const own = one.collector!.copies[0], other = two.collector!.copies[0];
    const invalid = command(h.store, first, { type: "market-list", itemId: common, price: 1, copyId: other.id });
    assert.equal(invalid.result.success, false); assert.deepEqual(invalid.snapshot.collector!.copies, one.collector!.copies);
    const mismatch = command(h.store, first, { type: "market-list", itemId: mythic, price: 1, copyId: own.id });
    assert.equal(mismatch.result.success, false); assert.equal(h.store.getMarket(first.token)!.ownListings.length, 0);
  } finally { h.cleanup(); }
});

test("failed forge consumes precisely five identities once, keeps a sixth copy and lifetime discovery", () => {
  const h = harness(() => 0.999);
  try {
    const player = guest(h.store); const imported = seed(h.store, player, Array(6).fill(legendary));
    const originals = imported.collector!.copies;
    command(h.store, player, { type: "claim-event", eventId: "daily-visit" });
    const key = randomUUID(); const forged = command(h.store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 }, key);
    assert.ok(forged.result.success && "won" in forged.result && !forged.result.won);
    assert.deepEqual(command(h.store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 }, key), forged);
    assert.deepEqual(forged.snapshot.collector!.copies.map(copy => copy.id), [originals[5].id]);
    assert.ok(forged.snapshot.collector!.discoveredItemIds.includes(legendary));
    for (const copy of originals.slice(0, 5)) assert.equal(h.store.getItemPassport(player.token, copy.id), null);
    h.database(db => {
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_copies WHERE status = 'CONSUMED'").get()!.count, 5);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_trail WHERE kind = 'CONSUME'").get()!.count, 5);
    });
    h.restart(); assert.deepEqual(h.store.getSnapshot(player.token), forged.snapshot);
  } finally { h.cleanup(); }
});

test("trade-up and forge success mint distinct source identities and discovery survives consuming or resetting inventory", () => {
  const h = harness();
  try {
    const trader = guest(h.store); seed(h.store, trader, Array(5).fill(common));
    const traded = command(h.store, trader, { type: "trade-up", itemIds: Array(5).fill(common) });
    assert.equal(traded.snapshot.collector!.copies.length, 1); assert.equal(traded.snapshot.collector!.copies[0].origin, "TRADE_UP");
    assert.equal(traded.snapshot.collector!.discoveredItemIds.length, 2);
    const smith = guest(h.store); seed(h.store, smith, Array(5).fill(legendary));
    command(h.store, smith, { type: "claim-event", eventId: "daily-visit" });
    const forged = command(h.store, smith, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 });
    assert.equal(forged.snapshot.collector!.copies.length, 1); assert.equal(forged.snapshot.collector!.copies[0].origin, "FORGE");
    const reset = command(h.store, smith, { type: "reset-demo" });
    assert.deepEqual(reset.snapshot.collector!.copies, []);
    assert.deepEqual(reset.snapshot.collector!.discoveredItemIds, forged.snapshot.collector!.discoveredItemIds);
  } finally { h.cleanup(); }
});

test("public profiles require explicit publication and reveal only curated owned Mythics, loadout and lifetime discoveries", async () => {
  const h = harness();
  try {
    const player = guest(h.store); seed(h.store, player, [mythic, common]);
    const account = await h.store.registerAccount(player.token, "public_collector", PASSWORD, "Private Collector"); player.token = account.token;
    assert.equal(h.store.getPublicProfile("public_collector"), null); assert.equal(h.store.getPublicProfile("unknown_profile"), null);
    const profile: CollectorProfile = { displayName: "My Mythic Hall", bio: "A carefully curated collection.", isPublic: true, featuredItemIds: [mythic] };
    const key = randomUUID(); const published = command(h.store, player, { type: "profile-update", ...profile }, key);
    assert.deepEqual(command(h.store, player, { type: "profile-update", ...profile }, key), published);
    assert.equal(published.snapshot.account!.displayName, profile.displayName);
    const publicProfile = h.store.getPublicProfile("PUBLIC_COLLECTOR")!;
    assert.deepEqual(Object.keys(publicProfile).sort(), ["username", "displayName", "bio", "joinedAt", "featuredItemIds", "equipped", "discoveredItemIds"].sort());
    assert.equal(publicProfile.displayName, profile.displayName); assert.deepEqual(publicProfile.featuredItemIds, [mythic]);
    assert.equal(JSON.stringify(publicProfile).includes(player.id), false); assert.equal(JSON.stringify(publicProfile).includes(player.token), false);
    assert.equal("economy" in publicProfile, false); assert.equal("state" in publicProfile, false);
    command(h.store, player, { type: "market-list", itemId: mythic, price: 10 });
    assert.deepEqual(h.store.getPublicProfile("public_collector")!.featuredItemIds, []);
    assert.ok(h.store.getPublicProfile("public_collector")!.discoveredItemIds.includes(mythic));
    command(h.store, player, { type: "profile-update", ...profile, isPublic: false, featuredItemIds: [] });
    assert.equal(h.store.getPublicProfile("public_collector"), null);
  } finally { h.cleanup(); }
});

test("profile edits reject unowned/non-Mythic features, duplicate slots, controls, oversized fields and anonymous publication", () => {
  const h = harness();
  try {
    const player = guest(h.store); seed(h.store, player, [common]);
    const profile: CollectorProfile = { displayName: "Valid Student", bio: "", isPublic: false, featuredItemIds: [] };
    for (const invalid of [
      { ...profile, featuredItemIds: [mythic] }, { ...profile, featuredItemIds: [common] },
      { ...profile, featuredItemIds: [mythic, mythic] }, { ...profile, featuredItemIds: ["a", "b", "c", "d"] },
      { ...profile, displayName: "x" }, { ...profile, displayName: "With\u0000Control" },
      { ...profile, bio: "a".repeat(181) }, { ...profile, bio: "bad\ncontrol" },
    ]) expectInvalid(() => command(h.store, player, { type: "profile-update", ...invalid }));
    assert.throws(() => command(h.store, player, { type: "profile-update", ...profile, isPublic: true }),
      (error: unknown) => error instanceof StoreError && error.code === "ACCOUNT_REQUIRED");
    assert.equal(command(h.store, player, { type: "profile-update", ...profile }).snapshot.collector!.profile.displayName, profile.displayName);
  } finally { h.cleanup(); }
});

test("failed transaction rolls back copy mint, trail, discovery and save atomically", () => {
  const h = harness();
  try {
    const player = guest(h.store); const before = h.store.getSnapshot(player.token);
    h.database(db => db.exec("CREATE TRIGGER fail_copy_operation BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'test failure'); END;"));
    assert.throws(() => command(h.store, player, { type: "play", game: "chest" }),
      (error: unknown) => error instanceof StoreError && error.code === "STORAGE_UNAVAILABLE");
    assert.deepEqual(h.store.getSnapshot(player.token), before);
    h.database(db => {
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_copies").get()!.count, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM item_trail").get()!.count, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM collector_discoveries").get()!.count, 0);
    });
  } finally { h.cleanup(); }
});
