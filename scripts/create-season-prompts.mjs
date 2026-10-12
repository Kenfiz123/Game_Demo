import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const clubs = JSON.parse(await readFile(new URL("src/data/clubs.json", root), "utf8"));
const ordinary = JSON.parse(await readFile(new URL("design/club-art-prompts.json", root), "utf8"));
const mythics = JSON.parse(await readFile(new URL("design/mythic-club-prompts.json", root), "utf8"));
const firstPrompt = "Use case: stylized-concept. Create ONE new square 1024x1024 collectible avatar for the S1 collection season in FPTU Xperience. Club: CLB Street Workout, Hà Nội. Rarity: LEGENDARY / Huyền thoại. Hero: a powerful original calisthenics athlete in a straight-arm human flag hold on two sculpted parallel bars, rendered as one precious champagne-gold sculpture with warm amber enamel insets and deep midnight-blue recesses. Integrate the athlete and bars into a compact circular championship medallion with a strong double gold rim, two tiny laurel sprigs and one amber jewel at the bottom. Entire design fits inside central 80% of canvas so a circular avatar crop preserves everything. A new season avatar with a dominant readable sporting silhouette, not an existing club logo. Premium 3D illustrated jewelry collectible, crisp beveled metal, restrained facets, beautifully readable at 72px, clean studio lighting. True transparent alpha outside the medallion and through open spaces. No background plate, scene or shadow outside object. No text, letters, numbers, S1 lettering, watermark, real face, official FPT logo or third-party branding. One complete avatar only, no sheet, no grid, no variants.";
const specs = clubs.flatMap(club => ["LEGENDARY", "MYTHIC"].map(rarity => {
  const tier = rarity.toLowerCase();
  const subject = club.id === "soleil-hn" && rarity === "LEGENDARY"
    ? "A sculpted sunrise sun with sweeping rhythmic silk ribbons and one elegant dance shoe, an abstract celebration of dance without any person or human body"
    : rarity === "LEGENDARY"
    ? ordinary.find(x => x.id === club.id).prompt.split("Primary request: ")[1].split(". Inspired by")[0]
    : mythics.find(x => x.id === club.id).subject;
  const treatment = rarity === "LEGENDARY"
    ? "LEGENDARY / Huyền thoại. A compact circular championship medallion: dominant sculpted champagne-gold hero, rich club-accent enamel, deep midnight-blue recesses, strong double gold rim, two restrained laurel sprigs and one faceted club-accent jewel. A crisp unified precious object, elegant and readable."
    : "MYTHIC / Thần thoại. Reimagine the named hero as a translucent opal and sapphire crystal artifact with gold structural ribs and luminous club-accent cores. Enclose it in a dimensional circular celestial astrolabe: two interlocking crystal orbit rings, a small radiant eight-point star at the top, three tiny suspended diamond stars. The hero dominates; orbital ornament is subordinate. Exquisite impossible gemstone craftsmanship, a visibly higher fantasy tier than a gold medal, controlled iridescent cyan-violet edges and restrained star glints, no mist or busy particles.";
  const prompt = "Use case: stylized-concept\nAsset type: ONE new collectible circular profile avatar, S1 collection season in FPTU Xperience.\nClub identity: " + club.name + " · " + club.campus + ".\nRarity and treatment: " + treatment + "\nHero subject: " + subject + "\nClub accent: " + club.color + ".\nStyle: premium 3D illustrated game collectible, sculpted jewelry materials, studio lighting, high contrast and a bold recognizable silhouette at 72px.\nComposition: square 1024x1024 canvas. Front-facing unified circular avatar. ALL artwork contained inside a circle of diameter 80% of canvas, with 10% completely empty margin on every side. Full object, no clipped tips. True transparent alpha outside and through openings.\nConstraints: original unofficial game artwork. No text, letters, numbers, S1 lettering, watermarks, real faces, official FPT logos, third-party franchise branding, backdrop, opaque background disc, external shadow, UI, sheet, grid or multiple variations. One avatar only.";
  return { id: "season-s1-" + club.id + "-" + tier + "-avatar", clubId: club.id, club: club.name, season: "S1", rarity, subject, prompt: club.id === "street-workout-hn" && rarity === "LEGENDARY" ? firstPrompt : prompt, mode: "built-in image_gen", source: "design/source/seasons/s1/" + tier + "/" + club.id + ".png", asset: "public/assets/seasons/s1/" + tier + "/" + club.id + ".webp" };
}));
for (const tier of ["legendary", "mythic"]) {
  await mkdir(new URL("design/source/seasons/s1/" + tier + "/", root), {recursive:true});
  await mkdir(new URL("public/assets/seasons/s1/" + tier + "/", root), {recursive:true});
}
await writeFile(new URL("design/season-s1-prompts.json", root), JSON.stringify(specs, null, 2) + "\n");
console.log("Prepared " + specs.length + " independent S1 avatar briefs.");
