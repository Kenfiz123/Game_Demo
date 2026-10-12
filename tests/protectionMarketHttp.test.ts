import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { CLUBS } from "../src/data/clubs";
import { createApiHandlers } from "../src/lib/server/http";
import { XperienceStore } from "../src/lib/server/store";
import { createDemoState } from "../src/lib/storage";
import { CommandValidationError, parseMarketQuery, validateCommand, validateMarketFilters } from "../src/lib/server/validation";
import type { BackendCommand } from "../src/types/backend";
import type { MarketFilters } from "../src/types/economy";
import { StoreError } from "../src/lib/server/storeError";

const origin = "http://localhost:3003";
const item = cosmeticsByRarity("COMMON")[0];
const post = (body: unknown, token: string, playerId: string) => new Request(`${origin}/api/commands`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: `qa=${token}`,
    "X-Xperience-Player": playerId, "Idempotency-Key": randomUUID() }, body: JSON.stringify(body),
});

test("protection commands reject missing/extra/client-state fields and normalize UUIDs without accepting truthy booleans", () => {
  const copyId = randomUUID();
  assert.deepEqual(validateCommand({ type: "copy-lock", copyId: copyId.toUpperCase(), locked: true }), { type: "copy-lock", copyId, locked: true });
  assert.deepEqual(validateCommand({ type: "wishlist-update", itemId: item.id, wished: false }), { type: "wishlist-update", itemId: item.id, wished: false });
  for (const value of [
    { type: "copy-lock", copyId }, { type: "copy-lock", copyId, locked: 1 }, { type: "copy-lock", copyId, locked: "false" },
    { type: "copy-lock", copyId: "bad", locked: false }, { type: "copy-lock", copyId, locked: false, ownerId: randomUUID() },
    { type: "wishlist-update", itemId: item.id }, { type: "wishlist-update", itemId: item.id, wished: "true" },
    { type: "wishlist-update", itemId: "unknown-item", wished: true }, { type: "wishlist-update", itemId: item.id, wished: true, itemIds: [item.id] },
  ]) assert.throws(() => validateCommand(value), CommandValidationError);
});

test("market filter DTOs reject unbounded/unknown/injected filters and query parser rejects duplicate and ambiguous encoding", () => {
  assert.deepEqual(validateMarketFilters({ query: "  Hà Nội  ", rarity: "COMMON", clubId: CLUBS[0].id, itemId: item.id, minPrice: 0, maxPrice: 1_000_000, sort: "price-desc", wishlistOnly: false }),
    { query: "Hà Nội", rarity: "COMMON", clubId: CLUBS[0].id, itemId: item.id, minPrice: 0, maxPrice: 1_000_000, sort: "price-desc", wishlistOnly: false });
  for (const value of [
    null, [], { price: 3 }, { query: "x".repeat(81) }, { query: "line\ncontrol" }, { query: "zero\u200bwidth" }, { query: 3 },
    { rarity: "mythic" }, { clubId: "unknown-club" }, { itemId: "unknown-item" }, { minPrice: -1 }, { maxPrice: 1_000_001 },
    { minPrice: 1.5 }, { minPrice: NaN }, { minPrice: 7, maxPrice: 6 }, { minPrice: "3" }, { sort: "random" }, { wishlistOnly: 1 },
  ]) assert.throws(() => validateMarketFilters(value), CommandValidationError);
  const cursor = randomUUID();
  assert.deepEqual(parseMarketQuery(new URLSearchParams(`cursor=${cursor.toUpperCase()}&minPrice=0&maxPrice=10&sort=price-asc&wishlistOnly=true`)),
    { cursor, filters: { minPrice: 0, maxPrice: 10, sort: "price-asc", wishlistOnly: true } });
  for (const query of ["query=", "query=x&query=y", "minPrice=", "minPrice=1.0", "minPrice=1e2", "minPrice=%2B1", "minPrice=99999999999999999999", "wishlistOnly=1", "wishlistOnly=TRUE", "cursor=bad", `cursor=${cursor}&cursor=${cursor}`, "unknown=1", "rarity="]) {
    assert.throws(() => parseMarketQuery(new URLSearchParams(query)), CommandValidationError, query);
  }
});

test("HTTP protects copies atomically and validates all market filters before reaching storage", async t => {
  const store = new XperienceStore(":memory:"); t.after(() => store.close());
  const session = store.bootstrapSession(), other = store.bootstrapSession(); assert.ok(session.token && other.token);
  const token = session.token, playerId = session.snapshot.player.id;
  store.execute(token, randomUUID(), { type: "import-legacy", raw: JSON.stringify({ ...createDemoState(), chestPity: 87, ownedItemIds: [item.id] }) }, playerId);
  const copyId = store.getSnapshot(token)!.collector!.copies[0].id;
  const api = createApiHandlers({ getStore: () => store, getConfig: () => ({ databasePath: ":memory:", sessionCookie: "qa", sessionLifetimeMs: 86400000, demoToolsEnabled: true }) });
  const lock = await api.commands(post({ type: "copy-lock", copyId, locked: true }, token, playerId));
  assert.equal(lock.status, 200); const locked = await lock.json(); assert.equal(locked.snapshot.collector.copies[0].locked, true);
  const listing = await (await api.commands(post({ type: "market-list", itemId: item.id, price: 10 }, token, playerId))).json();
  assert.deepEqual(listing.result, { success: false, reason: "ITEM_LOCKED" }); assert.deepEqual(listing.snapshot, locked.snapshot);
  assert.equal((await api.commands(post({ type: "copy-lock", copyId, locked: false, itemIds: [] }, token, playerId))).status, 400);
  assert.equal((await api.commands(post({ type: "copy-lock", copyId, locked: false }, other.token, other.snapshot.player.id))).status, 200);
  assert.equal(store.getSnapshot(token)!.collector!.copies[0].locked, true);
  const foreign = post({ type: "copy-lock", copyId, locked: false }, token, playerId); foreign.headers.set("Origin", "https://attacker.invalid");
  assert.equal((await api.commands(foreign)).status, 403);
  for (const query of ["?minPrice=9&maxPrice=3", "?wishlistOnly=1", "?query=x&query=y", "?clubId=unknown", "?itemId=unknown", `?query=${"x".repeat(4096)}`]) {
    assert.equal((await api.market(new Request(`${origin}/api/market${query}`, { headers: { Cookie: `qa=${token}` } }))).status, 400, query.slice(0, 60));
  }
  assert.equal((await api.market(new Request(`${origin}/api/market`))).status, 401);
  const response = await api.market(new Request(`${origin}/api/market?rarity=COMMON&sort=price-asc&wishlistOnly=false`, { headers: { Cookie: `qa=${token}` } }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { listings: [], ownListings: [], nextCursor: null, history: [], priceSummary: null, wishlistMatches: 0 });
  assert.equal(store.getSnapshot(token)!.state.chestPity, 87);
});

test("direct store callers cannot bypass strict protection or market DTO validation", t => {
  const store = new XperienceStore(":memory:"); t.after(() => store.close()); const session = store.bootstrapSession(); assert.ok(session.token);
  for (const value of [{ type: "copy-lock", copyId: randomUUID(), locked: true, ownerId: "injected" }, { type: "wishlist-update", itemId: "unknown", wished: true }]) {
    assert.throws(() => store.execute(session.token!, randomUUID(), value as BackendCommand, session.snapshot.player.id), (error: unknown) => error instanceof StoreError && error.code === "INVALID_REQUEST");
  }
  assert.throws(() => store.getMarket(session.token!, undefined, { minPrice: "0" } as unknown as MarketFilters), (error: unknown) => error instanceof StoreError && error.code === "INVALID_REQUEST");
});
