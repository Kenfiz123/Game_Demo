import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const source = fileURLToPath(new URL("design/source/mythic-finishes/regalia-v5.png", root));
const output = fileURLToPath(new URL("public/assets/mythic-finishes/regalia-v5.webp", root));
await mkdir(new URL("public/assets/mythic-finishes/", root), { recursive: true });
// Preserve generated alpha; the transparent gutter protects crown tips at every size.
await sharp(source)
  .resize({ width: 608, height: 608, fit: "contain", background: "#00000000", withoutEnlargement: true })
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#00000000" })
  .webp({ quality: 88, alphaQuality: 100, effort: 6 })
  .toFile(output);
const metadata = await sharp(output).metadata();
const bytes = (await stat(output)).size;
if (!metadata.hasAlpha || metadata.width !== 640 || metadata.height !== 640) {
  throw new Error("REGALIA must remain a 640 × 640 transparent frame");
}
if (bytes > 200_000) throw new Error("REGALIA exceeds the 200 KB asset budget");
console.log(JSON.stringify({ asset: "regalia-v5.webp", bytes, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }));
