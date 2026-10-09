import sharp from "sharp";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const source = fileURLToPath(new URL("../design/source/forge-five-slot.png", import.meta.url));
const output = fileURLToPath(new URL("../public/assets/forge-five-slot.webp", import.meta.url));
await sharp(source).resize({width:1000,withoutEnlargement:true}).webp({quality:85,alphaQuality:95,effort:6}).toFile(output);
const m = await sharp(output).metadata();
console.log(JSON.stringify({before:(await stat(source)).size,after:(await stat(output)).size,width:m.width,height:m.height,alpha:m.hasAlpha}));
