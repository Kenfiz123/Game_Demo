import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { emptyEconomy } from "../src/data/eventEconomy";
import { BackendRequestError, readItemPassport, readPublicProfile, sendAccountAction } from "../src/lib/backendClient";
import { createDemoState } from "../src/lib/storage";
import type { BackendSnapshot } from "../src/types/backend";
import type { AccountAction, ItemCopy, ItemPassport, PublicCollectorProfile } from "../src/types/collector";

const timestamp = "2026-10-11T09:00:00.000Z";
const password = "local password never in URL";
const actions: AccountAction[] = [
  { action: "register", username: "collector_27", displayName: "Collector", password },
  { action: "login", username: "collector_27", password }, { action: "logout" },
  { action: "password", currentPassword: password, password: "replacement long local password" },
];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function mockFetch(t: TestContext, fetcher: (input: Parameters<typeof fetch>[0], options?: RequestInit) => Promise<Response>) {
  t.mock.method(globalThis, "fetch", fetcher);
}
function copy(itemId: string): ItemCopy {
  const id = randomUUID();
  return { id, itemId, serial: `XP-${id.replaceAll("-", "").toUpperCase()}`, origin: "CHEST", mintedAt: timestamp, recordedAt: timestamp, acquiredAt: timestamp, originalOwnerName: "Collector", transferCount: 0 };
}
function snapshot(): BackendSnapshot {
  const first = cosmeticsByRarity("MYTHIC")[0].id, second = cosmeticsByRarity("COMMON")[0].id;
  const state = createDemoState(); state.ownedItemIds = [first, first, second];
  return {
    player: { id: randomUUID(), createdAt: timestamp }, state, revision: 3, demoToolsEnabled: true, canImportLegacy: false,
    economy: emptyEconomy(Date.parse(timestamp)), account: { username: "collector_27", displayName: "Collector", createdAt: timestamp },
    collector: { profile: { displayName: "Collector", bio: "", isPublic: false, featuredItemIds: [first] }, copies: [copy(first), copy(first), copy(second)], discoveredItemIds: [first, second] },
  };
}
function publicProfile(): PublicCollectorProfile {
  const itemId = cosmeticsByRarity("MYTHIC")[0].id;
  return { username: "collector_27", displayName: "Collector", bio: "My collection", joinedAt: timestamp, featuredItemIds: [itemId], equipped: {}, discoveredItemIds: [itemId] };
}
const invalidReply = (error: unknown) => error instanceof BackendRequestError && error.status === 502;

test("account mutations POST credentials only in the JSON body, with same-origin cookie and expected-player guard", async t => {
  const stored = snapshot(), calls: { input: Parameters<typeof fetch>[0]; options?: RequestInit }[] = [];
  mockFetch(t, async (input, options) => { calls.push({ input, options }); return response(stored); });
  for (const action of actions) assert.deepEqual(await sendAccountAction(action, stored.player.id), stored);
  assert.equal(calls.length, actions.length);
  for (const [index, { input, options }] of calls.entries()) {
    assert.equal(input, "/api/auth"); assert.equal(String(input).includes(password), false);
    assert.equal(options?.method, "POST"); assert.equal(options?.credentials, "same-origin"); assert.equal(options?.cache, "no-store");
    assert.deepEqual(JSON.parse(options!.body as string), actions[index]);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("content-type"), "application/json"); assert.equal(headers.get("x-xperience-player"), stored.player.id);
    assert.equal(headers.has("authorization"), false); assert.equal(headers.has("cookie"), false);
  }
});

test("auth never automatically repeats an uncertain 503 or network request that may have rotated a cookie", async t => {
  let calls = 0, failNetwork = false;
  mockFetch(t, async () => { calls++; if (failNetwork) throw new TypeError("connection lost after rotation"); return response({ error: { code: "STORAGE_UNAVAILABLE", message: "Storage unavailable" } }, 503); });
  for (const action of actions) {
    const before = calls;
    await assert.rejects(sendAccountAction(action, randomUUID()), (error: unknown) => error instanceof BackendRequestError && error.status === 503 && error.uncertain);
    assert.equal(calls, before + 1);
  }
  failNetwork = true;
  for (const action of actions) {
    const before = calls;
    await assert.rejects(sendAccountAction(action, randomUUID()), (error: unknown) => error instanceof BackendRequestError && error.status === 0 && error.uncertain);
    assert.equal(calls, before + 1);
  }
});

test("collector snapshots accept independently identified duplicate catalog items and arbitrary copy ordering", async t => {
  const stored = snapshot(); stored.collector!.copies.reverse();
  mockFetch(t, async () => response(stored));
  const received = await sendAccountAction(actions[1], stored.player.id);
  assert.deepEqual(received.collector?.copies, stored.collector?.copies);
  assert.equal(new Set(received.collector?.copies.map(item => item.id)).size, 3);
  assert.equal(new Set(received.state.ownedItemIds).size, 2);
});

test("collector response verification rejects count-balanced catalog swaps, copy reuse, duplicate serials and invalid provenance", async t => {
  let current = snapshot();
  mockFetch(t, async () => response(current));
  const cases: ((value: BackendSnapshot) => void)[] = [
    value => { value.collector!.copies[0].itemId = value.state.ownedItemIds[2]; },
    value => { value.collector!.copies[1].id = value.collector!.copies[0].id; },
    value => { value.collector!.copies[1].serial = value.collector!.copies[0].serial; },
    value => { value.collector!.copies.pop(); },
    value => { value.collector!.copies[0].mintedAt = "bad date"; },
    value => { value.collector!.copies[0].acquiredAt = "bad date"; },
    value => { value.collector!.copies[0].transferCount = -1; },
    value => { value.collector!.copies[0].transferCount = .5; },
    value => { value.collector!.copies[0].id = "catalog-id-not-uuid"; },
    value => { value.collector!.copies[0].origin = "CLIENT" as ItemCopy["origin"]; },
    value => { value.collector!.discoveredItemIds.push(value.collector!.discoveredItemIds[0]); },
    value => { value.collector!.profile.featuredItemIds = ["a", "b", "c", "d"]; },
    value => { value.account!.username = "bad/user"; },
  ];
  for (const mutate of cases) {
    current = snapshot(); mutate(current);
    await assert.rejects(sendAccountAction(actions[1], current.player.id), invalidReply);
  }
});

test("public profile reads encode path segments and validate presentation without accepting arbitrary equipment slots", async t => {
  let current: unknown = publicProfile();
  const paths: string[] = [];
  mockFetch(t, async input => { paths.push(String(input)); return response(current); });
  assert.deepEqual(await readPublicProfile("collector_27"), current);
  assert.equal(paths[0], "/api/profiles/collector_27");
  await readPublicProfile("../collector?admin=true");
  assert.equal(paths[1], "/api/profiles/..%2Fcollector%3Fadmin%3Dtrue");
  const cases = [{ ...publicProfile(), username: "bad/user" }, { ...publicProfile(), joinedAt: "invalid date" },
    { ...publicProfile(), equipped: { ADMIN: "admin-item" } }, { ...publicProfile(), featuredItemIds: ["a", "a"] },
    { ...publicProfile(), bio: "x".repeat(181) }, { ...publicProfile(), discoveredItemIds: [42] }];
  for (const invalid of cases) { current = invalid; await assert.rejects(readPublicProfile("collector_27"), invalidReply); }
});

test("passport reads verify that the returned copy is the requested one and validate every ownership-trail entry", async t => {
  const owned = copy(cosmeticsByRarity("MYTHIC")[0].id);
  const passport: ItemPassport = { copy: owned, trail: [{ kind: "MINT", timestamp, ownerName: "Collector" }, { kind: "TRANSFER", timestamp, ownerName: null }] };
  let current: unknown = passport, requested = "";
  mockFetch(t, async input => { requested = String(input); return response(current); });
  assert.deepEqual(await readItemPassport(owned.id), passport);
  assert.equal(requested, `/api/items/${owned.id}`);
  current = { ...passport, copy: { ...owned, id: randomUUID() } };
  await assert.rejects(readItemPassport(owned.id), invalidReply);
  for (const trail of [[{ kind: "ADMIN", timestamp, ownerName: "Collector" }], [{ kind: "MINT", timestamp: "invalid date", ownerName: null }], [{ kind: "TRANSFER", timestamp, ownerName: "x" }]]) {
    current = { ...passport, trail }; await assert.rejects(readItemPassport(owned.id), invalidReply);
  }
  current = passport;
  await assert.rejects(readItemPassport("../copy?secret=yes"), invalidReply);
  assert.equal(requested, "/api/items/..%2Fcopy%3Fsecret%3Dyes");
});
