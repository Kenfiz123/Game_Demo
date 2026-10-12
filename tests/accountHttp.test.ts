import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { createDefaultSettings } from "../src/data/economyConfig";
import { createApiHandlers } from "../src/lib/server/http";
import { XperienceStore } from "../src/lib/server/store";
import { parseAccountAction, validCollectorProfile } from "../src/lib/collectorValidation";
import type { BackendCommand, BackendCommandReply, BackendSnapshot } from "../src/types/backend";
import type { AccountAction } from "../src/types/collector";

const origin = "http://localhost:3003";
const password = "a locally secured passphrase";
const cookieName = "account_http_session";
const register: AccountAction = { action: "register", username: "Collector_27", password, displayName: "Nhà sưu tầm" };
type Api = ReturnType<typeof createApiHandlers>;
interface Session { cookie: string; snapshot: BackendSnapshot; }

function fixture(t: TestContext) {
  const store = new XperienceStore(":memory:", { now: () => Date.parse("2026-10-11T09:00:00Z"), random: () => .5 });
  t.after(() => store.close());
  const config = { databasePath: ":memory:", sessionCookie: cookieName, sessionLifetimeMs: 30 * 86400 * 1000, demoToolsEnabled: true };
  return { store, api: createApiHandlers({ getStore: () => store, getConfig: () => config }) };
}
function post(route: string, body: unknown, headers: Record<string, string> = {}, base = origin) {
  return new Request(`${base}/api/${route}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function authHeaders(session: Session) { return { Cookie: session.cookie, "X-Xperience-Player": session.snapshot.player.id }; }
async function sessionResponse(response: Response): Promise<Session> {
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return { cookie: setCookie.split(";")[0], snapshot: await response.json() as BackendSnapshot };
}
async function guest(api: Api) { return sessionResponse(await api.session(post("session", {}))); }
async function command(api: Api, session: Session, value: BackendCommand): Promise<BackendCommandReply> {
  const response = await api.commands(post("commands", value, { ...authHeaders(session), "Idempotency-Key": randomUUID() }));
  assert.equal(response.status, 200);
  const reply = await response.json() as BackendCommandReply;
  session.snapshot = reply.snapshot;
  return reply;
}
async function forceMythic(api: Api, session: Session) {
  const settings = createDefaultSettings();
  settings.chestOdds = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, MYTHIC: 100 };
  await command(api, session, { type: "settings", settings });
  await command(api, session, { type: "play", game: "chest" });
}

test("HTTP registration preserves guest inventory, copy identities, EX and XCoin while rotating a private cookie", async t => {
  const { api, store } = fixture(t);
  const before = await guest(api);
  await forceMythic(api, before);
  await command(api, before, { type: "play", game: "chest" });
  await command(api, before, { type: "claim-event", eventId: "daily-visit" });
  assert.equal(before.snapshot.state.ownedItemIds.length, 2);
  assert.equal(new Set(before.snapshot.state.ownedItemIds).size, 1);
  assert.equal(before.snapshot.economy?.coinBalance, 20);
  const oldSnapshot = structuredClone(before.snapshot);
  const response = await api.auth(post("auth", register, authHeaders(before)));
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie")!;
  assert.match(setCookie, /^account_http_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000$/);
  assert.doesNotMatch(setCookie, /Domain=|Secure/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const text = await response.text();
  const after = JSON.parse(text) as BackendSnapshot;
  const token = setCookie.split(";")[0].split("=")[1];
  assert.equal(text.includes(token), false);
  assert.equal(text.includes(password), false);
  assert.doesNotMatch(text, /password_hash|password_salt|token_hash|password_version/);
  assert.notEqual(setCookie.split(";")[0], before.cookie);
  assert.equal(after.player.id, before.snapshot.player.id);
  assert.deepEqual(after.state, oldSnapshot.state);
  assert.deepEqual(after.economy, oldSnapshot.economy);
  assert.deepEqual(after.collector?.copies, oldSnapshot.collector?.copies);
  assert.deepEqual(after.collector?.discoveredItemIds, oldSnapshot.collector?.discoveredItemIds);
  assert.deepEqual(after.account, { username: "collector_27", displayName: register.displayName, createdAt: "2026-10-11T09:00:00.000Z" });
  assert.equal(store.getSnapshot(before.cookie.split("=")[1]), null);
});

test("auth HTTPS cookies are Secure and login switches players without merging a second guest", async t => {
  const { api } = fixture(t);
  const firstGuest = await guest(api);
  await forceMythic(api, firstGuest);
  const first = await sessionResponse(await api.auth(post("auth", register, authHeaders(firstGuest))));
  const second = await guest(api);
  await command(api, second, { type: "claim-event", eventId: "daily-visit" });
  const response = await api.auth(post("auth", { action: "login", username: "COLLECTOR_27", password }, authHeaders(second), "https://localhost:3003"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /; Secure$/);
  const logged = await response.json() as BackendSnapshot;
  assert.equal(logged.player.id, first.snapshot.player.id);
  assert.deepEqual(logged.state.ownedItemIds, first.snapshot.state.ownedItemIds);
  assert.equal(logged.economy?.coinBalance, first.snapshot.economy?.coinBalance);
  assert.notEqual(logged.player.id, second.snapshot.player.id);
  assert.equal((await api.state(new Request(`${origin}/api/state`, { headers: { Cookie: second.cookie } }))).status, 401);
});

test("credential DTOs reject injected authority and malformed fields before any account is created", async t => {
  const { api, store } = fixture(t);
  const session = await guest(api);
  const old = structuredClone(session.snapshot);
  const invalid = [null, [], {}, { ...register, playerId: randomUUID() }, { ...register, token: "x".repeat(43) },
    { ...register, passwordHash: "fake" }, { ...register, coinBalance: 9999 }, { ...register, username: "a" },
    { ...register, username: "bad@name" }, { ...register, password: "short" }, { ...register, password: "x".repeat(129) },
    { ...register, displayName: "x" }, { action: "logout", username: "collector_27" },
    { action: "password", currentPassword: password }, { action: "login", username: "collector_27", password, ownedItemIds: [] }];
  for (const value of invalid) {
    const response = await api.auth(post("auth", value, authHeaders(session)));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_REQUEST");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.deepEqual(store.getSnapshot(session.cookie.split("=")[1]), old);
});

test("auth rejects cross-origin requests, ambiguous cookies and forged or missing expected-player guards", async t => {
  const { api, store } = fixture(t);
  const session = await guest(api);
  const rejected: { headers: Record<string, string>; status: number }[] = [
    { headers: { ...authHeaders(session), Origin: "https://attacker.invalid" }, status: 403 },
    { headers: { ...authHeaders(session), Origin: "null" }, status: 403 },
    { headers: { ...authHeaders(session), "Sec-Fetch-Site": "cross-site" }, status: 403 },
    { headers: { ...authHeaders(session), "Sec-Fetch-Site": "same-site" }, status: 403 },
    { headers: { ...authHeaders(session), Origin: "https://attacker.invalid", "X-Forwarded-Host": "attacker.invalid", "X-Forwarded-Proto": "https" }, status: 403 },
    { headers: { Cookie: session.cookie }, status: 400 },
    { headers: { ...authHeaders(session), "X-Xperience-Player": "not-a-uuid" }, status: 400 },
    { headers: { ...authHeaders(session), "X-Xperience-Player": randomUUID() }, status: 409 },
    { headers: { ...authHeaders(session), Cookie: `${session.cookie}; ${session.cookie}` }, status: 401 },
    { headers: {}, status: 401 },
  ];
  for (const { headers, status } of rejected) {
    const response = await api.auth(post("auth", register, headers));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.deepEqual(store.getSnapshot(session.cookie.split("=")[1]), session.snapshot);
});

test("auth body limits and wrong content type fail without credentials, SQL or token details", async t => {
  const { api } = fixture(t);
  const session = await guest(api);
  const requests = [post("auth", register, { ...authHeaders(session), "Content-Type": "text/plain" }),
    post("auth", { ...register, password: "x".repeat(4200) }, { ...authHeaders(session), "Content-Length": "1" })];
  for (const [index, request] of requests.entries()) {
    const response = await api.auth(request);
    assert.equal(response.status, index === 0 ? 400 : 413);
    const text = await response.text();
    assert.equal(text.includes(password), false);
    assert.doesNotMatch(text, /SELECT|sqlite|token_hash|password_hash|password_salt/);
  }
});

test("wrong and unknown credentials receive the same safe 401 while attempts follow the username", async t => {
  const { api } = fixture(t);
  const session = await guest(api);
  const account = await sessionResponse(await api.auth(post("auth", register, authHeaders(session))));
  const wrongPassword = "wrong but long enough password";
  let knownError: unknown;
  for (const username of ["collector_27", "not_a_real_account"]) {
    const response = await api.auth(post("auth", { action: "login", username, password: wrongPassword }, authHeaders(account)));
    assert.equal(response.status, 401);
    const text = await response.text();
    assert.equal(text.includes(username), false); assert.equal(text.includes(wrongPassword), false);
    const error = JSON.parse(text);
    assert.equal(error.error.code, "INVALID_CREDENTIALS");
    if (knownError) assert.deepEqual(error, knownError); else knownError = error;
  }
  for (let count = 1; count < 5; count++) assert.equal((await api.auth(post("auth", { action: "login", username: "COLLECTOR_27", password: wrongPassword }, authHeaders(account)))).status, 401);
  const blocked = await api.auth(post("auth", { action: "login", username: "collector_27", password }, authHeaders(account)));
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error.code, "RATE_LIMITED");
});

test("profile sharing is opt-in and exposes only public presentation, never balance, inventory copies or identity secrets", async t => {
  const { api } = fixture(t);
  const before = await guest(api);
  const session = await sessionResponse(await api.auth(post("auth", register, authHeaders(before))));
  await forceMythic(api, session);
  const username = session.snapshot.account!.username;
  const getProfile = (name = username) => api.profile(new Request(`${origin}/api/profiles/${name}`), name);
  for (const name of [username, "missing_account", "bad/name"]) assert.equal((await getProfile(name)).status, 404);
  await command(api, session, { type: "profile-update", displayName: "Nhà sưu tầm", bio: "Một hành trình Mythic", isPublic: true, featuredItemIds: [session.snapshot.state.ownedItemIds[0]] });
  const response = await getProfile(username.toUpperCase());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["username", "displayName", "bio", "joinedAt", "featuredItemIds", "equipped", "discoveredItemIds"].sort());
  assert.equal(body.username, username);
  assert.equal(body.bio, "Một hành trình Mythic");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const text = JSON.stringify(body);
  for (const forbidden of [session.snapshot.player.id, session.cookie.split("=")[1], session.snapshot.collector!.copies[0].serial, password, "coinBalance", "exPoints", "password_hash", "copies"]) assert.equal(text.includes(forbidden), false, forbidden);
  await command(api, session, { type: "profile-update", ...session.snapshot.collector!.profile, isPublic: false });
  assert.equal((await getProfile()).status, 404);
});

test("copy passports require the actual owner cookie even when the collector profile is public", async t => {
  const { api } = fixture(t);
  const before = await guest(api);
  const owner = await sessionResponse(await api.auth(post("auth", register, authHeaders(before))));
  await forceMythic(api, owner);
  await command(api, owner, { type: "profile-update", ...owner.snapshot.collector!.profile, isPublic: true });
  const other = await guest(api), copy = owner.snapshot.collector!.copies[0];
  const request = (cookie?: string) => new Request(`${origin}/api/items/${copy.id}`, { headers: cookie ? { Cookie: cookie } : {} });
  const response = await api.passport(request(owner.cookie), copy.id);
  assert.equal(response.status, 200);
  const passport = await response.json();
  assert.deepEqual(passport.copy, copy);
  assert.deepEqual(passport.trail, [{ kind: "MINT", timestamp: "2026-10-11T09:00:00.000Z", ownerName: register.displayName }]);
  assert.equal((await api.passport(request(other.cookie), copy.id)).status, 404);
  assert.equal((await api.passport(request(), copy.id)).status, 401);
  assert.equal((await api.passport(request(owner.cookie), randomUUID())).status, 404);
  assert.equal((await api.passport(request(owner.cookie), "not-a-copy-id")).status, 404);
});

test("shared credential/profile DTO checks normalize only public fields and reject Unicode control/format injection", () => {
  assert.deepEqual(parseAccountAction({ ...register, username: "COLLECTOR_27", displayName: "  Nhà sưu tầm  ", password: ` ${password} ` }), { ...register, username: "collector_27", displayName: "Nhà sưu tầm", password: ` ${password} ` });
  for (const injected of ["hello\u0000world", "hello\u0080world", "hello\u200bworld", "hello\u202eworld"]) {
    assert.equal(parseAccountAction({ ...register, displayName: injected }), null);
    assert.equal(validCollectorProfile({ displayName: "Collector", bio: injected, isPublic: false, featuredItemIds: [] }), false);
  }
  assert.equal(validCollectorProfile({ displayName: "Collector", bio: "", isPublic: false, featuredItemIds: ["one", "one"] }), false);
  assert.equal(parseAccountAction({ ...register, playerId: randomUUID() }), null);
});
