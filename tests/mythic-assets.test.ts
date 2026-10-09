import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { CLUBS } from "../src/data/clubs";
import { MYTHIC_THEMES, getMythicImage } from "../src/data/mythicCatalog";

interface RoyalPrompt { id: string; label: string; prompt: string; mode: string; source: string; asset: string; }
interface ClubMythicPrompt { id: string; club: string; subject: string; prompt: string; mode: string; source: string; asset: string; }
const loadPrompts = async () => JSON.parse(await readFile(new URL("../design/mythic-royal-prompts.json", import.meta.url), "utf8")) as RoyalPrompt[];
const loadClubPrompts = async () => JSON.parse(await readFile(new URL("../design/mythic-club-prompts.json", import.meta.url), "utf8")) as ClubMythicPrompt[];
const root = new URL("../", import.meta.url);

test("royal ImageGen prompt manifest contains twelve distinct guild themes, the mystery vault and phoenix mantle", async () => {
  const prompts = await loadPrompts();
  assert.equal(prompts.length, 14);
  assert.deepEqual(prompts.map(spec => spec.id), [...MYTHIC_THEMES, "vault", "phoenix-mantle"]);
  for (const key of ["id", "source", "asset", "prompt"] as const) assert.equal(new Set(prompts.map(spec => spec[key])).size, 14, key + " must be unique for every generated asset");
  for (const spec of prompts) {
    assert.equal(spec.mode, "built-in image_gen", spec.id);
    assert.equal(spec.source, "design/source/mythic-royal/" + spec.id + ".png");
    assert.equal(spec.asset, "public/assets/mythic/" + spec.id + ".webp");
    assert.ok(spec.label.length > 0 && spec.prompt.toLowerCase().includes("transparent"), spec.id);
  }
});

test("all fourteen royal WebPs have transparent margins, visible artwork, 512px dimensions and stay below 140 KiB", async () => {
  const prompts = await loadPrompts();
  await Promise.all(prompts.map(async spec => {
    const asset = fileURLToPath(new URL(spec.asset, root));
    const source = fileURLToPath(new URL(spec.source, root));
    await access(source);
    const [metadata, stats, size, sourceMetadata] = await Promise.all([
      sharp(asset).metadata(), sharp(asset).stats(), stat(asset), sharp(source).metadata(),
    ]);
    assert.equal(metadata.format, "webp", spec.id);
    assert.equal(metadata.width, 512, spec.id);
    assert.equal(metadata.height, 512, spec.id);
    assert.equal(metadata.hasAlpha, true, spec.id);
    assert.ok(size.size < 140 * 1024, spec.id + " must remain below 140 KiB, got " + size.size);
    const alpha = stats.channels[3];
    assert.ok(alpha && alpha.min === 0 && alpha.max > 0 && alpha.mean < 255, spec.id + " needs genuinely transparent margins and non-empty artwork");
    assert.equal(sourceMetadata.format, "png", spec.id + " must retain its generated PNG source");
    assert.equal(sourceMetadata.hasAlpha, true, spec.id + " generated source must retain transparency");
  }));
});

test("all fourteen royal image files and PNG sources are distinct, not duplicate copies of one guild emblem", async () => {
  const prompts = await loadPrompts();
  const hashes = await Promise.all(prompts.map(async spec => {
    const [asset, source] = await Promise.all([readFile(new URL(spec.asset, root)), readFile(new URL(spec.source, root))]);
    return {
      asset: createHash("sha256").update(asset).digest("hex"),
      source: createHash("sha256").update(source).digest("hex"),
    };
  }));
  assert.equal(new Set(hashes.map(hash => hash.asset)).size, 14);
  assert.equal(new Set(hashes.map(hash => hash.source)).size, 14);
});

test("the phoenix mantle leaves its exact center genuinely transparent so the club crest remains visible", async () => {
  const prompts = await loadPrompts();
  const spec = prompts.find(candidate => candidate.id === "phoenix-mantle");
  assert.ok(spec);
  const asset = fileURLToPath(new URL(spec.asset, root));
  const center = await sharp(asset).extract({ left: 256, top: 256, width: 1, height: 1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(center.info.channels, 4);
  assert.equal(center.data[3], 0, "phoenix wings must frame, not cover, the equipped club artwork");
});

test("every source club has a unique ImageGen Mythic brief, subject and exact per-club image path", async () => {
  const prompts = await loadClubPrompts();
  assert.equal(prompts.length, 73);
  assert.deepEqual(prompts.map(spec => spec.id).sort(), CLUBS.map(club => club.id).sort());
  for (const key of ["id", "source", "asset", "prompt"] as const) assert.equal(new Set(prompts.map(spec => spec[key])).size, 73, key + " must be unique for all clubs");
  const subjects = prompts.map(spec => spec.subject.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " "));
  assert.equal(new Set(subjects).size, 73, "each CLB needs its own hero subject, not a shared group emblem");
  const byId = new Map(prompts.map(spec => [spec.id, spec]));
  for (const club of CLUBS) {
    const spec = byId.get(club.id);
    assert.ok(spec);
    assert.equal(spec.club, club.name);
    assert.ok(spec.subject.trim().length > 0);
    assert.equal(spec.mode, "built-in image_gen");
    assert.ok(spec.prompt.toLowerCase().includes("transparent"));
    assert.equal(spec.source, "design/source/mythic-clubs/" + club.id + ".png");
    assert.equal(spec.asset, "public/assets/mythic-clubs/" + club.id + ".webp");
    assert.equal(getMythicImage(club), "/assets/mythic-clubs/" + club.id + ".webp");
    assert.notEqual(getMythicImage(club), club.image);
  }
  assert.equal(new Set(CLUBS.map(getMythicImage)).size, 73, "the runtime must not collapse clubs back to the twelve guild images");
});

test("all 73 individual Mythic crests retain genuine alpha, substantial visible art, 512px dimensions and the 140 KiB budget", async () => {
  const prompts = await loadClubPrompts();
  assert.equal(prompts.length, 73);
  await Promise.all(prompts.map(async spec => {
    const asset = fileURLToPath(new URL(spec.asset, root));
    const source = fileURLToPath(new URL(spec.source, root));
    const [metadata, stats, size, sourceMetadata, sourceStats] = await Promise.all([
      sharp(asset).metadata(), sharp(asset).stats(), stat(asset), sharp(source).metadata(), sharp(source).stats(),
    ]);
    assert.equal(metadata.format, "webp", spec.id);
    assert.equal(metadata.width, 512, spec.id); assert.equal(metadata.height, 512, spec.id);
    assert.equal(metadata.hasAlpha, true, spec.id);
    assert.ok(size.size < 140 * 1024, spec.id + " exceeds the image budget: " + size.size);
    const alpha = stats.channels[3];
    assert.ok(alpha && alpha.min === 0 && alpha.max >= 200 && alpha.mean > 255 * .05 && alpha.mean < 255, spec.id + " must have clear margins and meaningful visible artwork, not an empty/faint placeholder");
    assert.equal(sourceMetadata.format, "png", spec.id);
    assert.equal(sourceMetadata.hasAlpha, true, spec.id);
    const sourceAlpha = sourceStats.channels[3];
    assert.ok(sourceAlpha && sourceAlpha.min === 0 && sourceAlpha.max >= 200 && sourceAlpha.mean > 255 * .05 && sourceAlpha.mean < 255, spec.id + " transparency must come from its generated source");
  }));
});

test("all 73 Mythic PNGs and WebPs are unique and do not copy any ordinary club artwork", async () => {
  const prompts = await loadClubPrompts();
  const fingerprint = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const newHashes = await Promise.all(prompts.map(async spec => {
    const [asset, source] = await Promise.all([readFile(new URL(spec.asset, root)), readFile(new URL(spec.source, root))]);
    return { asset: fingerprint(asset), source: fingerprint(source) };
  }));
  assert.equal(new Set(newHashes.map(hash => hash.asset)).size, 73);
  assert.equal(new Set(newHashes.map(hash => hash.source)).size, 73);
  const ordinaryHashes = await Promise.all(CLUBS.map(async club => {
    const [asset, source] = await Promise.all([
      readFile(new URL("public" + club.image, root)),
      readFile(new URL("design/source/clubs/" + club.id + ".png", root)),
    ]);
    return { asset: fingerprint(asset), source: fingerprint(source) };
  }));
  const ordinaryAssets = new Set(ordinaryHashes.map(hash => hash.asset)), ordinarySources = new Set(ordinaryHashes.map(hash => hash.source));
  assert.equal(ordinaryAssets.size, 73, "the 73 ordinary club WebPs must also retain distinct artwork, not duplicate files under different names");
  for (const [index, hash] of newHashes.entries()) {
    assert.equal(ordinaryAssets.has(hash.asset), false, prompts[index].id + " must not copy an ordinary WebP");
    assert.equal(ordinarySources.has(hash.source), false, prompts[index].id + " must not copy an ordinary PNG source");
  }
});

test("Mythic source artwork remains distinct after decoding, not merely renamed/re-encoded lower-tier or shared-guild images", async () => {
  const [prompts, royalPrompts] = await Promise.all([loadClubPrompts(), loadPrompts()]);
  const decodedFingerprint = async (path: string) => {
    const pixels = await sharp(fileURLToPath(new URL(path, root)))
      .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
    return createHash("sha256").update(pixels).digest("hex");
  };
  const [newHashes, previousHashes] = await Promise.all([
    Promise.all(prompts.map(spec => decodedFingerprint(spec.source))),
    Promise.all([...CLUBS.map(club => "design/source/clubs/" + club.id + ".png"), ...royalPrompts.map(spec => spec.source)].map(decodedFingerprint)),
  ]);
  assert.equal(new Set(newHashes).size, 73, "decoded artwork must be unique for each CLB");
  const previous = new Set(previousHashes);
  for (const [index, hash] of newHashes.entries()) assert.equal(previous.has(hash), false, prompts[index].id + " must be newly generated rather than reuse old art with different metadata");
});
