import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { SEASON_AVATARS } from "../src/data/seasonCatalog";

test("every S1 avatar has its own generated source and transparent, bounded web asset", async () => {
  const manifest = JSON.parse(await readFile(new URL("../design/season-s1-prompts.json", import.meta.url), "utf8")) as {
    id: string; clubId: string; rarity: string; mode: string; prompt: string; source: string; asset: string;
  }[];
  assert.equal(manifest.length, SEASON_AVATARS.length);
  assert.equal(new Set(manifest.map(spec => spec.id)).size, 146);
  const sourcePixels = new Set<string>(), webPixels = new Set<string>();
  for (const item of SEASON_AVATARS) {
    const spec = manifest.find(entry => entry.id === item.id);
    assert.ok(spec, item.id);
    const tier = item.rarity.toLowerCase();
    assert.equal(spec.clubId, item.clubId);
    assert.equal(spec.rarity, item.rarity);
    assert.equal(spec.mode, "built-in image_gen");
    assert.ok(spec.prompt.includes("One avatar only") || spec.prompt.includes("One complete avatar only"));
    assert.equal(spec.source, `design/source/seasons/s1/${tier}/${item.clubId}.png`);
    assert.equal(spec.asset, `public${item.image}`);
    const source = new URL(`../${spec.source}`, import.meta.url);
    const asset = new URL(`../${spec.asset}`, import.meta.url);
    const original = sharp(await readFile(source));
    const sourceMetadata = await original.metadata();
    assert.equal(sourceMetadata.format, "png", item.id);
    assert.ok(sourceMetadata.hasAlpha && sourceMetadata.width! >= 512 && sourceMetadata.height! >= 512, item.id);
    const originalFingerprint = createHash("sha256").update(await original.ensureAlpha().raw().toBuffer()).digest("hex");
    assert.ok(!sourcePixels.has(originalFingerprint), `Repeated source: ${item.id}`);
    sourcePixels.add(originalFingerprint);
    assert.ok((await stat(asset)).size <= 140 * 1024, `Asset budget exceeded: ${item.id}`);
    const web = sharp(await readFile(asset)), metadata = await web.metadata();
    assert.deepEqual([metadata.format, metadata.width, metadata.height, metadata.hasAlpha], ["webp", 512, 512, true], item.id);
    const decoded = await web.ensureAlpha().raw().toBuffer();
    const alpha = (x: number, y: number) => decoded[(y * 512 + x) * 4 + 3];
    let occupied = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      if (x < 24 || x >= 488 || y < 24 || y >= 488) assert.equal(alpha(x, y), 0, `Clipped gutter: ${item.id}`);
      if (alpha(x, y) >= 200) occupied++;
    }
    assert.ok(occupied > 512 * 512 * .05, `Empty artwork: ${item.id}`);
    const fingerprint = createHash("sha256").update(decoded).digest("hex");
    assert.ok(!webPixels.has(fingerprint), `Repeated web asset: ${item.id}`);
    webPixels.add(fingerprint);
  }
});
