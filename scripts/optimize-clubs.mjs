import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const input = new URL("design/source/clubs/", root);
const output = new URL("public/assets/clubs/", root);
await mkdir(output, { recursive: true });
const requested = process.argv[2];
const files = (await readdir(input)).filter(name => name.endsWith(".png") && (!requested || name === requested + ".png"));
for (const name of files) {
  await sharp(fileURLToPath(new URL(name, input))).resize(384, 384, { fit: "contain", background: "#00000000" })
    .webp({ quality: 86, alphaQuality: 95, effort: 5 }).toFile(fileURLToPath(new URL(name.replace(".png", ".webp"), output)));
}
console.log("Optimized " + files.length + " club emblems.");
