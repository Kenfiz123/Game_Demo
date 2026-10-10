import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUBS } from "../src/data/clubs";
import { CLUB_COSMETICS, getClubMythics } from "../src/data/clubCosmetics";
import { cosmeticsByRarity, getCosmeticById } from "../src/data/cosmetics";
import { getMythicImage } from "../src/data/mythicCatalog";

test("each of the 73 clubs has obtainable Mythic avatars and a Legacy achievement with independent IDs and its private crest", context => {
  assert.equal(CLUBS.length, 73);
  assert.equal(new Set(CLUB_COSMETICS.map(item => item.id)).size, CLUB_COSMETICS.length, "avatar and achievement IDs must never collide with any catalog item");
  const obtainable = new Set(cosmeticsByRarity("MYTHIC").map(item => item.id));
  const checkedIds = new Set<string>();
  const privateCrests = new Set<string>();
  let avatarCount = 0, achievementCount = 0;

  for (const club of CLUBS) {
    const mythics = getClubMythics(club.id);
    const avatars = mythics.filter(item => item.type === "AVATAR");
    const achievements = mythics.filter(item => item.type === "TITLE" && item.mythicVariant === "LEGACY");
    assert.ok(avatars.length >= 1, club.id + " must have a Mythic avatar, not only effects or lower-tier previews");
    assert.ok(achievements.length >= 1, club.id + " must have a Mythic Legacy achievement");
    assert.ok(achievements.some(item => item.id === "club-" + club.id + "-mythic-title"), "preserve " + club.id + " saved achievement identity");

    const crest = getMythicImage(club);
    assert.equal(crest, "/assets/mythic-clubs/" + club.id + ".webp");
    assert.notEqual(crest, club.image, club.id + " must not reuse ordinary club art");
    assert.equal(privateCrests.has(crest), false, club.id + " must not borrow another club's Mythic crest");
    privateCrests.add(crest);

    for (const item of [...avatars, ...achievements]) {
      assert.equal(item.clubId, club.id, item.id);
      assert.equal(item.rarity, "MYTHIC", item.id);
      assert.equal(item.image, crest, item.id + " must retain its own club identity");
      assert.equal(checkedIds.has(item.id), false, item.id + " must have an independent inventory identity");
      checkedIds.add(item.id);
      assert.ok(obtainable.has(item.id), item.id + " must exist in the actual chest reward pool");
      assert.equal(getCosmeticById(item.id), item, item.id + " must resolve to the same catalog item");
    }
    avatarCount += avatars.length;
    achievementCount += achievements.length;
  }

  assert.equal(privateCrests.size, CLUBS.length);
  context.diagnostic("Verified " + CLUBS.length + " clubs: " + avatarCount + " Mythic avatars, " + achievementCount + " Legacy achievements, " + privateCrests.size + " private crests.");
});
