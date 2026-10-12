import sharp from "sharp";
import { readFile, writeFile, mkdir, access, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const specs = JSON.parse(await readFile(new URL("design/season-s1-prompts.json", root), "utf8"));
const clubs = JSON.parse(await readFile(new URL("src/data/clubs.json", root), "utf8"));
const availableOnly = process.argv.slice(2).length === 1 && process.argv[2] === "--available";
if (process.argv.length > 2 && !availableOnly) throw Error("Usage: node scripts/optimize-season-s1.mjs [--available]");
const expected = new Set(clubs.flatMap(club => ["LEGENDARY", "MYTHIC"].map(rarity => `season-s1-${club.id}-${rarity.toLowerCase()}-avatar`)));
if (specs.length !== 146 || new Set(specs.map(s => s.id)).size !== 146) throw Error("S1 requires 146 unique avatar briefs");
for (const s of specs) {
  if (!expected.has(s.id) || !clubs.some(c => c.id === s.clubId && c.name === s.club) || !["LEGENDARY", "MYTHIC"].includes(s.rarity) || s.mode !== "built-in image_gen" || !s.prompt ||
    s.source !== `design/source/seasons/s1/${s.rarity.toLowerCase()}/${s.clubId}.png` || s.asset !== `public/assets/seasons/s1/${s.rarity.toLowerCase()}/${s.clubId}.webp`) throw Error("Invalid S1 brief: " + s.id);
}
const selected = [], missing = [];
for (const spec of specs) { try { await access(new URL(spec.source, root)); selected.push(spec); } catch { missing.push(spec.id); } }
if (missing.length && !availableOnly) throw Error("Missing originals; export cancelled: " + missing.join(", "));
const hashes = new Set();
let total = 0;
for (const s of selected) {
  const source = fileURLToPath(new URL(s.source, root));
  const [meta, stats] = await Promise.all([sharp(source).metadata(), sharp(source).stats()]);
  const alpha = stats.channels[3];
  if (meta.format !== "png" || !meta.hasAlpha || meta.width < 512 || meta.height < 512 || !alpha || alpha.min !== 0 || alpha.max < 200 || alpha.mean < 255 * .05 || alpha.mean >= 255) throw Error("Invalid source alpha/size: " + s.id);
  const decoded = await sharp(source).ensureAlpha().raw().toBuffer();
  const hash = createHash("sha256").update(decoded).digest("hex");
  if (hashes.has(hash)) throw Error("Duplicate artwork: " + s.id); hashes.add(hash);
  // Preserve the full generated silhouette and add transparent crop-safe margins.
  const scaled = await sharp(source).resize(464, 464, {fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).extend({top:24,bottom:24,left:24,right:24,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  let output;
  for (const quality of [84,80,76,72,68]) {
    const bytes = await sharp(scaled).webp({quality,alphaQuality:95,effort:6}).toBuffer();
    if (bytes.length <= 140 * 1024) { output = bytes; break; }
  }
  if (!output) throw Error("S1 artwork exceeds 140KiB: " + s.id);
  const dest = new URL(s.asset, root);
  await mkdir(new URL("./", dest), {recursive:true});
  const staging = fileURLToPath(dest) + ".tmp-" + process.pid;
  await writeFile(staging, output); await rename(staging, fileURLToPath(dest)); total += output.length;
}
console.log(JSON.stringify({exported:selected.length,missing:missing.length,totalBytes:total,size:"512x512",alpha:true}));
