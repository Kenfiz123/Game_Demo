import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { COSMETICS, cosmeticsByRarity, getCosmeticById } from "../src/data/cosmetics";
import { createDemoState } from "../src/lib/storage";
import { XperienceStore } from "../src/lib/server/store";
import { StoreError } from "../src/lib/server/storeError";
import type { BackendCommand, BackendCommandReply } from "../src/types/backend";

const NOW = Date.parse("2026-10-12T08:00:00Z");
const common = cosmeticsByRarity("COMMON")[0].id;
const rare = cosmeticsByRarity("RARE")[1].id;
const legendary = cosmeticsByRarity("LEGENDARY")[0].id;
const mythic = cosmeticsByRarity("MYTHIC")[0].id;
function harness(random = () => .99) {
  const directory = mkdtempSync(join(tmpdir(), "xperience-protection-test-"));
  const path = join(directory, "test.sqlite");
  const stores = new Set<XperienceStore>();
  let time = NOW;
  const open = () => { const store = new XperienceStore(path, { now: () => time, random }); stores.add(store); return store; };
  const close = (store: XperienceStore) => { store.close(); stores.delete(store); };
  const database = <T>(operation: (db: DatabaseSync) => T): T => {
    const db = new DatabaseSync(path); try { return operation(db); } finally { db.close(); }
  };
  return { path, open, close, database, tick: () => { time += 1000; }, cleanup: () => {
    for (const store of stores) store.close(); rmSync(directory, { recursive: true, force: true });
  } };
}
function guest(store: XperienceStore) {
  const session = store.bootstrapSession(); assert.ok(session.token);
  return { token: session.token, id: session.snapshot.player.id };
}
function command(store: XperienceStore, player: ReturnType<typeof guest>, value: BackendCommand, key = randomUUID()) {
  return store.execute(player.token, key, value, player.id);
}
function seed(store: XperienceStore, player: ReturnType<typeof guest>, ids: string[]) {
  return command(store, player, { type: "import-legacy", raw: JSON.stringify({ ...createDemoState(), chestPity: 73, ownedItemIds: ids }) }).snapshot;
}
function listedId(reply: BackendCommandReply): string {
  assert.ok(reply.result.success && "listingId" in reply.result && reply.result.listingId); return reply.result.listingId;
}
function invalid(operation: () => unknown) {
  assert.throws(operation, (error: unknown) => error instanceof StoreError && error.code === "INVALID_REQUEST");
}

test("schema3→4 preserves save/account/economy/operations/copies/discoveries/escrow byte-for-byte and defaults only new fields", async () => {
  const h = harness();
  try {
    let store = h.open(); const player = guest(store);
    seed(store, player, [common, common, mythic]);
    const listingId = listedId(command(store, player, { type: "market-list", itemId: common, price: 19 }));
    const account = await store.registerAccount(player.token, "migration_owner", "A collector password 2026!", "Migration Owner");
    player.token = account.token;
    const before = store.getSnapshot(player.token)!;
    const passport = h.database(db => db.prepare("SELECT id FROM item_copies WHERE listing_id = ?").get(listingId)!.id as string);
    const escrow = store.getItemPassport(player.token, passport)!;
    h.close(store);
    const saved = h.database(db => {
      db.exec(`DROP INDEX market_active_price_asc; DROP INDEX market_active_price_desc; DROP INDEX market_item_sales; DROP INDEX market_buyer_history; DROP INDEX market_seller_history;
        DROP TABLE player_seasons; DROP TABLE collector_wishlist; ALTER TABLE item_copies DROP COLUMN locked; PRAGMA user_version = 3;`);
      return Object.fromEntries(["players", "sessions", "operations", "accounts", "player_economies", "market_listings", "item_copies", "item_trail", "collector_discoveries", "collector_profiles"]
        .map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }))]));
    });
    store = h.open(); const after = store.getSnapshot(player.token)!;
    assert.deepEqual(after, before); assert.deepEqual(after.collector!.wishlistItemIds, []);
    assert.ok(after.collector!.copies.every(copy => copy.locked === false));
    assert.deepEqual(store.getItemPassport(player.token, passport), escrow);
    h.database(db => {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 5);
      for (const [table, rows] of Object.entries(saved)) {
        const migrated = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => {
          if (table === "item_copies") { const { locked, ...old } = row; assert.equal(locked, 0); return old; }
          return { ...row };
        });
        assert.deepEqual(migrated, rows, table);
      }
    });
    h.close(store); assert.deepEqual(h.open().getSnapshot(player.token), after);
  } finally { h.cleanup(); }
});

test("locked trade and forge reject before RNG, coin/item/history/pity changes and retries remain rejected after unlocking", () => {
  let rolls = 0; const h = harness(() => { rolls++; return .99; });
  try {
    const store = h.open(); const player = guest(store);
    seed(store, player, [...Array(5).fill(common), ...Array(5).fill(legendary)]);
    command(store, player, { type: "claim-event", eventId: "daily-visit" });
    const copies = store.getSnapshot(player.token)!.collector!.copies;
    for (const id of [common, legendary]) command(store, player, { type: "copy-lock", copyId: copies.find(copy => copy.itemId === id)!.id, locked: true });
    const before = store.getSnapshot(player.token)!;
    const key = randomUUID();
    const blocked = command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) }, key);
    assert.deepEqual(blocked.result, { success: false, reason: "ITEM_LOCKED" });
    assert.deepEqual(blocked.snapshot, before);
    const forge = command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 });
    assert.deepEqual(forge.result, { success: false, reason: "ITEM_LOCKED" }); assert.deepEqual(forge.snapshot, before); assert.equal(rolls, 0);
    command(store, player, { type: "copy-lock", copyId: copies.find(copy => copy.itemId === common)!.id, locked: false });
    assert.deepEqual(command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) }, key).result, blocked.result);
    assert.equal(rolls, 0);
    assert.equal(command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) }).result.success, true); assert.equal(rolls, 1);
    assert.equal(store.getSnapshot(player.token)!.state.chestPity, 73);
  } finally { h.cleanup(); }
});

test("automatic trade/forge consume later unlocked copies and preserve a locked oldest serial even on losing rolls", () => {
  const h = harness();
  try {
    const store = h.open(); const player = guest(store);
    const original = seed(store, player, [...Array(6).fill(common), ...Array(6).fill(legendary)]);
    command(store, player, { type: "claim-event", eventId: "daily-visit" });
    const protectedIds = [common, legendary].map(item => original.collector!.copies.find(copy => copy.itemId === item)!.id);
    for (const copyId of protectedIds) command(store, player, { type: "copy-lock", copyId, locked: true });
    const trade = command(store, player, { type: "trade-up", itemIds: Array(5).fill(common) });
    assert.equal(trade.result.success, true); assert.ok("won" in trade.result && !trade.result.won);
    const forge = command(store, player, { type: "forge-mythic", itemIds: Array(5).fill(legendary), coins: 10 });
    assert.equal(forge.result.success, true); assert.ok("won" in forge.result && !forge.result.won);
    assert.deepEqual(forge.snapshot.collector!.copies.map(copy => copy.id), protectedIds);
    assert.ok(forge.snapshot.collector!.copies.every(copy => copy.locked));
    assert.equal(forge.snapshot.economy!.coinBalance, 10); assert.equal(forge.snapshot.state.chestPity, 73);
    for (const copyId of protectedIds) assert.deepEqual(store.getItemPassport(player.token, copyId)!.trail.map(entry => entry.kind), ["MINT"]);
  } finally { h.cleanup(); }
});

test("lock ownership/escrow restrictions and interleaved connections preserve identity and idempotency", () => {
  const h = harness();
  try {
    const first = h.open(), second = h.open(), owner = guest(first), other = guest(first);
    const copies = seed(first, owner, [common, common]).collector!.copies;
    const copyId = copies[0].id, key = randomUUID();
    assert.deepEqual(command(second, other, { type: "copy-lock", copyId, locked: true }).result, { success: false, reason: "INVALID_SELECTION" });
    command(first, owner, { type: "copy-lock", copyId, locked: true }, key);
    assert.deepEqual(command(second, owner, { type: "market-list", itemId: common, copyId, price: 1 }).result, { success: false, reason: "ITEM_LOCKED" });
    const listingId = listedId(command(second, owner, { type: "market-list", itemId: common, price: 1 }));
    assert.equal(first.getItemPassport(owner.token, copies[1].id)!.trail.at(-1)!.kind, "LIST");
    assert.equal(command(first, owner, { type: "copy-lock", copyId: copies[1].id, locked: true }).result.success, false);
    assert.deepEqual(command(first, owner, { type: "market-list", itemId: common, price: 1 }).result, { success: false, reason: "ITEM_LOCKED" });
    command(second, owner, { type: "market-cancel", listingId });
    command(second, owner, { type: "copy-lock", copyId, locked: false });
    const retry = command(first, owner, { type: "copy-lock", copyId, locked: true }, key);
    assert.equal(retry.result.success, true); assert.equal(retry.snapshot.collector!.copies.find(copy => copy.id === copyId)!.locked, false);
    const soldCopy = listedId(command(second, owner, { type: "market-list", itemId: common, copyId, price: 1 }));
    command(first, other, { type: "claim-event", eventId: "daily-visit" });
    command(first, other, { type: "market-buy", listingId: soldCopy });
    assert.equal(first.getItemPassport(owner.token, copyId), null); assert.equal(first.getItemPassport(other.token, copyId)!.copy.serial, copies[0].serial);
    assert.equal(first.getItemPassport(other.token, copyId)!.copy.locked, false);
    h.close(first); h.close(second); assert.equal(h.open().getItemPassport(other.token, copyId)!.copy.transferCount, 1);
  } finally { h.cleanup(); }
});

test("lock and wishlist SQL failures rollback atomically without revisions or pity changes", () => {
  const h = harness();
  try {
    const store = h.open(), player = guest(store);
    const before = seed(store, player, [common]);
    h.database(db => db.exec("CREATE TRIGGER reject_operation BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'test rollback'); END;"));
    for (const value of [{ type: "copy-lock", copyId: before.collector!.copies[0].id, locked: true }, { type: "wishlist-update", itemId: common, wished: true }] as const) {
      assert.throws(() => command(store, player, value), (error: unknown) => error instanceof StoreError && error.code === "STORAGE_UNAVAILABLE");
      assert.deepEqual(store.getSnapshot(player.token), before);
    }
  } finally { h.cleanup(); }
});

test("wishlist is bounded to 200 distinct known items, persists, is idempotent and never leaks through public profiles", async () => {
  const h = harness();
  try {
    let store = h.open(); const player = guest(store), other = guest(store);
    for (const item of COSMETICS.slice(0, 200)) assert.equal(command(store, player, { type: "wishlist-update", itemId: item.id, wished: true }).result.success, true);
    assert.deepEqual(command(store, player, { type: "wishlist-update", itemId: COSMETICS[200].id, wished: true }).result, { success: false, reason: "WISHLIST_LIMIT" });
    const key = randomUUID(), selected = COSMETICS[0].id;
    command(store, player, { type: "wishlist-update", itemId: selected, wished: true }, key);
    command(store, player, { type: "wishlist-update", itemId: selected, wished: false });
    assert.equal(command(store, player, { type: "wishlist-update", itemId: selected, wished: true }, key).snapshot.collector!.wishlistItemIds!.length, 199);
    invalid(() => command(store, player, { type: "wishlist-update", itemId: "unknown-item", wished: true }));
    assert.deepEqual(store.getSnapshot(other.token)!.collector!.wishlistItemIds, []);
    assert.deepEqual(store.getSnapshot(player.token)!.collector!.discoveredItemIds, []);
    const account = await store.registerAccount(player.token, "wishlist_owner", "A collector password 2026!", "Wishlist Owner"); player.token = account.token;
    command(store, player, { type: "profile-update", displayName: "Wishlist Owner", bio: "Published bio", isPublic: true, featuredItemIds: [] });
    const profile = store.getPublicProfile("wishlist_owner")!;
    assert.deepEqual(Object.keys(profile).sort(), ["username", "displayName", "bio", "joinedAt", "featuredItemIds", "equipped", "discoveredItemIds"].sort());
    assert.ok(!JSON.stringify(profile).includes("wishlist" + "ItemIds"));
    const before = store.getSnapshot(player.token); h.close(store); store = h.open(); assert.deepEqual(store.getSnapshot(player.token), before);
  } finally { h.cleanup(); }
});

test("market filters search the entire active pool before pagination; price cursors remain stable across ties and sold anchors", () => {
  const h = harness();
  try {
    const store = h.open(), viewer = guest(store), sellers = Array.from({ length: 4 }, () => guest(store));
    const all: { id: string; price: number; createdAt: string }[] = [];
    const target = getCosmeticById(rare)!;
    for (let sellerIndex = 0; sellerIndex < sellers.length; sellerIndex++) {
      const seller = sellers[sellerIndex]; seed(store, seller, [...Array(17).fill(common), ...Array(3).fill(rare)]);
      // The first target listings become older than the 40-item unfiltered page.
      for (let index = 0; index < 20; index++) {
        const itemId = index < 3 ? rare : common, price = index % 4 + 1;
        const id = listedId(command(store, seller, { type: "market-list", itemId, price }));
        all.push({ id, price, createdAt: store.getMarket(seller.token)!.ownListings.find(row => row.id === id)!.createdAt });
      }
    }
    assert.equal(store.getMarket(viewer.token)!.listings.length, 40);
    const exact = store.getMarket(viewer.token, undefined, { itemId: rare, rarity: "RARE", clubId: target.clubId, minPrice: 1, maxPrice: 3 })!;
    assert.equal(exact.listings.length, 12); assert.ok(exact.listings.every(row => row.itemId === rare)); assert.equal(exact.nextCursor, null);
    assert.equal(store.getMarket(viewer.token, undefined, { query: target.name })!.listings.length, 12);
    assert.equal(store.getMarket(sellers[0].token, undefined, { query: "no such catalog item" })!.ownListings.length, 20);
    command(store, viewer, { type: "wishlist-update", itemId: rare, wished: true });
    assert.equal(store.getMarket(viewer.token, undefined, { wishlistOnly: true })!.listings.length, 12);
    assert.equal(store.getMarket(viewer.token, undefined, { query: "no such item" })!.wishlistMatches, 12);
    for (const sort of ["newest", "price-asc", "price-desc"] as const) {
      const compare = (a: typeof all[number], b: typeof all[number]) => (sort === "newest" ? 0 : sort === "price-asc" ? a.price - b.price : b.price - a.price) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
      const expected = [...all].sort(compare).map(row => row.id);
      const first = store.getMarket(viewer.token, undefined, { sort })!, second = store.getMarket(viewer.token, first.nextCursor!, { sort })!;
      assert.deepEqual([...first.listings, ...second.listings].map(row => row.id), expected); assert.equal(second.nextCursor, null);
      if (sort === "price-asc") {
        command(store, viewer, { type: "claim-event", eventId: "daily-visit" });
        command(store, viewer, { type: "market-buy", listingId: first.nextCursor! });
        assert.deepEqual(store.getMarket(viewer.token, first.nextCursor!, { sort })!.listings.map(row => row.id), second.listings.map(row => row.id));
        all.splice(all.findIndex(row => row.id === first.nextCursor), 1);
      }
    }
  } finally { h.cleanup(); }
});

test("market personal history and exact-item price summaries include only completed sales, with private narrow receipts", () => {
  const h = harness();
  try {
    const store = h.open(), seller = guest(store), buyer = guest(store), stranger = guest(store);
    seed(store, seller, [common, common, common, common]); command(store, buyer, { type: "claim-event", eventId: "daily-visit" });
    assert.equal(store.getMarket(buyer.token, undefined, { itemId: common })!.priceSummary, null);
    const cancelled = listedId(command(store, seller, { type: "market-list", itemId: common, price: 1000 })); command(store, seller, { type: "market-cancel", listingId: cancelled });
    const active = listedId(command(store, seller, { type: "market-list", itemId: common, price: 900 }));
    const ids: string[] = [];
    for (const price of [3, 7]) { h.tick(); const id = listedId(command(store, seller, { type: "market-list", itemId: common, price })); ids.push(id); command(store, buyer, { type: "market-buy", listingId: id }); }
    const buy = store.getMarket(buyer.token, undefined, { itemId: common })!, sell = store.getMarket(seller.token)!;
    assert.deepEqual(buy.priceSummary, { itemId: common, salesCount: 2, minPrice: 3, maxPrice: 7, averagePrice: 5, lastPrice: 7 });
    assert.deepEqual(buy.history!.map(row => [row.listingId, row.side]), [[ids[1], "buy"], [ids[0], "buy"]]);
    assert.ok(sell.history!.every(row => row.side === "sell")); assert.deepEqual(store.getMarket(stranger.token)!.history, []);
    for (const row of buy.history!) assert.deepEqual(Object.keys(row).sort(), ["listingId", "itemId", "price", "completedAt", "side"].sort());
    assert.ok(!JSON.stringify(buy.history).includes(seller.id)); assert.equal(buy.listings[0].id, active);
    assert.equal(store.getMarket(buyer.token)!.priceSummary, null);
  } finally { h.cleanup(); }
});

test("personal history returns only latest 50 completed transactions, while price summary counts all sales", () => {
  const h = harness();
  try {
    const store = h.open(), seller = guest(store), buyer = guest(store);
    seed(store, seller, Array(55).fill(common));
    h.database(db => db.prepare("UPDATE player_economies SET economy_json = json_set(economy_json, '$.coinBalance', 100) WHERE player_id = ?").run(buyer.id));
    const soldIds: string[] = [];
    for (let index = 0; index < 55; index++) {
      h.tick(); const id = listedId(command(store, seller, { type: "market-list", itemId: common, price: 1 }));
      assert.equal(command(store, buyer, { type: "market-buy", listingId: id }).result.success, true); soldIds.push(id);
    }
    const history = store.getMarket(buyer.token, undefined, { itemId: common })!;
    assert.equal(history.history!.length, 50); assert.deepEqual(history.history!.map(row => row.listingId), soldIds.slice(5).reverse());
    assert.equal(history.priceSummary!.salesCount, 55); assert.equal(history.priceSummary!.averagePrice, 1);
    assert.deepEqual(store.getMarket(seller.token)!.history!.map(row => row.listingId), soldIds.slice(5).reverse());
    assert.equal(store.getSnapshot(buyer.token)!.state.chestPity, 0); assert.equal(store.getSnapshot(seller.token)!.state.chestPity, 73);
  } finally { h.cleanup(); }
});
