import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { bootstrapBackend, BackendRequestError, readMarketplace, sendBackendCommand } from "../src/lib/backendClient";
import { createDemoState } from "../src/lib/storage";
import type { BackendCommand, BackendSnapshot } from "../src/types/backend";
import type { MarketFilters, MarketPage } from "../src/types/economy";

const timestamp = "2026-10-12T10:00:00.000Z";
const itemId = cosmeticsByRarity("COMMON")[0].id;
function snapshot(): BackendSnapshot {
  const state = createDemoState(); state.ownedItemIds = [itemId];
  const id = randomUUID();
  return {
    player: { id: randomUUID(), createdAt: timestamp }, state, revision: 1, demoToolsEnabled: true, canImportLegacy: false,
    collector: {
      profile: { displayName: "Student", bio: "", isPublic: false, featuredItemIds: [] }, discoveredItemIds: [itemId], wishlistItemIds: [itemId],
      copies: [{ id, itemId, serial: `XP-${id}`, origin: "CHEST", mintedAt: timestamp, recordedAt: timestamp, acquiredAt: timestamp, originalOwnerName: null, transferCount: 0, locked: true }],
    },
  };
}
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const invalid = (error: unknown) => error instanceof BackendRequestError && error.status === 502;

test("collector client preserves each copy's lock and server wishlist while accepting old snapshots", async t => {
  let stored = snapshot();
  t.mock.method(globalThis, "fetch", async () => response(stored));
  assert.deepEqual(await bootstrapBackend(), stored);
  stored.collector!.copies[0].locked = false;
  assert.deepEqual(await bootstrapBackend(), stored);
  stored = snapshot(); delete stored.collector!.copies[0].locked; delete stored.collector!.wishlistItemIds;
  assert.deepEqual(await bootstrapBackend(), stored);
});

test("collector client fails closed on malformed locks and wishlist containers, duplicates or over-limit lists", async t => {
  let stored: unknown;
  t.mock.method(globalThis, "fetch", async () => response(stored));
  for (const locked of [null, 0, 1, "true", [], {}]) {
    const current = snapshot();
    stored = { ...current, collector: { ...current.collector, copies: [{ ...current.collector!.copies[0], locked }] } };
    await assert.rejects(bootstrapBackend(), invalid);
  }
  for (const wishlistItemIds of [null, {}, "item", [42], [""], [itemId, itemId], Array.from({ length: 201 }, (_, i) => `item-${i}`)]) {
    const current = snapshot(); stored = { ...current, collector: { ...current.collector, wishlistItemIds } };
    await assert.rejects(bootstrapBackend(), invalid);
  }
});

test("lock and wishlist commands share cookie/player guard and replay the identical idempotency key after network loss", async t => {
  const stored = snapshot(); const calls: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/commands"); calls.push(options);
    if (calls.length % 2 === 1) throw new TypeError("Connection lost after commit");
    return response({ snapshot: stored, result: { success: true } });
  });
  const commands: BackendCommand[] = [
    { type: "copy-lock", copyId: stored.collector!.copies[0].id, locked: true },
    { type: "wishlist-update", itemId, wished: false },
  ];
  for (const command of commands) assert.equal((await sendBackendCommand(command, stored.player.id)).result.success, true);
  assert.equal(calls.length, 4);
  for (let i = 0; i < calls.length; i += 2) {
    const first = calls[i], retried = calls[i + 1];
    assert.equal(first.body, retried.body); assert.deepEqual(JSON.parse(first.body as string), commands[i / 2]);
    const headers = new Headers(first.headers), secondHeaders = new Headers(retried.headers);
    assert.equal(headers.get("X-Xperience-Player"), stored.player.id);
    assert.equal(headers.get("Idempotency-Key"), secondHeaders.get("Idempotency-Key"));
    assert.equal(first.credentials, "same-origin"); assert.equal(first.cache, "no-store");
  }
});

test("market client sends bounded filter names and preserves filters on subsequent cursor pages", async t => {
  const paths: string[] = []; const cursor = randomUUID();
  const filters: MarketFilters = { query: "Cóc & bạn", rarity: "MYTHIC", clubId: "street-workout-hn", itemId, minPrice: 0, maxPrice: 250, sort: "price-asc", wishlistOnly: true };
  t.mock.method(globalThis, "fetch", async (url: string) => { paths.push(String(url)); return response({ listings: [], ownListings: [], nextCursor: null }); });
  await readMarketplace(undefined, undefined, { ...filters, untrusted: "player-secret" } as MarketFilters);
  await readMarketplace(cursor, undefined, filters);
  for (const [index, path] of paths.entries()) {
    const url = new URL(path, "http://local.test");
    for (const [key, value] of Object.entries(filters)) assert.equal(url.searchParams.get(key), String(value));
    assert.equal(url.searchParams.has("untrusted"), false);
    assert.equal(url.searchParams.get("cursor"), index === 1 ? cursor : null);
  }
});

function marketPage(): MarketPage {
  return {
    listings: [], ownListings: [], nextCursor: null, wishlistMatches: 2,
    history: [{ listingId: randomUUID(), itemId, price: 20, completedAt: timestamp, side: "buy" }],
    priceSummary: { itemId, salesCount: 2, minPrice: 10, maxPrice: 20, averagePrice: 15, lastPrice: 20 },
  };
}
test("market client accepts actual receipt summaries, null unsold prices and pre-upgrade pages", async t => {
  let page: unknown = marketPage();
  t.mock.method(globalThis, "fetch", async () => response(page));
  assert.deepEqual(await readMarketplace(), page);
  page = { ...marketPage(), history: [], priceSummary: null, wishlistMatches: 0 };
  assert.deepEqual(await readMarketplace(), page);
  page = { listings: [], ownListings: [], nextCursor: null };
  assert.deepEqual(await readMarketplace(), page);
});

test("market client never applies another item's price summary to the exact item being hunted", async t => {
  const page = marketPage();
  t.mock.method(globalThis, "fetch", async () => response(page));
  assert.deepEqual(await readMarketplace(undefined, undefined, { itemId }), page);
  await assert.rejects(readMarketplace(undefined, undefined, { itemId: cosmeticsByRarity("MYTHIC")[0].id }), invalid);
});

test("market client rejects forged receipts, duplicate transactions and invalid price summaries", async t => {
  let current: unknown;
  t.mock.method(globalThis, "fetch", async () => response(current));
  const page = marketPage(), receipt = page.history![0], summary = page.priceSummary!;
  const invalidPages = [
    ...[null, {}, Array.from({ length: 51 }, () => ({ ...receipt, listingId: randomUUID() })), [receipt, receipt],
      [{ ...receipt, side: "transfer" }], [{ ...receipt, listingId: "forged" }], [{ ...receipt, price: -1 }],
      [{ ...receipt, price: .5 }], [{ ...receipt, completedAt: "not-a-date" }], [{ ...receipt, itemId: "" }],
    ].map(history => ({ ...page, history })),
    ...[-1, .5, "2", null].map(wishlistMatches => ({ ...page, wishlistMatches })),
    ...[{}, { ...summary, salesCount: 0 }, { ...summary, salesCount: .5 }, { ...summary, minPrice: 0 },
      { ...summary, maxPrice: 9 }, { ...summary, averagePrice: "15" }, { ...summary, averagePrice: 50 },
      { ...summary, lastPrice: 21 }, { ...summary, lastPrice: 10.5 }, { ...summary, maxPrice: 1_000_001 },
    ].map(priceSummary => ({ ...page, priceSummary })),
  ];
  for (const page of invalidPages) { current = page; await assert.rejects(readMarketplace(), invalid); }
});
