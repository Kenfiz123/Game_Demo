import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
await mkdir(new URL("public/assets/", root), { recursive: true });
for (const [name, width] of [["chest-premium", 1000], ["orbit-observatory", 1200]]) {
  const source = fileURLToPath(new URL("design/source/" + name + ".png", root));
  const output = fileURLToPath(new URL("public/assets/" + name + ".webp", root));
  const metadata = await sharp(source).metadata();
  await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 85, effort: 6 }).toFile(output);
  const before = (await stat(source)).size, after = (await stat(output)).size;
  console.log(name + ": " + metadata.width + "x" + metadata.height + ", alpha=" + metadata.hasAlpha +
    ", " + before + " → " + after + " bytes (" + (100 - after / before * 100).toFixed(1) + "% smaller)");
}
