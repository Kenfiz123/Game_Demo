import sharp from "sharp";
import { mkdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const prompts = JSON.parse(await readFile(new URL("design/mythic-royal-prompts.json", root), "utf8"));
await mkdir(new URL("public/assets/mythic/", root), { recursive: true });
for (const spec of prompts) {
  const source = fileURLToPath(new URL(spec.source, root));
  const output = fileURLToPath(new URL(spec.asset, root));
  await sharp(source).resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 95, effort: 6 }).toFile(output);
  const metadata = await sharp(output).metadata();
  if (!metadata.hasAlpha) throw new Error(spec.id + ": missing transparency");
  console.log(JSON.stringify({ id: spec.id, before: (await stat(source)).size, after: (await stat(output)).size, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }));
}
