import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CLUBS } from "../src/data/clubs";
import { SEASON_AVATARS, SEASON_MISSIONS, emptySeason } from "../src/data/seasonCatalog";
import { cosmeticsByRarity, getCosmeticById } from "../src/data/cosmetics";
import { economyDay } from "../src/data/eventEconomy";
import { XperienceStore } from "../src/lib/server/store";
import { SeasonStore } from "../src/lib/server/seasonStore";
import { validateCommand } from "../src/lib/server/validation";
import { isSeasonProgress } from "../src/lib/seasonValidation";
import { getEquipSlot } from "../src/lib/equipmentEngine";
import { deriveClubCollection, getCollectorClubItems } from "../src/lib/collectorCatalog";
import type { BackendCommand } from "../src/types/backend";

function harness() {
  const directory = mkdtempSync(join(tmpdir(), "season-s1-")), path = join(directory, "test.sqlite");
  let now = Date.parse("2026-10-12T08:00:00Z");
  let store = new XperienceStore(path, { now: () => now, random: () => 0 });
  const guest = store.bootstrapSession(); assert.ok(guest.token);
  const player = guest.snapshot.player.id, token = guest.token;
  const command = (value: BackendCommand, key = randomUUID()) => store.execute(token, key, value, player);
  const db = <T>(fn: (database: DatabaseSync) => T) => { const connection = new DatabaseSync(path); try { return fn(connection); } finally { connection.close(); } };
  const earnDay = () => {
    for (let i = 0; i < 10; i++) assert.ok(command({ type: "play", game: "chest" }).result.success);
    const common = cosmeticsByRarity("COMMON")[0].id;
    assert.ok(command({ type: "trade-up", itemIds: Array(5).fill(common) }).result.success);
    for (const mission of SEASON_MISSIONS) assert.ok(command({ type: "claim-season-mission", missionId: mission.id, day: economyDay(now) }).result.success);
  };
  return { get store() { return store; }, token, player, command, earnDay, db, nextDay: () => { now += 86_400_000; },
    reopen: (mutate?: () => void) => { store.close(); mutate?.(); store = new XperienceStore(path, { now: () => now, random: () => 0 }); },
    cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("S1 has 146 distinct avatars, both tiers equip, regular RNG and permanent CLB sets stay unchanged", () => {
  assert.equal(SEASON_AVATARS.length, 146); assert.equal(new Set(SEASON_AVATARS.map(i => i.id)).size, 146);
  assert.equal(new Set(SEASON_AVATARS.map(i => i.image)).size, 146);
  for (const club of CLUBS) {
    assert.deepEqual(SEASON_AVATARS.filter(i => i.clubId === club.id).map(i => i.rarity), ["LEGENDARY", "MYTHIC"]);
    assert.equal(getCollectorClubItems(club.id).length, 13);
  }
  for (const item of SEASON_AVATARS) {
    assert.equal(getCosmeticById(item.id), item); assert.equal(getEquipSlot(item), "AVATAR");
    assert.equal(cosmeticsByRarity(item.rarity).includes(item), false);
  }
  assert.equal(cosmeticsByRarity("LEGENDARY").length, 73); assert.equal(cosmeticsByRarity("MYTHIC").length, 584);
  assert.equal(deriveClubCollection(SEASON_AVATARS.map(i => i.id), SEASON_AVATARS.map(i => i.id)).reduce((n, row) => n + row.discovered + row.owned, 0), 0);
});

test("mission claims require authoritative progress, reject old-day UI, award once, and replay does not award again", () => {
  const h = harness(); try {
    const initial = h.store.getSnapshot(h.token)!;
    assert.equal(h.command({ type: "claim-season-mission", missionId: "three-chests", day: initial.season!.day }).result.success, false);
    const key = randomUUID(), value = { type: "claim-season-mission", missionId: "visit", day: initial.season!.day } as const;
    const first = h.command(value, key), repeated = h.command(value, key);
    assert.deepEqual(first, repeated); assert.equal(first.snapshot.season!.points, 1);
    assert.equal(h.command(value).result.success, false);
    h.nextDay();
    const stale = h.command(value);
    assert.equal(stale.result.success, false); assert.equal(stale.result.reason, "SEASON_DAY_CHANGED");
    assert.equal(stale.snapshot.season!.points, 1); assert.deepEqual(stale.snapshot.season!.claimedMissionIds, []);
    assert.ok(h.command({ ...value, day: stale.snapshot.season!.day }).result.success);
    assert.equal(h.store.getSnapshot(h.token)!.season!.points, 2);
    assert.equal(h.store.getSnapshot(h.token)!.economy!.coinBalance, 0);
  } finally { h.cleanup(); }
});

test("a midnight boundary cannot credit yesterday's chest or trade progress to today's missions", () => {
  const h = harness(); try {
    h.earnDay();
    const yesterday = h.store.getSnapshot(h.token)!.economy!;
    h.nextDay();
    const day = h.store.getSnapshot(h.token)!.season!.day;
    h.db(connection => {
      const seasons = new SeasonStore(connection, () => Date.parse(day + "T08:00:00Z"));
      for (const id of ["three-chests", "ten-chests", "trade"] as const) {
        assert.equal(seasons.claim(h.player, yesterday, id, day).reason, "EVENT_NOT_READY");
      }
    });
    assert.equal(h.store.getSnapshot(h.token)!.season!.points, 8);
  } finally { h.cleanup(); }
});

test("selected Legendary and Mythic reward redemption is persistent, idempotent and owns a season serial", () => {
  const h = harness(); try {
    h.earnDay(); const legendary = SEASON_AVATARS[0], mythic = SEASON_AVATARS[1];
    assert.equal(h.store.getSnapshot(h.token)!.season!.points, 8);
    const key = randomUUID(), value = { type: "redeem-season-avatar", itemId: legendary.id } as const;
    const first = h.command(value, key); assert.ok(first.result.success); assert.deepEqual(h.command(value, key), first);
    assert.equal(first.snapshot.season!.points, 4); assert.equal(first.snapshot.collector!.copies.find(c => c.itemId === legendary.id)!.origin, "SEASON");
    assert.ok(h.command({ type: "equip", itemId: legendary.id }).result.success);
    assert.equal(h.command(value).result.success, false);
    const insufficient = h.command({ type: "redeem-season-avatar", itemId: mythic.id }).result;
    assert.ok("reason" in insufficient);
    assert.equal(insufficient.reason, "INSUFFICIENT_SEASON_POINTS");
    h.nextDay(); h.earnDay();
    const second = h.command({ type: "redeem-season-avatar", itemId: mythic.id }); assert.ok(second.result.success);
    assert.equal(second.snapshot.season!.points, 0); assert.equal(second.snapshot.season!.earnedPoints, 16);
    assert.ok(h.command({ type: "equip", itemId: mythic.id }).result.success);
    const saved = h.store.getSnapshot(h.token)!; h.reopen(); assert.deepEqual(h.store.getSnapshot(h.token), saved);
    const copy = saved.collector!.copies.find(c => c.itemId === mythic.id)!;
    assert.equal(h.store.getItemPassport(h.token, copy.id)!.trail[0].kind, "MINT");
    assert.ok(isSeasonProgress(saved.season));
  } finally { h.cleanup(); }
});

test("season point debit and copy mint roll back together on storage failure", () => {
  const h = harness(); try {
    h.earnDay(); const before = h.store.getSnapshot(h.token)!, key = randomUUID();
    h.db(db => db.exec("CREATE TRIGGER reject_season BEFORE INSERT ON item_copies WHEN NEW.origin = 'SEASON' BEGIN SELECT RAISE(ABORT, 'test mint failure'); END;"));
    const value = { type: "redeem-season-avatar", itemId: SEASON_AVATARS[0].id } as const;
    assert.throws(() => h.command(value, key)); assert.deepEqual(h.store.getSnapshot(h.token), before);
    h.db(db => db.exec("DROP TRIGGER reject_season")); assert.ok(h.command(value, key).result.success);
  } finally { h.cleanup(); }
});

test("v4 to v5 migration preserves serials, escrow, locks, trails and player JSON bytes", () => {
  const h = harness(); try {
    for (let i = 0; i < 2; i++) h.command({ type: "play", game: "chest" });
    const copy = h.store.getSnapshot(h.token)!.collector!.copies[0];
    h.command({ type: "copy-lock", copyId: copy.id, locked: true });
    h.command({ type: "market-list", itemId: copy.itemId, price: 10 });
    const saved = h.db(db => Object.fromEntries(["players", "item_copies", "item_trail", "market_listings", "operations", "collector_discoveries"].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])));
    h.reopen(() => h.db(db => db.exec("DROP TABLE player_seasons; PRAGMA user_version = 4;")));
    h.db(db => {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 5);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      for (const [table, rows] of Object.entries(saved)) assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), rows, table);
    });
    assert.deepEqual(h.store.getSnapshot(h.token)!.season, emptySeason(Date.parse("2026-10-12T08:00:00Z")));
    assert.equal(h.store.getItemPassport(h.token, copy.id)!.copy.locked, true);
  } finally { h.cleanup(); }
});

test("season commands reject client-supplied rewards, unknown IDs, invalid missions and broken balances", () => {
  assert.throws(() => validateCommand({ type: "claim-season-mission", missionId: "visit", day: "2026-10-12", points: 999 }));
  assert.throws(() => validateCommand({ type: "redeem-season-avatar", itemId: "club-ai-hn-logo" }));
  assert.throws(() => validateCommand({ type: "claim-season-mission", missionId: "free-points", day: "2026-10-12" }));
  assert.equal(isSeasonProgress({ ...emptySeason(0), points: 1 }), false);
  assert.equal(isSeasonProgress({ ...emptySeason(0), redeemedItemIds: [SEASON_AVATARS[0].id] }), false);
});
