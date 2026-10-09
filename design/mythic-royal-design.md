# Mythic · Sovereign collection

The brief asks for noble rarity, distinct club identities, separate collectible effects and animation which belongs to the equipped item rather than only its opening. The revised art direction is **73 exclusive Mythic club crests, one per CLB, each used by its eight distinct collectible finishes**. Preserve EX, all 949 stable catalog IDs, copy counts, equipment, chest-only Mythic and trade odds 80/60/30/5. This is an artwork replacement, not a grant, reroll or state migration.

## Design tokens and layout

Midnight #0b1018, royal sapphire #183a64, ivory #fbf1df, champagne gold #f4d9a2, amethyst #8063a8 and pearl rose #d5b2bd. Georgia is used only for legacy display titles and ceremonial reveal; existing Segoe UI remains for controls and facts. Center the relic; left-align descriptions and odds. No extra marketing eyebrows or decorative counters.

```text
Chest: shared sealed royal vault → stop → ceremonial reveal of actual item
CLB: 5 original low tiers
     [large Mythic preview + eight selectable variants + exact odds]
Inventory: equipped profile (logo / avatar / frame / title / effect)
           owned stacks with explicit equip / remove
```

Review against brief: replacing only the halo or recoloring an old crest is insufficient. Generate a different physical jewelry silhouette and unmistakable activity-specific central subject for **every one of the 73 clubs**. A volleyball over a net is not a basketball rim; a Taekwondo high kick inside a jade crescent is not Vovinam's martial belt/saber or Muay Thai gloves. Clubs within the same field also receive different hero objects, poses and crest silhouettes, not a generic themed guild with a different label. The eight finishes of one club deliberately share that club's own crest; eight distinct IDs and motion treatments do not imply eight separately generated base images. Text remains native HTML. The shared anonymous vault never reveals a club or variant.

## Eight independent items per CLB

Sovereign logo; Aurora avatar; Celestial avatar; Legacy title; Regalia frame; Prismatic effect (preserves old `-mythic` ID); Phoenix effect; Comet effect. Each has its own persistent ID and uniform address in the Mythic pool: **584 Mythics, 365 lower-tier items, 949 total**. Their base image is resolved by club ID from `/assets/mythic-clubs/<club-id>.webp`, never the ordinary `club.image` or a generic guild fallback. Legacy names are symbolic tribute and not endorsements or claims of objective greatest-in-field status. Football explicitly includes Truyền Nhân Của Messi.

## Motion decisions

The user explicitly requests persistent collectible motion. Every variant has different visual choreography, using bounded transform/opacity layers and shared visibility observation. Compact avatars may animate when actually visible; no per-card RAF/timer or particle engine. Offscreen, hidden-tab, manual pause and reduced-motion states are static. Selection/equip controls remain immediate. Mythic reveal is a rare one-shot ceremonial entrance; controls are never delayed. Repeat opening replay is optional, with reduced-motion shortcut. No item identity is mounted in a rolling vault.

## Baseline and checks

Before edits: /inventory338DOMnodes,0canvases,0Mythicowned; selected football preview /clubs681DOMnodes and8visible CSSanimations (two prism rings + sixstars),0offscreen-running. No heap/FPS benchmark claimed. After changes profile all Mythic descendants including pseudoelements in preview, inventory, equipped header and after scrolling; shared observer cleanup remains tested. Verify13itemsperCLB,8uniquevariants, all584drawaddresses, exact saved-item renderer in reveal/inventory/profile, equip ownership validation, oldbalance/copies/IDs preserved, viewport320/390px and production build.

## Club-exclusive asset pipeline

`design/mythic-club-prompts.json` is the 73-entry manifest of club ID, real club name, unique subject, exact prompt, built-in generation mode and source/output paths. Generate **one asset per built-in ImageGen call**, requesting genuine alpha; do not substitute a shared sprite sheet, recolor ordinary art or silently switch to CLI/API generation. Retain the original generated file and copy the selected PNG into `design/source/mythic-clubs/<club-id>.png`.

Run `npm run assets:mythic-clubs` to export the saved sources into `public/assets/mythic-clubs/<club-id>.webp`. For a completed subset use `npm run assets:mythic-clubs -- --ids volleyball-hn,taekwondo-hn`. The optimizer validates the 73-ID bijection, unique paths/subjects, source hashes and real alpha, preserves full silhouettes with contain-fit, and writes 512 × 512 alpha WebP below 140 KiB each. It never calls ImageGen. Every crest was individually inspected for distinctive club activity, complete edges, readable hero object and transparency before exporting. All 73 exports pass the full optimizer: **154,962,875 source bytes → 6,149,274 web bytes (96.03% smaller)**, **56,928–133,218 bytes** per WebP, all quality 82. Source files, WebP files and decoded pixel fingerprints are unique across the 73 clubs and do not reuse the 73 ordinary or 14 historical Royal sources. Integrated build/browser results are recorded in `design/mythic-club-identity-fix.md`.

## Preserved Royal assets

The earlier **14-image Royal set remains on disk**, with its exact prompts in `design/mythic-royal-prompts.json`, PNG sources in `design/source/mythic-royal` and 512px alpha WebPs in `public/assets/mythic`. It contains twelve themed guild crests, the sealed Vault and a ruby-gold Phoenix mantle. Its historical measurement is unchanged: **37,099,545 source bytes → 1,469,534 web bytes (96.04% smaller)**. The twelve guild crests are retained source/provenance, **not the current club base or an automatic fallback**. Vault and Phoenix mantle remain active shared assets: the anonymous Vault protects pre-reveal identity, and the mantle's transparent center surrounds each club's exclusive crest. The older ordinary club artwork in `design/source/clubs` and `public/assets/clubs` remains intact for the five lower tiers.

A first browser review rejected flat CSS Phoenix wings in favor of the sculptural feather asset; that shared overlay remains compatible with the new 73 bases. Profile Legacy plaques use native text, responsive widths and one accessible heading; mobile identity fills its own row so a logo cannot squeeze a long title. The shared Mythic renderer must use the actual saved item's `image` in reveal, inventory, spotlight, equipped avatar/logo/frame/effect/title and compact header. No EX, copies or stable IDs change when the crest mapping changes.
