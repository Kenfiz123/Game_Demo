import { test, mock } from "node:test";
import assert from "node:assert/strict";
import crypto, { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { XperienceStore } from "../src/lib/server/store";
import { StoreError } from "../src/lib/server/storeError";
import { hashPassword } from "../src/lib/server/accounts";
import { cosmeticsByRarity } from "../src/data/cosmetics";
import { createDemoState } from "../src/lib/storage";
import type { BackendCommand, BackendErrorCode } from "../src/types/backend";

const PASSWORD = "A strong local password 2026!";
const NEW_PASSWORD = "Another strong password 2026!";
function harness() {
  const directory = mkdtempSync(join(tmpdir(), "xperience-account-test-"));
  const path = join(directory, "accounts.sqlite");
  let now = Date.parse("2026-10-11T00:00:00Z");
  let store = new XperienceStore(path, { now: () => now });
  return {
    path, get store() { return store; },
    advance: (ms: number) => { now += ms; },
    restart: () => { store.close(); store = new XperienceStore(path, { now: () => now }); },
    cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}
function guest(store: XperienceStore) {
  const session = store.bootstrapSession(); assert.ok(session.token);
  return { token: session.token, id: session.snapshot.player.id, snapshot: session.snapshot };
}
function command(store: XperienceStore, player: ReturnType<typeof guest>, value: BackendCommand) {
  return store.execute(player.token, randomUUID(), value, player.id);
}
async function rejects(operation: () => Promise<unknown>, code: BackendErrorCode) {
  await assert.rejects(operation, (error: unknown) => error instanceof StoreError && error.code === code);
}

test("register attaches the exact current guest save and copy identities while rotating only its current token", async () => {
  const h = harness();
  try {
    const player = guest(h.store); const common = cosmeticsByRarity("COMMON")[0].id;
    const state = createDemoState(); state.exPoints = 12345; state.ownedItemIds = [common, common];
    command(h.store, player, { type: "import-legacy", raw: JSON.stringify(state) });
    const before = command(h.store, player, { type: "claim-event", eventId: "daily-visit" }).snapshot;
    const registered = await h.store.registerAccount(player.token, "My_Collector", PASSWORD, "Nhà sưu tầm");
    assert.equal(registered.snapshot.player.id, player.id);
    assert.deepEqual(registered.snapshot.state, before.state); assert.deepEqual(registered.snapshot.economy, before.economy);
    assert.equal(registered.snapshot.revision, before.revision);
    assert.deepEqual(registered.snapshot.collector!.copies, before.collector!.copies);
    assert.deepEqual(registered.snapshot.account, { username: "my_collector", displayName: "Nhà sưu tầm", createdAt: "2026-10-11T00:00:00.000Z" });
    assert.equal(registered.snapshot.collector!.profile.displayName, "Nhà sưu tầm");
    assert.notEqual(registered.token, player.token); assert.equal(h.store.getSnapshot(player.token), null);
    const db = new DatabaseSync(h.path);
    try {
      const row = db.prepare("SELECT * FROM accounts").get()!;
      assert.equal(row.password_version, 1); assert.match(row.password_salt as string, /^[0-9a-f]{32}$/);
      assert.match(row.password_hash as string, /^[0-9a-f]{128}$/);
      assert.equal(JSON.stringify(row).includes(PASSWORD), false);
      assert.equal(JSON.stringify(registered.snapshot).includes(row.password_hash as string), false);
      assert.equal(JSON.stringify(registered.snapshot).includes(registered.token), false);
    } finally { db.close(); }
    h.restart(); assert.deepEqual(h.store.getSnapshot(registered.token), registered.snapshot);
  } finally { h.cleanup(); }
});

test("logout starts a fresh anonymous save; cross-browser login restores the account without merging another guest", async () => {
  const h = harness();
  try {
    const original = guest(h.store);
    command(h.store, original, { type: "play", game: "chest" });
    const registered = await h.store.registerAccount(original.token, "collector", PASSWORD, "Collector One");
    const loggedOut = h.store.logoutAccount(registered.token);
    assert.equal(h.store.getSnapshot(registered.token), null);
    assert.notEqual(loggedOut.snapshot.player.id, original.id); assert.equal(loggedOut.snapshot.account, null);
    assert.deepEqual(loggedOut.snapshot.state, createDemoState());
    const otherGuest = guest(h.store);
    command(h.store, otherGuest, { type: "grant-test-ex" });
    command(h.store, otherGuest, { type: "play", game: "orbit" });
    const loggedIn = await h.store.loginAccount(otherGuest.token, "COLLECTOR", PASSWORD);
    assert.equal(h.store.getSnapshot(otherGuest.token), null);
    assert.deepEqual(loggedIn.snapshot, registered.snapshot);
    const secondBrowser = await h.store.loginAccount(undefined, "collector", PASSWORD);
    assert.deepEqual(secondBrowser.snapshot, registered.snapshot);
    assert.notEqual(secondBrowser.token, loggedIn.token); assert.ok(h.store.getSnapshot(loggedIn.token));
  } finally { h.cleanup(); }
});

test("account usernames are normalized and registration rejects collisions, bad fields and authenticated takeover", async () => {
  const h = harness();
  try {
    const one = guest(h.store), two = guest(h.store);
    const account = await h.store.registerAccount(one.token, "Mixed_CASE", PASSWORD, "Valid Name");
    await rejects(() => h.store.registerAccount(two.token, "mixed_case", PASSWORD, "Other Name"), "ACCOUNT_EXISTS");
    await rejects(() => h.store.registerAccount(account.token, "different", PASSWORD, "Other Name"), "ACCOUNT_EXISTS");
    for (const username of ["ab", "has spaces", "a".repeat(25), "<script>", "user\n"]) {
      await rejects(() => h.store.registerAccount(two.token, username, PASSWORD, "Other Name"), "INVALID_REQUEST");
    }
    for (const password of ["short", "a".repeat(129), "💫".repeat(100)]) {
      await rejects(() => h.store.registerAccount(two.token, "validuser", password, "Other Name"), "INVALID_REQUEST");
    }
    for (const displayName of ["x", " padded ", "a".repeat(41), "Name\u0000"]) {
      await rejects(() => h.store.registerAccount(two.token, "validuser", PASSWORD, displayName), "INVALID_REQUEST");
    }
    await rejects(() => h.store.registerAccount("not-a-token", "validuser", PASSWORD, "Other Name"), "NO_SESSION");
    assert.equal(h.store.getSnapshot(two.token)!.account, null);
  } finally { h.cleanup(); }
});

test("unknown and wrong-password login use one generic error and persistent username throttling survives fresh cookies and restart", async () => {
  const h = harness();
  try {
    const player = guest(h.store);
    await h.store.registerAccount(player.token, "secured", PASSWORD, "Secured User");
    await rejects(() => h.store.loginAccount(undefined, "missing", PASSWORD), "INVALID_CREDENTIALS");
    for (let index = 0; index < 5; index += 1) {
      const fresh = guest(h.store);
      await rejects(() => h.store.loginAccount(fresh.token, "SECURED", "This password is wrong"), "INVALID_CREDENTIALS");
      assert.ok(h.store.getSnapshot(fresh.token));
    }
    h.restart();
    await rejects(() => h.store.loginAccount(undefined, "secured", PASSWORD), "RATE_LIMITED");
    h.advance(15 * 60 * 1000);
    const login = await h.store.loginAccount(undefined, "secured", PASSWORD); assert.ok(login.snapshot.account);
    await rejects(() => h.store.loginAccount(undefined, "secured", "This password is wrong"), "INVALID_CREDENTIALS");
  } finally { h.cleanup(); }
});

test("password change checks the current password and revokes every previous session, including other browsers", async () => {
  const h = harness();
  try {
    const player = guest(h.store);
    const account = await h.store.registerAccount(player.token, "password_user", PASSWORD, "Password User");
    const other = await h.store.loginAccount(undefined, "password_user", PASSWORD);
    await rejects(() => h.store.changeAccountPassword(account.token, "Wrong current password", NEW_PASSWORD), "INVALID_CREDENTIALS");
    assert.ok(h.store.getSnapshot(account.token)); assert.ok(h.store.getSnapshot(other.token));
    const changed = await h.store.changeAccountPassword(account.token, PASSWORD, NEW_PASSWORD);
    assert.deepEqual(changed.snapshot, account.snapshot);
    assert.equal(h.store.getSnapshot(account.token), null); assert.equal(h.store.getSnapshot(other.token), null);
    await rejects(() => h.store.loginAccount(undefined, "password_user", PASSWORD), "INVALID_CREDENTIALS");
    const restored = await h.store.loginAccount(undefined, "password_user", NEW_PASSWORD);
    assert.deepEqual(restored.snapshot, changed.snapshot);
    const anonymous = guest(h.store);
    await rejects(() => h.store.changeAccountPassword(anonymous.token, PASSWORD, NEW_PASSWORD), "ACCOUNT_REQUIRED");
    await rejects(() => h.store.changeAccountPassword("invalid", PASSWORD, NEW_PASSWORD), "NO_SESSION");
  } finally { h.cleanup(); }
});

test("registration rechecks token after async crypto so simultaneous requests cannot attach two accounts", async () => {
  const h = harness();
  try {
    const player = guest(h.store);
    const outcomes = await Promise.allSettled([
      h.store.registerAccount(player.token, "first_name", PASSWORD, "First Name"),
      h.store.registerAccount(player.token, "second_name", PASSWORD, "Second Name"),
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
    const rejection = outcomes.find(outcome => outcome.status === "rejected") as PromiseRejectedResult;
    assert.ok(rejection.reason instanceof StoreError); assert.equal(rejection.reason.code, "NO_SESSION");
    const db = new DatabaseSync(h.path);
    try { assert.equal(db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE player_id = ?").get(player.id)!.count, 1); }
    finally { db.close(); }
  } finally { h.cleanup(); }
});

test("a delayed login cannot undo a subsequent logout of its initiating browser session", async () => {
  const h = harness();
  try {
    const accountGuest = guest(h.store);
    const account = await h.store.registerAccount(accountGuest.token, "late_login", PASSWORD, "Late Login");
    const browser = guest(h.store);
    const pending = h.store.loginAccount(browser.token, "late_login", PASSWORD);
    const loggedOut = h.store.logoutAccount(browser.token);
    await rejects(() => pending, "SESSION_CHANGED");
    assert.equal(h.store.getSnapshot(browser.token), null);
    assert.deepEqual(h.store.getSnapshot(loggedOut.token), loggedOut.snapshot);
    assert.equal(loggedOut.snapshot.account, null);
    assert.ok(h.store.getSnapshot(account.token));
    const newBrowser = await h.store.loginAccount(undefined, "late_login", PASSWORD);
    assert.equal(newBrowser.snapshot.account!.username, "late_login");
  } finally { h.cleanup(); }
});

test("account database failures are atomic and do not revoke a working guest token or lose inventory", async () => {
  const h = harness();
  try {
    const player = guest(h.store); command(h.store, player, { type: "play", game: "orbit" });
    const before = h.store.getSnapshot(player.token);
    const db = new DatabaseSync(h.path);
    try { db.exec("CREATE TRIGGER fail_account BEFORE INSERT ON accounts BEGIN SELECT RAISE(ABORT, 'test failure'); END;"); }
    finally { db.close(); }
    await rejects(() => h.store.registerAccount(player.token, "fail_user", PASSWORD, "Fail User"), "STORAGE_UNAVAILABLE");
    assert.deepEqual(h.store.getSnapshot(player.token), before);
  } finally { h.cleanup(); }
});

test("the scrypt queue hands reserved slots to waiters without letting an interleaved request exceed two hashes", async () => {
  const callbacks: ((error: Error | null, key: Buffer) => void)[] = [];
  let active = 0, maximum = 0, completed = 0;
  const stub = mock.method(crypto, "scrypt", (...args: unknown[]) => {
    active += 1; maximum = Math.max(maximum, active);
    callbacks.push(args.at(-1) as (error: Error | null, key: Buffer) => void);
  });
  const jobs: Promise<unknown>[] = [];
  const enqueue = () => jobs.push(hashPassword(PASSWORD).then(value => { completed += 1; return value; }));
  const settle = () => { active -= 1; callbacks.shift()!(null, Buffer.alloc(64)); };
  try {
    for (let index = 0; index < 6; index += 1) enqueue();
    assert.equal(active, 2);
    settle();
    // Crypto's completion releases a slot, but its previously queued waiter has
    // not resumed yet. A brand-new caller must not steal that reserved slot.
    await Promise.resolve(); enqueue(); await Promise.resolve();
    while (completed < jobs.length) {
      while (callbacks.length) settle();
      await Promise.resolve();
    }
    await Promise.all(jobs);
    assert.equal(maximum, 2); assert.equal(active, 0);
  } finally { stub.mock.restore(); }
});
