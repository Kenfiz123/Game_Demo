// Post-process one built-in ImageGen output; this script never calls a generation API.
import { readFile, copyFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const root = new URL("../", import.meta.url);
const [id, generated] = process.argv.slice(2);
const specs = JSON.parse(await readFile(new URL("design/season-s1-prompts.json", root), "utf8"));
const spec = specs.find(s => s.id === id);
if (!spec || !generated || !generated.endsWith(".png")) throw Error("Expected a manifest ID and generated PNG path");
const source = new URL(spec.source, root), asset = new URL(spec.asset, root);
await mkdir(new URL("./", source), {recursive:true});
await copyFile(generated, source, constants.COPYFILE_EXCL);
await appendFile(new URL("design/season-s1-generation.jsonl", root), JSON.stringify({id,generated,source:spec.source,mode:"built-in image_gen"}) + "\n");
const scaled = await sharp(fileURLToPath(source)).resize(464,464,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).extend({top:24,bottom:24,left:24,right:24,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
let output;
for (const quality of [84,80,76,72,68]) {
  const bytes = await sharp(scaled).webp({quality,alphaQuality:95,effort:6}).toBuffer();
  if (bytes.length <= 140 * 1024) { output = bytes; break; }
}
if (!output) throw Error("Avatar exceeds the 140KiB budget: " + id);
await mkdir(new URL("./", asset), {recursive:true}); await writeFile(asset, output);
console.log(JSON.stringify({id,source:spec.source,asset:spec.asset,bytes:output.length}));
