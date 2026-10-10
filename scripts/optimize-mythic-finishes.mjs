import sharp from "sharp";
import { mkdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const { prompts } = JSON.parse(await readFile(new URL("design/mythic-finish-prompts.json", root), "utf8"));
await mkdir(new URL("public/assets/mythic-finishes/", root), { recursive: true });
for (const { variant } of prompts) {
  const source = fileURLToPath(new URL(`design/source/mythic-finishes/${variant}-v3.png`, root));
  const output = fileURLToPath(new URL(`public/assets/mythic-finishes/${variant}-v3.webp`, root));
  // A transparent export gutter preserves fine tips and avoids edge alpha from resampling.
  await sharp(source).resize({ width: 608, height: 608, fit: "contain", background: "#00000000", withoutEnlargement: true })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#00000000" })
    .webp({ quality: 86, alphaQuality: 95, effort: 6 }).toFile(output);
  const metadata = await sharp(output).metadata();
  if (!metadata.hasAlpha) throw new Error(variant + ": transparent art required");
  const size = (await stat(output)).size;
  if (size > 200_000) throw new Error(variant + ": exceeds 200 KB asset budget");
  console.log(JSON.stringify({ variant, sourceBytes: (await stat(source)).size, bytes: size, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }));
}
