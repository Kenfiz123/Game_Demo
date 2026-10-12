import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUBS } from "../src/data/clubs";
import { COSMETICS } from "../src/data/cosmetics";
import { collectorProfileEditorKey, deriveClubCollection, filterClubCollection, getCollectorClubItems, normalizeCollectorBio, selectFeaturedMythics } from "../src/lib/collectorCatalog";

test("collector ledger has exactly 73 independent CLB sets, each with 13 items and 8 Mythics", () => {
  const rows = deriveClubCollection([], []);
  assert.equal(rows.length, 73);
  assert.equal(new Set(rows.map(row => row.club.id)).size, 73);
  assert.equal(rows.flatMap(row => row.items).length, COSMETICS.length);
  for (const row of rows) {
    assert.equal(row.items.length, 13);
    assert.equal(row.items.filter(item => item.rarity === "MYTHIC").length, 8);
    assert.equal(row.discovered, 0); assert.equal(row.owned, 0); assert.equal(row.complete, false);
    assert.ok(row.items.every(item => item.clubId === row.club.id));
  }
  assert.deepEqual(getCollectorClubItems("retired-club"), []);
});

test("duplicate copies and unknown IDs never inflate discovery or owned-pattern progress", () => {
  const club = CLUBS[0], first = getCollectorClubItems(club.id)[0];
  const row = deriveClubCollection([first.id, first.id, "missing"], [first.id, first.id, first.id, "missing"]).find(row => row.club.id === club.id)!;
  assert.equal(row.discovered, 1); assert.equal(row.owned, 1); assert.equal(row.ownedCopies, 3);
  assert.equal(row.complete, false);
});

test("lifetime discovery remains complete after every owned copy has left the inventory", () => {
  const ids = COSMETICS.map(item => item.id), rows = deriveClubCollection([...ids, ...ids, "unknown"], []);
  assert.equal(rows.filter(row => row.complete).length, CLUBS.length);
  for (const row of rows) { assert.equal(row.discovered, row.items.length); assert.equal(row.owned, 0); assert.equal(row.ownedCopies, 0); assert.equal(row.mythicsDiscovered, 8); }
});

test("current copies alone do not pretend to be recorded lifetime discoveries", () => {
  const rows = deriveClubCollection([], COSMETICS.map(item => item.id));
  assert.equal(rows.filter(row => row.complete).length, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.discovered, 0), 0);
  assert.equal(rows.reduce((sum, row) => sum + row.owned, 0), COSMETICS.length);
});

test("ledger filters combine accent-insensitive terms, campus, group and true completion", () => {
  const club = CLUBS.find(club => club.id === "football-team-hn")!;
  const rows = deriveClubCollection(getCollectorClubItems(club.id).map(item => item.id), []);
  const match = filterClubCollection(rows, { query: "doi tuyen bong da", campus: "Hà Nội", group: club.group, completion: "complete" });
  assert.deepEqual(match.map(row => row.club.id), [club.id]);
  assert.deepEqual(filterClubCollection(rows, { query: "doi tuyen bong da", campus: "Đà Nẵng", group: "", completion: "all" }), []);
  assert.equal(filterClubCollection(rows, { query: "", campus: "", group: "", completion: "incomplete" }).length, CLUBS.length - 1);
});

test("featured selection rejects unowned, non-Mythic, unknown and repeated IDs with a three-item cap", () => {
  const mythics = COSMETICS.filter(item => item.rarity === "MYTHIC").slice(0, 5), common = COSMETICS.find(item => item.rarity === "COMMON")!;
  const selection = ["unknown", common.id, mythics[0].id, mythics[0].id, mythics[1].id, mythics[2].id, mythics[3].id, mythics[4].id];
  assert.deepEqual(selectFeaturedMythics(selection, mythics.slice(1).map(item => item.id)).map(item => item.id), mythics.slice(1, 4).map(item => item.id));
  assert.deepEqual(selectFeaturedMythics(selection, []), []);
  assert.deepEqual(selectFeaturedMythics(selection).map(item => item.id), mythics.slice(0, 3).map(item => item.id));
});

test("bio normalization removes Unicode control and format characters while retaining Vietnamese", () => {
  assert.equal(normalizeCollectorBio("Bảo\u200bvật\nMythic\u202e\u0000"), "Bảo vật Mythic  ");
  assert.equal(normalizeCollectorBio("Truyền nhân của tôi"), "Truyền nhân của tôi");
  assert.equal(normalizeCollectorBio("x".repeat(200)).length, 180);
});

test("editor keys isolate anonymous and authenticated drafts by exact player identity", () => {
  assert.notEqual(collectorProfileEditorKey("guest-one"), collectorProfileEditorKey("guest-two"));
  assert.notEqual(collectorProfileEditorKey("player-one", "ken"), collectorProfileEditorKey("player-two", "ken"));
  assert.notEqual(collectorProfileEditorKey("player-one"), collectorProfileEditorKey("player-one", "ken"));
});
