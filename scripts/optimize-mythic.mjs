import sharp from "sharp";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const source = fileURLToPath(new URL("../design/source/mythic-prism-halo.png", import.meta.url));
const output = fileURLToPath(new URL("../public/assets/mythic-prism-halo.webp", import.meta.url));
await sharp(source).resize(640, 640, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 87, alphaQuality: 95, effort: 6 }).toFile(output);
const metadata = await sharp(output).metadata();
console.log(JSON.stringify({ before: (await stat(source)).size, after: (await stat(output)).size,
  width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha }));
