import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BackendRequestError, bootstrapBackend, readMarketplace, sendBackendCommand } from "../src/lib/backendClient";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { emptyEconomy } from "../src/data/eventEconomy";
import { createDemoState } from "../src/lib/storage";
import type { BackendSnapshot } from "../src/types/backend";
import type { MarketListing, MarketPage } from "../src/types/economy";

const NOW = Date.parse("2026-10-11T08:00:00Z");
const playerId = randomUUID();
const snapshot = (): BackendSnapshot => ({
  player: { id: playerId, createdAt: new Date(NOW).toISOString() }, state: createDemoState(), revision: 2,
  demoToolsEnabled: true, canImportLegacy: false, economy: emptyEconomy(NOW),
});
const listing = (): MarketListing => ({
  id: randomUUID(), itemId: cosmeticsByRarity("LEGENDARY")[0].id, sellerId: randomUUID(), price: 10, createdAt: new Date(NOW).toISOString(),
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const invalidDTO = (error: unknown) => error instanceof BackendRequestError && error.status === 502;
async function withFetch<T>(fetchImpl: typeof fetch, operation: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  try { globalThis.fetch = fetchImpl; return await operation(); }
  finally { globalThis.fetch = original; }
}

test("bootstrap accepts a server-authoritative wallet and remains compatible with pre-economy snapshots", async () => {
  const current = snapshot(); current.economy!.coinBalance = 125;
  assert.deepEqual(await withFetch(async () => response(current), () => bootstrapBackend()), current);
  const legacy = snapshot(); delete legacy.economy;
  assert.deepEqual(await withFetch(async () => response(legacy), () => bootstrapBackend()), legacy);
});

test("bootstrap rejects malformed coin balances, task progress, claims and wallet containers", async () => {
  const base = emptyEconomy(NOW);
  const invalid: unknown[] = [null, [], {},
    { ...base, coinBalance: -1 }, { ...base, coinBalance: 0.5 }, { ...base, coinBalance: "20" },
    { ...base, coinBalance: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, day: "11/10/2026" }, { ...base, progress: null },
    { ...base, progress: { chests: -1, trades: 0 } }, { ...base, progress: { chests: 0, trades: 0.5 } },
    { ...base, claimedEventIds: ["unknown-task"] }, { ...base, claimedEventIds: null }, { ...base, forgeHistory: {} }];
  for (const economy of invalid) {
    await withFetch(async () => response({ ...snapshot(), economy }), async () => {
      await assert.rejects(bootstrapBackend(), invalidDTO, JSON.stringify(economy));
    });
  }
});

test("wallet verification rejects impossible calendar dates, duplicate claims and forged forge-history records", async () => {
  const base = emptyEconomy(NOW);
  const record = { id: randomUUID(), timestamp: new Date(NOW).toISOString(), inputItemIds: Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id), coins: 10, chance: 6, won: false };
  const invalid: unknown[] = [
    { ...base, day: "2026-02-31" }, { ...base, day: "2026-00-01" },
    { ...base, claimedEventIds: ["daily-visit", "daily-visit"] },
    ...[null, {}, { ...record, id: "" }, { ...record, timestamp: "not-a-date" },
      { ...record, inputItemIds: record.inputItemIds.slice(0, 4) }, { ...record, inputItemIds: ["", ...record.inputItemIds.slice(1)] },
      { ...record, coins: 1 }, { ...record, coins: 760 }, { ...record, chance: 7 },
      { ...record, won: "false" }, { ...record, won: true }, { ...record, rewardItemId: "unexpected-reward" },
    ].map(entry => ({ ...base, forgeHistory: [entry] })),
    { ...base, forgeHistory: Array(101).fill(record) },
  ];
  for (const economy of invalid) {
    await withFetch(async () => response({ ...snapshot(), economy }), async () => { await assert.rejects(bootstrapBackend(), invalidDTO); });
  }
  const valid = { ...snapshot(), economy: { ...base, forgeHistory: Array.from({ length: 100 }, () => ({ ...record, id: randomUUID() })) } };
  assert.deepEqual(await withFetch(async () => response(valid), () => bootstrapBackend()), valid);
});

test("wallet bootstrap preserves legacy forge odds alongside versioned 1–25% paid receipts", async () => {
  const records = [
    { coins: 0, chance: 5, won: false },
    { coins: 10, chance: 6, won: false },
    { coins: 750, chance: 80, won: true, rewardItemId: cosmeticsByRarity("MYTHIC")[0].id },
    { coins: 10, chance: 1, won: false, ruleVersion: 2 as const },
    { coins: 250, chance: 25, won: true, ruleVersion: 2 as const, rewardItemId: cosmeticsByRarity("MYTHIC")[0].id },
  ].map(record => ({ ...record, id: randomUUID(), timestamp: new Date(NOW).toISOString(), inputItemIds: Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id) }));
  const current = snapshot(); current.economy!.forgeHistory = records;
  assert.deepEqual(await withFetch(async () => response(current), () => bootstrapBackend()), current);
});

test("wallet bootstrap rejects unknown forge rule versions and forged paid receipt bounds", async () => {
  const record = { id: randomUUID(), timestamp: new Date(NOW).toISOString(), inputItemIds: Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id), coins: 10, chance: 1, won: false, ruleVersion: 2 };
  const invalid = [
    { ...record, coins: 0, chance: 0 }, { ...record, coins: 260, chance: 25 },
    { ...record, coins: 750, chance: 80 }, { ...record, chance: 6 },
    { ...record, ruleVersion: undefined }, { ...record, ruleVersion: 1 },
    { ...record, ruleVersion: 3 }, { ...record, ruleVersion: "2" }, { ...record, ruleVersion: null },
  ];
  for (const receipt of invalid) {
    await withFetch(async () => response({ ...snapshot(), economy: { ...emptyEconomy(NOW), forgeHistory: [receipt] } }), async () => {
      await assert.rejects(bootstrapBackend(), invalidDTO);
    });
  }
});

test("marketplace reads preserve cursor pagination, cookie credentials, abort signal and non-cached GET semantics", async () => {
  const first = listing(); const second = listing(); const page: MarketPage = { listings: [first], ownListings: [], nextCursor: first.id };
  const calls: { url: string; request: RequestInit | undefined }[] = [];
  const controller = new AbortController();
  await withFetch(async (url, request) => {
    calls.push({ url: String(url), request });
    return response(calls.length === 1 ? page : { listings: [second], ownListings: [], nextCursor: null });
  }, async () => {
    const initial = await readMarketplace(undefined, controller.signal);
    assert.deepEqual(initial, page);
    const next = await readMarketplace(initial.nextCursor!, controller.signal);
    assert.deepEqual(next.listings, [second]); assert.equal(next.nextCursor, null);
  });
  assert.equal(calls[0].url, "/api/market"); assert.equal(calls[1].url, `/api/market?cursor=${encodeURIComponent(first.id)}`);
  for (const call of calls) {
    assert.equal(call.request?.method, "GET"); assert.equal(call.request?.credentials, "same-origin");
    assert.equal(call.request?.cache, "no-store"); assert.ok(call.request?.signal instanceof AbortSignal);
  }
});

test("marketplace enforces page-size limits, UUID identities, valid dates and bounded nonempty item IDs", async () => {
  const item = listing(); const base = { listings: [item], ownListings: [], nextCursor: null };
  const invalid: unknown[] = [
    { ...base, listings: Array(41).fill(item) }, { ...base, ownListings: Array(21).fill(item) },
    { ...base, nextCursor: "not-a-uuid" }, { ...base, nextCursor: "" },
    ...[{ ...item, id: "" }, { ...item, id: "forged-listing" }, { ...item, sellerId: "not-a-player-uuid" },
      { ...item, createdAt: "not-a-date" }, { ...item, itemId: "" }, { ...item, itemId: "x".repeat(257) },
    ].map(entry => ({ ...base, listings: [entry] })),
  ];
  for (const page of invalid) await withFetch(async () => response(page), async () => { await assert.rejects(readMarketplace(), invalidDTO); });
  const maximum: MarketPage = { listings: Array.from({ length: 40 }, listing), ownListings: Array.from({ length: 20 }, listing), nextCursor: item.id };
  assert.deepEqual(await withFetch(async () => response(maximum), () => readMarketplace()), maximum);
});

test("cancelling a marketplace read aborts fetch without retrying or applying a late page", async () => {
  const controller = new AbortController(); let calls = 0;
  await withFetch(((_url, request) => new Promise<Response>((_resolve, reject) => {
    calls++; request?.signal?.addEventListener("abort", () => reject(new DOMException("Unmounted", "AbortError")), { once: true });
  })) as typeof fetch, async () => {
    const pending = readMarketplace(undefined, controller.signal); controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  });
  assert.equal(calls, 1);
});

test("marketplace rejects malformed pages, prices, listing identity fields and pagination containers", async () => {
  const item = listing(); const base = { listings: [item], ownListings: [], nextCursor: null };
  const invalid: unknown[] = [null, [], {}, { ...base, listings: null }, { ...base, ownListings: {} }, { ...base, nextCursor: 25 },
    ...[0, -1, 1.5, 1_000_001, "10"].map(price => ({ ...base, listings: [{ ...item, price }] })),
    ...["id", "itemId", "sellerId", "createdAt"].map(key => ({ ...base, listings: [{ ...item, [key]: 12 }] })),
    { ...base, ownListings: [null] }];
  for (const page of invalid) {
    await withFetch(async () => response(page), async () => { await assert.rejects(readMarketplace(), invalidDTO, JSON.stringify(page)); });
  }
});

test("forge incomplete successful confirmations are rejected before any reveal can start", async () => {
  const command = { type: "forge-mythic" as const, itemIds: Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id), coins: 10 };
  const complete = { success: true, id: randomUUID(), won: false, chance: 1, reward: null };
  const invalid: unknown[] = [null, {}, { success: true }, { ...complete, id: undefined }, { ...complete, id: 12 },
    { ...complete, won: undefined }, { ...complete, won: "false" }, { ...complete, chance: undefined }, { ...complete, chance: "6" },
    { ...complete, reward: undefined }, { ...complete, won: true, reward: null }, { ...complete, won: true, reward: { item: {} } }];
  for (const result of invalid) {
    await withFetch(async () => response({ snapshot: snapshot(), result }), async () => {
      await assert.rejects(sendBackendCommand(command, playerId), invalidDTO, JSON.stringify(result));
    });
  }
});

test("forge accepts complete win, processed loss and rejected insufficient-coin outcomes distinctly", async () => {
  const command = { type: "forge-mythic" as const, itemIds: Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id), coins: 10 };
  const reward = { item: cosmeticsByRarity("MYTHIC")[0], isDuplicate: false, compensation: 0 };
  const results = [
    { success: true, id: randomUUID(), won: true, chance: 1, reward },
    { success: true, id: randomUUID(), won: false, chance: 1, reward: null },
    { success: false, reason: "INSUFFICIENT_COINS" },
  ];
  for (const result of results) {
    const reply = { snapshot: snapshot(), result };
    assert.deepEqual(await withFetch(async () => response(reply), () => sendBackendCommand(command, playerId)), reply);
  }
});

test("forge confirmation probability must match the chosen coin amount and reward must agree with the win state", async () => {
  const command = { type: "forge-mythic" as const, itemIds: Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id), coins: 10 };
  const reward = { item: cosmeticsByRarity("MYTHIC")[0], isDuplicate: false, compensation: 0 };
  const complete = { success: true, id: randomUUID(), won: false, chance: 1, reward: null };
  const invalid = [
    ...[-1, 0, 5, 6, 7, 25, 80, 1000].map(chance => ({ ...complete, chance })),
    { ...complete, id: "not-a-uuid" }, { ...complete, id: "" }, { ...complete, reward },
    { ...complete, won: true, reward: { ...reward, item: cosmeticsByRarity("COMMON")[0] } },
    { ...complete, won: true, reward: { ...reward, item: { ...reward.item, id: "" } } },
  ];
  for (const result of invalid) {
    await withFetch(async () => response({ snapshot: snapshot(), result }), async () => { await assert.rejects(sendBackendCommand(command, playerId), invalidDTO); });
  }
});

test("an uncertain forge retries the identical body and UUID key rather than initiating a second consumption", async () => {
  const command = { type: "forge-mythic" as const, itemIds: Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id), coins: 20 };
  const reply = { snapshot: snapshot(), result: { success: true, id: randomUUID(), won: false, chance: 2, reward: null } };
  const calls: RequestInit[] = [];
  await withFetch(async (_url, request) => {
    calls.push(request!);
    if (calls.length === 1) throw new TypeError("Connection lost after commit");
    return response(reply);
  }, async () => assert.deepEqual(await sendBackendCommand(command, playerId), reply));
  assert.equal(calls.length, 2); assert.equal(calls[0].body, calls[1].body); assert.deepEqual(JSON.parse(calls[0].body as string), command);
  const first = calls[0].headers as Record<string, string>; const second = calls[1].headers as Record<string, string>;
  assert.match(first["Idempotency-Key"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first["Idempotency-Key"], second["Idempotency-Key"]); assert.equal(second["X-Xperience-Player"], playerId);
});
