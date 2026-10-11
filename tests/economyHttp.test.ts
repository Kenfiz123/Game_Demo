import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { emptyEconomy, economyDay, forgeChance } from "../src/data/eventEconomy";
import { createDemoState } from "../src/lib/storage";
import { createApiHandlers } from "../src/lib/server/http";
import { XperienceStore } from "../src/lib/server/store";
import { CommandValidationError, validateCommand } from "../src/lib/server/validation";
import type { BackendSnapshot } from "../src/types/backend";

const origin = "http://localhost:3003";
const post = (body: unknown, cookie?: string, playerId?: string, key = randomUUID()) => new Request(`${origin}/api/commands`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}),
    ...(playerId ? { "X-Xperience-Player": playerId, "Idempotency-Key": key } : {}) }, body: JSON.stringify(body),
});

test("XCoin rules use Vietnam midnight and transparent bounded forge chances", () => {
  assert.equal(economyDay(Date.parse("2026-10-10T16:59:59Z")), "2026-10-10");
  assert.equal(economyDay(Date.parse("2026-10-10T17:00:00Z")), "2026-10-11");
  assert.equal(emptyEconomy(0).coinBalance, 0);
  for (const [coins, chance] of [[-10, 0], [0, 0], [9, 0], [10, 1], [100, 10], [250, 25], [750, 25], [1000, 25], [NaN, 0], [Infinity, 0]]) assert.equal(forgeChance(coins), chance);
});

test("economy DTOs reject balance/reward injection and unsafe prices/coin increments", () => {
  for (const coins of [-10, 0, 1, 9, 11, 251, 260, 750, 751, 760, Infinity, NaN, "10"]) assert.throws(() => validateCommand({ type: "forge-mythic", itemIds: Array(5).fill("item"), coins }), CommandValidationError);
  for (const price of [0, -1, 1.1, 1_000_001, Number.MAX_SAFE_INTEGER, "10"]) assert.throws(() => validateCommand({ type: "market-list", itemId: "item", price }), CommandValidationError);
  for (const command of [
    { type: "claim-event", eventId: "daily-visit", coinsAwarded: 999 },
    { type: "claim-event", eventId: "invented" },
    { type: "market-buy", listingId: randomUUID(), price: 1 },
    { type: "market-cancel", listingId: "other-player" },
    { type: "forge-mythic", itemIds: Array(5).fill("item"), coins: 10, won: true },
  ]) assert.throws(() => validateCommand(command), CommandValidationError);
  for (const coins of [10, 250]) assert.deepEqual(validateCommand({ type: "forge-mythic", itemIds: Array(5).fill("item"), coins }), { type: "forge-mythic", itemIds: Array(5).fill("item"), coins });
});

test("authenticated HTTP forge rejects free and above-cap attempts without consumption and records the new paid odds", async t => {
  const store = new XperienceStore(":memory:", { random: () => 0.999 }); t.after(() => store.close());
  const api = createApiHandlers({ getStore: () => store, getConfig: () => ({ databasePath: ":memory:", sessionCookie: "qa", sessionLifetimeMs: 86400000, demoToolsEnabled: true }) });
  const session = await api.session(new Request(`${origin}/api/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" }));
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  const player = await session.json() as BackendSnapshot;
  const itemIds = Array(5).fill(cosmeticsByRarity("LEGENDARY")[0].id);
  assert.equal((await api.commands(post({ type: "import-legacy", raw: JSON.stringify({ ...createDemoState(), ownedItemIds: itemIds }) }, cookie, player.player.id))).status, 200);
  const claimed = await (await api.commands(post({ type: "claim-event", eventId: "daily-visit" }, cookie, player.player.id))).json();
  for (const coins of [0, 9, 251, 260, 750]) {
    assert.equal((await api.commands(post({ type: "forge-mythic", itemIds, coins }, cookie, player.player.id))).status, 400);
    const after = await (await api.state(new Request(`${origin}/api/state`, { headers: { Cookie: cookie } }))).json();
    assert.deepEqual(after, claimed.snapshot);
  }
  const key = randomUUID();
  const forged = await (await api.commands(post({ type: "forge-mythic", itemIds, coins: 10 }, cookie, player.player.id, key))).json();
  assert.equal(forged.result.success, true); assert.equal(forged.result.won, false); assert.equal(forged.result.chance, 1);
  assert.equal(forged.snapshot.economy.coinBalance, 10); assert.deepEqual(forged.snapshot.state.ownedItemIds, []);
  assert.equal(forged.snapshot.economy.forgeHistory[0].ruleVersion, 2);
  const replay = await (await api.commands(post({ type: "forge-mythic", itemIds, coins: 10 }, cookie, player.player.id, key))).json();
  assert.deepEqual(replay, forged);
});

test("authenticated HTTP market preserves escrow, transfers coins once, and rejects foreign writes", async t => {
  const store = new XperienceStore(":memory:"); t.after(() => store.close());
  const api = createApiHandlers({ getStore: () => store, getConfig: () => ({ databasePath: ":memory:", sessionCookie: "qa", sessionLifetimeMs: 86400000, demoToolsEnabled: true }) });
  async function session() {
    const response = await api.session(new Request(`${origin}/api/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" }));
    return { cookie: response.headers.get("set-cookie")!.split(";")[0], snapshot: await response.json() as BackendSnapshot };
  }
  const seller = await session(), buyer = await session();
  const item = cosmeticsByRarity("LEGENDARY")[0];
  const seed = { ...createDemoState(), ownedItemIds: [item.id, item.id] };
  assert.equal((await api.commands(post({ type: "import-legacy", raw: JSON.stringify(seed) }, seller.cookie, seller.snapshot.player.id))).status, 200);
  const listed = await (await api.commands(post({ type: "market-list", itemId: item.id, price: 10 }, seller.cookie, seller.snapshot.player.id))).json();
  assert.equal(listed.result.success, true);
  assert.deepEqual(listed.snapshot.state.ownedItemIds, [item.id]);
  assert.equal((await api.market(new Request(`${origin}/api/market`))).status, 401);
  for (const query of ["?cursor=bad", "?price=0", `?cursor=${randomUUID()}&cursor=${randomUUID()}`]) {
    assert.equal((await api.market(new Request(`${origin}/api/market${query}`, { headers: { Cookie: buyer.cookie } }))).status, 400);
  }
  const market = await api.market(new Request(`${origin}/api/market`, { headers: { Cookie: buyer.cookie } }));
  assert.equal(market.headers.get("cache-control"), "private, no-store");
  assert.equal((await market.json()).listings[0].id, listed.result.listingId);
  const claimKey = randomUUID();
  for (let i = 0; i < 2; i++) {
    const claimed = await (await api.commands(post({ type: "claim-event", eventId: "daily-visit" }, buyer.cookie, buyer.snapshot.player.id, claimKey))).json();
    assert.equal(claimed.snapshot.economy.coinBalance, 20);
  }
  const buyKey = randomUUID();
  for (let i = 0; i < 2; i++) {
    const reply = await (await api.commands(post({ type: "market-buy", listingId: listed.result.listingId }, buyer.cookie, buyer.snapshot.player.id, buyKey))).json();
    assert.equal(reply.result.success, true);
    assert.equal(reply.snapshot.economy.coinBalance, 10);
    assert.deepEqual(reply.snapshot.state.ownedItemIds, [item.id]);
  }
  const sellerState = await (await api.state(new Request(`${origin}/api/state`, { headers: { Cookie: seller.cookie } }))).json();
  assert.equal(sellerState.economy.coinBalance, 10);
  assert.deepEqual(sellerState.state.ownedItemIds, [item.id]);
  const foreign = post({ type: "claim-event", eventId: "daily-visit" }, buyer.cookie, buyer.snapshot.player.id);
  foreign.headers.set("Origin", "https://attacker.invalid");
  assert.equal((await api.commands(foreign)).status, 403);
  const unavailable = await (await api.commands(post({ type: "market-buy", listingId: listed.result.listingId }, buyer.cookie, buyer.snapshot.player.id))).json();
  assert.equal(unavailable.result.success, false);
  assert.equal(unavailable.result.reason, "LISTING_UNAVAILABLE");
  assert.equal(unavailable.snapshot.economy.coinBalance, 10);
  assert.deepEqual(unavailable.snapshot.state.ownedItemIds, [item.id]);
  assert.equal((await (await api.market(new Request(`${origin}/api/market`, { headers: { Cookie: buyer.cookie } }))).json()).listings.length, 0);
});
