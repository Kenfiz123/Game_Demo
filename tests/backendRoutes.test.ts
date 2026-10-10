import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { createDefaultSettings } from "../src/data/economyConfig";
import { getServerConfig } from "../src/lib/server/config";
import { createApiHandlers, MAX_BODY_BYTES } from "../src/lib/server/http";
import { XperienceStore } from "../src/lib/server/store";
import { CommandValidationError, validateCommand } from "../src/lib/server/validation";

const origin = "http://localhost:3003";
const cookieName = "xperience_test_session";
function fixture(t: TestContext, demoToolsEnabled = true) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "xperience-http-"));
  const databasePath = path.join(directory, "test.sqlite");
  const store = new XperienceStore(databasePath, { demoToolsEnabled });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const config = { databasePath, sessionCookie: cookieName, sessionLifetimeMs: 30 * 86400 * 1000, demoToolsEnabled };
  return { store, api: createApiHandlers({ getStore: () => store, getConfig: () => config }) };
}
function post(route: string, body: unknown = {}, headers: Record<string, string> = {}, base = origin) {
  return new Request(`${base}/api/${route}`, {
    method: "POST", headers: { Origin: base, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}
async function bootstrap(api: ReturnType<typeof createApiHandlers>) {
  const response = await api.session(post("session"));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const snapshot = await response.json();
  return { cookie, snapshot };
}
const commandHeaders = (cookie: string, playerId: string, requestId = randomUUID()) => ({
  Cookie: cookie, "X-Xperience-Player": playerId, "Idempotency-Key": requestId,
});

test("server configuration defaults to a local DB and supports isolated demo-disabled instances", () => {
  const defaults = getServerConfig({});
  assert.equal(defaults.databasePath, path.join(process.cwd(), "data", "xperience.sqlite"));
  assert.equal(defaults.sessionCookie, "xperience_session_v1");
  assert.equal(defaults.demoToolsEnabled, true);
  const custom = getServerConfig({ XPERIENCE_DB_PATH: "private/test.sqlite", XPERIENCE_SESSION_COOKIE: "test_guest", XPERIENCE_DEMO_TOOLS: "false" });
  assert.equal(custom.databasePath, path.resolve("private/test.sqlite"));
  assert.equal(custom.sessionCookie, "test_guest");
  assert.equal(custom.demoToolsEnabled, false);
  assert.throws(() => getServerConfig({ XPERIENCE_SESSION_COOKIE: "bad; Path=/" }));
});

test("anonymous bootstrap returns an HttpOnly host-only cookie without exposing its token in JSON", async t => {
  const { api } = fixture(t);
  const response = await api.session(post("session"));
  const setCookie = response.headers.get("set-cookie")!;
  assert.match(setCookie, /^xperience_test_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000$/);
  assert.doesNotMatch(setCookie, /Domain=|Secure/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const token = setCookie.split(";")[0].split("=")[1];
  const text = await response.text();
  assert.ok(!text.includes(token));
  assert.ok(!text.includes("token_hash"));
  const snapshot = JSON.parse(text);
  assert.equal(snapshot.state.exPoints, 50000);
  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.canImportLegacy, true);
  const again = await api.session(post("session", {}, { Cookie: setCookie.split(";")[0] }));
  assert.equal(again.headers.get("set-cookie"), null);
  assert.equal((await again.json()).player.id, snapshot.player.id);
});

test("HTTPS adds Secure even though plain localhost production does not", async t => {
  const { api } = fixture(t);
  const response = await api.session(post("session", {}, {}, "https://localhost:3003"));
  assert.match(response.headers.get("set-cookie")!, /; Secure$/);
});

test("every write rejects missing, null, foreign, same-site and spoofed forwarded origins", async t => {
  const { api } = fixture(t);
  const { cookie, snapshot } = await bootstrap(api);
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: "" }, { Origin: "null" }, { Origin: "http://localhost:3002" },
    { Origin: "https://attacker.invalid", "X-Forwarded-Host": "attacker.invalid", "X-Forwarded-Proto": "https" },
    { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" },
  ];
  for (const headers of rejectedHeaders) {
    const session = await api.session(post("session", {}, headers));
    assert.equal(session.status, 403);
    const mutation = await api.commands(post("commands", { type: "play", game: "chest" }, { ...commandHeaders(cookie, snapshot.player.id), ...headers }));
    assert.equal(mutation.status, 403);
  }
  assert.equal((await api.state(new Request(`${origin}/api/state`, { headers: { Cookie: cookie } }))).status, 200);
});

test("actual Host supports localhost, IP and LAN origins when Next uses an internal bind hostname", async t => {
  const { api } = fixture(t);
  for (const host of ["localhost:3003", "127.0.0.1:3003", "192.168.1.15:3003", "[::1]:3003"]) {
    const response = await api.session(post("session", {}, { Host: host, Origin: `http://${host}` }));
    assert.equal(response.status, 200, host);
  }
  const normalized = await api.session(post("session", {}, { Host: "LOCALHOST:3003", Origin: origin }));
  assert.equal(normalized.status, 200);
});

test("malformed Host and forwarded-host/port spoofing cannot authorize a foreign origin", async t => {
  const { api } = fixture(t);
  for (const host of ["localhost:3003/path", "user@localhost:3003", "localhost:3003?evil", "localhost:3003#evil",
    "localhost:3003,attacker.invalid", "localhost:0", "localhost:65536", "[invalid]:3003", "localhost\\evil", ""]) {
    assert.equal((await api.session(post("session", {}, { Host: host }))).status, 403, host);
  }
  const spoofedHeaders: Record<string, string>[] = [
    { Host: "127.0.0.1:3003", Origin: origin },
    { Host: "localhost:3003", Origin: "http://attacker.invalid:3003", "X-Forwarded-Host": "attacker.invalid:3003" },
    { Host: "localhost:3003", Origin: "http://localhost:4000", "X-Forwarded-Port": "4000" },
  ];
  for (const headers of spoofedHeaders) assert.equal((await api.session(post("session", {}, headers))).status, 403);
});

test("GET never creates sessions and malformed, duplicate or missing cookies do not authenticate", async t => {
  const { api } = fixture(t);
  const { cookie } = await bootstrap(api);
  for (const value of ["", `${cookieName}=forged`, `${cookie}; ${cookie}`, `${cookieName}=%61`.repeat(43)]) {
    const response = await api.state(new Request(`${origin}/api/state`, { headers: { Cookie: value } }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal((await response.json()).error.code, "NO_SESSION");
  }
});

test("separate cookies isolate balances and ownership; expected player header cannot select another user", async t => {
  const { api } = fixture(t);
  const first = await bootstrap(api), second = await bootstrap(api);
  assert.notEqual(first.snapshot.player.id, second.snapshot.player.id);
  const mismatch = await api.commands(post("commands", { type: "play", game: "chest" }, commandHeaders(first.cookie, second.snapshot.player.id)));
  assert.equal(mismatch.status, 409);
  assert.equal((await mismatch.json()).error.code, "SESSION_CHANGED");
  const opening = await api.commands(post("commands", { type: "play", game: "chest" }, commandHeaders(first.cookie, first.snapshot.player.id)));
  assert.equal(opening.status, 200);
  const reply = await opening.json();
  assert.ok(reply.result.success);
  assert.equal(reply.snapshot.state.exPoints, 49900);
  assert.equal(reply.snapshot.state.ownedItemIds.length, 1);
  const untouched = await api.state(new Request(`${origin}/api/state`, { headers: { Cookie: second.cookie } }));
  assert.equal((await untouched.json()).state.exPoints, 50000);
});

test("retrying one command key returns the original outcome without charging or granting again", async t => {
  const { api } = fixture(t);
  const { cookie, snapshot } = await bootstrap(api);
  const headers = commandHeaders(cookie, snapshot.player.id);
  const command = { type: "play", game: "chest" };
  const first = await (await api.commands(post("commands", command, headers))).json();
  const retry = await (await api.commands(post("commands", command, headers))).json();
  assert.deepEqual(retry, first);
  const different = await api.commands(post("commands", { type: "play", game: "orbit" }, headers));
  assert.equal(different.status, 409);
  assert.equal((await different.json()).error.code, "IDEMPOTENCY_CONFLICT");
});

test("commands require both valid UUID headers and a session before execution", async t => {
  const { api } = fixture(t);
  const { cookie, snapshot } = await bootstrap(api);
  const noSession = await api.commands(post("commands", { type: "grant-test-ex" }));
  assert.equal(noSession.status, 401);
  const invalidHeaders: Record<string, string>[] = [{ Cookie: cookie },
    { ...commandHeaders(cookie, snapshot.player.id), "Idempotency-Key": "not-a-uuid" },
    { ...commandHeaders(cookie, snapshot.player.id), "X-Xperience-Player": "not-a-uuid" }];
  for (const headers of invalidHeaders) {
    const response = await api.commands(post("commands", { type: "grant-test-ex" }, headers));
    assert.equal(response.status, 400);
  }
});

test("only exact command DTOs are accepted; injected balances, inventory and arbitrary fields are rejected", () => {
  for (const command of [null, [], {}, { type: "unknown" }, { type: "play", game: "chest", exPoints: 999999 },
    { type: "equip", itemId: "ok", ownedItemIds: ["ok"] }, { type: "play", game: "other" },
    { type: "trade-up", itemIds: ["a"] }, { type: "trade-up", itemIds: ["a", "a", "a", "a", 5] },
    { type: "equip", itemId: "" }, { type: "equip", itemId: "\u0000injection" },
    { type: "equip", itemId: "x".repeat(201) }, { type: "unequip", slot: "BACKGROUND" },
    { type: "grant-test-ex", amount: 100000 }, { type: "reset-demo", state: {} },
    { type: "import-legacy", raw: "" }]) assert.throws(() => validateCommand(command), CommandValidationError);
  assert.deepEqual(validateCommand({ type: "trade-up", itemIds: Array(5).fill("same-copy") }), { type: "trade-up", itemIds: Array(5).fill("same-copy") });
  assert.deepEqual(validateCommand({ type: "unequip", slot: "AVATAR" }), { type: "unequip", slot: "AVATAR" });
});

test("settings allow valid fractional odds but reject extra keys, invalid totals, negative and non-finite values", () => {
  const settings = createDefaultSettings();
  assert.deepEqual(validateCommand({ type: "settings", settings }), { type: "settings", settings });
  for (const invalid of [
    { ...settings, surprise: true },
    { ...settings, chestOdds: { ...settings.chestOdds, INJECT: 100 } },
    { ...settings, chestOdds: { ...settings.chestOdds, MYTHIC: -1 } },
    { ...settings, chestOdds: { ...settings.chestOdds, COMMON: 0 } },
    { ...settings, tradeUpOdds: { ...settings.tradeUpOdds, MYTHIC: 100 } },
    { ...settings, tradeUpOdds: { ...settings.tradeUpOdds, EPIC: Infinity } },
  ]) assert.throws(() => validateCommand({ type: "settings", settings: invalid }), CommandValidationError);
});

test("demo-disabled servers reject all test tools but still allow normal play", async t => {
  const { api } = fixture(t, false);
  const { cookie, snapshot } = await bootstrap(api);
  assert.equal(snapshot.demoToolsEnabled, false);
  assert.equal(snapshot.canImportLegacy, false);
  for (const command of [{ type: "grant-test-ex" }, { type: "reset-demo" },
    { type: "settings", settings: createDefaultSettings() }, { type: "import-legacy", raw: "{}" }]) {
    const response = await api.commands(post("commands", command, commandHeaders(cookie, snapshot.player.id)));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "DEMO_DISABLED");
  }
  assert.equal((await api.commands(post("commands", { type: "play", game: "chest" }, commandHeaders(cookie, snapshot.player.id)))).status, 200);
});

test("JSON writes reject wrong content type, malformed JSON, invalid UTF-8 and non-empty session bodies", async t => {
  const { api } = fixture(t);
  const invalidRequests = [
    post("session", {}, { "Content-Type": "text/plain" }),
    post("session", { state: { exPoints: 10000 } }),
    new Request(`${origin}/api/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{" }),
    new Request(`${origin}/api/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: new Uint8Array([255, 254]) }),
  ];
  for (const request of invalidRequests) assert.equal((await api.session(request)).status, 400);
});

test("body limits check both declared size and streamed actual bytes even with a lying Content-Length", async t => {
  const { api } = fixture(t);
  const tooLarge = "x".repeat(MAX_BODY_BYTES + 1);
  const sizeHeaders: Record<string, string>[] = [{ "Content-Length": String(MAX_BODY_BYTES + 1) }, { "Content-Length": "1" }, {}];
  for (const headers of sizeHeaders) {
    const request = new Request(`${origin}/api/session`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: tooLarge,
    });
    const response = await api.session(request);
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
  }
});

test("aborted bodies and invalid Content-Length fail closed without opening a database", async () => {
  let opened = false;
  const api = createApiHandlers({ getStore: () => { opened = true; throw new Error("must not open"); } });
  const controller = new AbortController(); controller.abort();
  const request = new Request(`${origin}/api/session`, {
    method: "POST", signal: controller.signal,
    headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal((await api.session(request)).status, 400);
  assert.equal((await api.session(post("session", {}, { "Content-Length": "invalid" }))).status, 400);
  assert.equal(opened, false);
});

test("a stalled body is cancelled promptly when the client disconnects", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const api = createApiHandlers({ getStore: () => { throw new Error("must not open"); } });
  const request = new Request(`${origin}/api/session`, {
    method: "POST", signal: controller.signal, body, duplex: "half",
    headers: { Origin: origin, "Content-Type": "application/json" },
  } as RequestInit);
  const response = api.session(request);
  controller.abort();
  assert.equal((await response).status, 400);
  assert.equal(cancelled, true);
});

test("HTTP failures and health responses never leak database paths, SQL, credentials or server error details", async t => {
  const { api } = fixture(t);
  const healthy = await api.health();
  assert.deepEqual(await healthy.json(), { ok: true, storage: "sqlite" });
  const broken = createApiHandlers({ getStore: () => { throw new Error("SELECT token_hash FROM secret at C:/private/secret.sqlite"); } });
  for (const response of [await broken.health(), await broken.session(post("session")),
    await broken.state(new Request(`${origin}/api/state`, { headers: { Cookie: `xperience_session_v1=${"a".repeat(43)}` } }))]) {
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.doesNotMatch(text, /SELECT|token_hash|private|secret\.sqlite/);
    assert.equal(JSON.parse(text).error.code, "STORAGE_UNAVAILABLE");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
});
