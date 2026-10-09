import sharp from "sharp";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const byteBudget = 140 * 1024;
const qualities = [82, 78, 74, 70, 66];
const args = process.argv.slice(2);
let requestedIds;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help") {
    console.log("Usage: npm run assets:mythic-clubs [-- --ids club-id,other-club-id]\nNo --ids: validate and export all 73 sources; any missing source fails before writing.\n--ids: export only named clubs after validating the complete manifest; all selected sources are required.");
    process.exit(0);
  }
  if (arg === "--ids" || arg.startsWith("--ids=")) {
    if (requestedIds !== undefined) throw new Error("Pass --ids only once");
    const value = arg === "--ids" ? args[++index] : arg.slice("--ids=".length);
    if (!value || value.startsWith("--")) throw new Error("--ids requires comma-separated club IDs");
    requestedIds = value.split(",").map(id => id.trim());
    if (requestedIds.some(id => !/^[a-z][a-z0-9-]*$/.test(id))) throw new Error("Invalid club ID in --ids");
    if (new Set(requestedIds).size !== requestedIds.length) throw new Error("Duplicate club ID in --ids");
  } else {
    throw new Error("Unknown argument: " + arg);
  }
}

const [clubs, prompts] = await Promise.all([
  readFile(new URL("src/data/clubs.json", root), "utf8").then(JSON.parse),
  readFile(new URL("design/mythic-club-prompts.json", root), "utf8").then(JSON.parse),
]);
if (!Array.isArray(clubs) || clubs.length !== 73 || !Array.isArray(prompts) || prompts.length !== 73) {
  throw new Error("The source club list and Mythic prompt manifest must each contain exactly 73 clubs");
}
const clubsById = new Map(clubs.map(club => [club.id, club]));
if (clubsById.size !== 73) throw new Error("Source club IDs must be unique");
const ids = new Set(), subjects = new Set(), sources = new Set(), assets = new Set();
for (const spec of prompts) {
  if (!spec || typeof spec.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(spec.id) || !clubsById.has(spec.id)) {
    throw new Error("Manifest contains an unknown or invalid club ID");
  }
  if (spec.club !== clubsById.get(spec.id).name || spec.mode !== "built-in image_gen" ||
      typeof spec.subject !== "string" || !spec.subject.trim() || typeof spec.prompt !== "string" || !spec.prompt.trim()) {
    throw new Error(spec.id + ": incorrect club identity or missing built-in ImageGen brief");
  }
  // Exact allowlisted destinations prevent --ids or a malformed manifest escaping the project.
  if (spec.source !== "design/source/mythic-clubs/" + spec.id + ".png" ||
      spec.asset !== "public/assets/mythic-clubs/" + spec.id + ".webp") {
    throw new Error(spec.id + ": source and asset paths must use their exact per-club destinations");
  }
  const subject = spec.subject.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  if (ids.has(spec.id) || subjects.has(subject) || sources.has(spec.source) || assets.has(spec.asset)) {
    throw new Error(spec.id + ": duplicate identity, subject, source or destination");
  }
  ids.add(spec.id); subjects.add(subject); sources.add(spec.source); assets.add(spec.asset);
}
if (requestedIds?.some(id => !ids.has(id))) throw new Error("--ids contains a club absent from the manifest");
const selected = requestedIds ? prompts.filter(spec => requestedIds.includes(spec.id)) : prompts;
const missing = [];
await Promise.all(selected.map(async spec => {
  try { await access(new URL(spec.source, root)); }
  catch { missing.push(spec.id); }
}));
if (missing.length) throw new Error("Missing generated PNG sources; no assets written: " + missing.sort().join(", "));

const sourceHashes = new Set();
for (const spec of selected) {
  const hash = createHash("sha256").update(await readFile(new URL(spec.source, root))).digest("hex");
  if (sourceHashes.has(hash)) throw new Error(spec.id + ": duplicate generated PNG; create distinct club art before exporting");
  sourceHashes.add(hash);
}

await mkdir(new URL("public/assets/mythic-clubs/", root), { recursive: true });
for (const spec of selected) {
  const source = fileURLToPath(new URL(spec.source, root));
  const output = fileURLToPath(new URL(spec.asset, root));
  const [sourceMetadata, sourceStats] = await Promise.all([sharp(source).metadata(), sharp(source).stats()]);
  const sourceAlpha = sourceStats.channels[3];
  if (sourceMetadata.format !== "png" || !sourceMetadata.hasAlpha ||
      !sourceMetadata.width || sourceMetadata.width < 512 || !sourceMetadata.height || sourceMetadata.height < 512 ||
      !sourceAlpha || sourceAlpha.min !== 0 || sourceAlpha.max < 200 || sourceAlpha.mean <= 255 * .05 || sourceAlpha.mean >= 255) {
    throw new Error(spec.id + ": PNG must contain genuinely transparent margins and substantial visible artwork at least 512px per edge");
  }
  // Resize the full silhouette without cropping or manufacturing alpha for an opaque source.
  const scaled = await sharp(source).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let encoded, chosenQuality;
  for (const quality of qualities) {
    const candidate = await sharp(scaled).webp({ quality, alphaQuality: 95, effort: 6 }).toBuffer();
    if (candidate.length < byteBudget) { encoded = candidate; chosenQuality = quality; break; }
  }
  if (!encoded) throw new Error(spec.id + ": cannot meet 140 KiB budget at quality 66 or better; inspect the source instead of degrading further");
  const [metadata, stats] = await Promise.all([sharp(encoded).metadata(), sharp(encoded).stats()]);
  const alpha = stats.channels[3];
  if (metadata.width !== 512 || metadata.height !== 512 || !metadata.hasAlpha || !alpha ||
      alpha.min !== 0 || alpha.max < 200 || alpha.mean <= 255 * .05 || alpha.mean >= 255) {
    throw new Error(spec.id + ": export lost transparency or adequate visible artwork");
  }
  // Preserve an existing complete export if encoding fails; replace only this named derivative atomically.
  const staging = output + ".tmp-" + process.pid;
  await writeFile(staging, encoded);
  await rename(staging, output);
  console.log(JSON.stringify({ id: spec.id, bytes: encoded.length, quality: chosenQuality, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }));
}
console.log("Exported " + selected.length + (requestedIds ? " selected" : " of 73") + " distinct Mythic club crests.");
