import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backendRequest, BackendRequestError, bootstrapBackend, reconcileBackendSnapshot, sendBackendCommand } from "../src/lib/backendClient";
import { hasLegacyProgress } from "../src/components/providers/XperienceProvider";
import { createDemoState } from "../src/lib/storage";
import type { BackendSnapshot } from "../src/types/backend";

const snapshot = (revision = 0, id = "guest-one"): BackendSnapshot => ({
  player: { id, createdAt: "2026-10-10T00:00:00Z" }, state: createDemoState(), revision, demoToolsEnabled: true, canImportLegacy: revision === 0,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("backend requests are cookie-authenticated and never cached", async () => {
  let request: RequestInit | undefined;
  const value = await backendRequest<{ ok: boolean }>("/api/state", { fetchImpl: (async (_url, options) => { request = options; return response({ ok: true }); }) as typeof fetch });
  assert.deepEqual(value, { ok: true });
  assert.equal(request?.credentials, "same-origin");
  assert.equal(request?.cache, "no-store");
  assert.equal(request?.method, "GET");
});
test("an uncertain network result retries exactly once with the same command key and body", async () => {
  const calls: RequestInit[] = [];
  await backendRequest("/api/commands", {
    method: "POST", body: { type: "play", game: "chest" }, headers: { "Idempotency-Key": "one-draw-only", "X-Xperience-Player": "guest" },
    fetchImpl: (async (_url, options) => { calls.push(options!); if (calls.length === 1) throw new TypeError("Network lost after commit"); return response({ ok: true }); }) as typeof fetch,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].headers, calls[1].headers);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal((calls[1].headers as Record<string, string>)["Idempotency-Key"], "one-draw-only");
});
test("503 storage failures retry once and preserve structured terminal errors", async () => {
  let calls = 0;
  await assert.rejects(backendRequest("/api/commands", { fetchImpl: (async () => { calls++; return response({ error: { code: "STORAGE_UNAVAILABLE", message: "Storage offline" } }, 503); }) as typeof fetch }),
    (error: unknown) => error instanceof BackendRequestError && error.code === "STORAGE_UNAVAILABLE" && error.status === 503 && error.uncertain);
  assert.equal(calls, 2);
});
test("deterministic validation and session errors are not retried", async () => {
  for (const status of [400, 401, 403, 409, 429]) {
    let calls = 0;
    await assert.rejects(backendRequest("/api/commands", { fetchImpl: (async () => { calls++; return response({ error: { code: "NO_SESSION", message: "Reconnect" } }, status); }) as typeof fetch }),
      (error: unknown) => error instanceof BackendRequestError && error.status === status && !error.uncertain);
    assert.equal(calls, 1);
  }
});
test("timeouts abort both bounded attempts", async () => {
  const signals: AbortSignal[] = [];
  await assert.rejects(backendRequest("/api/state", {
    timeoutMs: 5,
    fetchImpl: ((_url, options) => new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal as AbortSignal; signals.push(signal);
      signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
    })) as typeof fetch,
  }), (error: unknown) => error instanceof BackendRequestError && error.uncertain);
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal.aborted));
});
test("external cancellation is not retried and aborts the active fetch", async () => {
  const controller = new AbortController();
  let calls = 0;
  const request = backendRequest("/api/state", {
    signal: controller.signal,
    fetchImpl: ((_url, options) => new Promise<Response>((_resolve, reject) => {
      calls++; options?.signal?.addEventListener("abort", () => reject(new DOMException("Unmounted", "AbortError")), { once: true });
    })) as typeof fetch,
  });
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(calls, 1);
});
test("pre-cancelled requests never start and malformed success JSON is rejected", async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(backendRequest("/api/state", { signal: controller.signal, fetchImpl: (async () => { calls++; return response({}); }) as typeof fetch }), { name: "AbortError" });
  assert.equal(calls, 0);
  await assert.rejects(backendRequest("/api/state", { fetchImpl: (async () => new Response("not json")) as typeof fetch }),
    (error: unknown) => error instanceof BackendRequestError && error.status === 502);
});
test("out-of-order snapshots cannot rewind a player's inventory or change actor implicitly", () => {
  const current = snapshot(5), old = snapshot(2), next = snapshot(6), other = snapshot(0, "guest-two");
  assert.equal(reconcileBackendSnapshot(current, old), current);
  assert.equal(reconcileBackendSnapshot(current, next), next);
  assert.throws(() => reconcileBackendSnapshot(current, other), (error: unknown) => error instanceof BackendRequestError && error.code === "SESSION_CHANGED");
  assert.equal(reconcileBackendSnapshot(current, other, true), other);
});
test("bootstrap rejects malformed server snapshots rather than inventing local progress", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => response({ ...snapshot(), state: { ...createDemoState(), settings: null } });
    await assert.rejects(bootstrapBackend(), (error: unknown) => error instanceof BackendRequestError && error.status === 502);
  } finally { globalThis.fetch = originalFetch; }
});
test("a mutation creates one UUID and sends the active player's identity across retries", async () => {
  const originalFetch = globalThis.fetch, calls: RequestInit[] = [];
  try {
    globalThis.fetch = async (_url, options) => { calls.push(options!); return calls.length === 1 ? response({}, 503) : response({ snapshot: snapshot(1), result: { success: true } }); };
    await sendBackendCommand({ type: "grant-test-ex" }, "guest-one");
    const first = calls[0].headers as Record<string, string>, second = calls[1].headers as Record<string, string>;
    assert.match(first["Idempotency-Key"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(first["Idempotency-Key"], second["Idempotency-Key"]);
    assert.equal(first["X-Xperience-Player"], "guest-one");
  } finally { globalThis.fetch = originalFetch; }
});
test("incomplete opening confirmations are not allowed to crash or start a reveal", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => response({ snapshot: snapshot(1), result: { success: true } });
    await assert.rejects(sendBackendCommand({ type: "play", game: "chest" }, "guest-one"), (error: unknown) => error instanceof BackendRequestError && error.status === 502);
  } finally { globalThis.fetch = originalFetch; }
});
test("only meaningful bounded legacy saves are offered for explicit import", () => {
  const initial = createDemoState();
  assert.equal(hasLegacyProgress(null), false);
  assert.equal(hasLegacyProgress(JSON.stringify(initial)), false);
  assert.equal(hasLegacyProgress(JSON.stringify({ ...initial, exPoints: initial.exPoints + 1 })), true);
  assert.equal(hasLegacyProgress(JSON.stringify({ ...initial, ownedItemIds: ["retired-id", "retired-id"] })), true);
  assert.equal(hasLegacyProgress(JSON.stringify({ ...initial, version: 99 })), false);
  assert.equal(hasLegacyProgress(JSON.stringify({ ...initial, exPoints: -1 })), false);
  assert.equal(hasLegacyProgress("{broken"), false);
  assert.equal(hasLegacyProgress(" ".repeat(512 * 1024 + 1)), false);
});
test("live provider has no local RNG, storage write, or polling authority", () => {
  const source = readFileSync(new URL("../src/components/providers/XperienceProvider.tsx", import.meta.url), "utf8");
  for (const forbidden of ["createOpening(", "createTradeUp(", "saveXperienceState(", "withStorageTransaction(", "setInterval(", ".setItem(", ".removeItem("]) assert.ok(!source.includes(forbidden), forbidden);
  assert.ok(source.includes('postMessage({ type: "invalidate" })'));
  assert.ok(source.includes("mutationController.current?.abort()"));
  assert.ok(source.includes("channel.current?.close()"));
  assert.ok(source.includes('activeOpening.current = token;'));
  assert.ok(source.includes('activeOpening.current = reply.result.id;'));
  assert.ok(source.includes("connectionController.current.abort();"), "a pre-command GET cannot recover a later uncertain mutation failure");
  assert.ok(source.includes("queueMicrotask(() => { void retryBackend(); });"), "invalidations during a pending read receive a follow-up read");
});
