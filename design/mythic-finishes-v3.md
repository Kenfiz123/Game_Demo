# Mythic atelier — finish redesign

Direction: a jewellery atelier for rare club heirlooms. Keep the 73 exclusive club crests, give four finishes substantial sculpted materials, then animate reflected light rather than spinning the identity.

| Before | After | Why |
| --- | --- | --- |
| Quân Vương: thin radial seal | Carved champagne-gold coronation frame, ruby and laurel | Royalty should read through material and silhouette |
| Cực Quang: faint SVG curves | Opalescent emerald ribbons in a gilded bezel | Aurora should have luminous folds and depth |
| Thiên Hà: simple CSS orbits | Sapphire astronomical jewellery with a stellar armillary | A celestial heirloom needs a recognisable crafted object |
| Sao Băng: intermittent thin streaks | Platinum and ice-diamond comet setting with moving meteor accents | A strong still silhouette must remain valuable between animation beats |
| Mythic options only in an eight-way selector | Explicit per-club avatar and achievement-title entry points | Make the existing guaranteed catalog coverage discoverable |

## Composition and tokens

```
ornate material frame (static + masked moving light)
  + exclusive club crest (stable, centred)
  + two or three signature motion accents
  + discreet signature plate
```

Palette: onyx `#0b1422`, champagne `#f3d59b`, ivory `#fff5d7`, emerald `#73efc7`, sapphire `#9edaff`, violet `#bd9bff`.
Typography: existing native Cambria royal stack, preserving Vietnamese accents.
Motion: transform/opacity only, shared visibility observer, manual pause and reduced-motion support. No new canvas, RAF loop or dependency.

Catalog compatibility: preserve all 949 item IDs, both existing Mythic avatar variants and the Legacy title for every club. “Thành tích” denotes the collectible cosmetic title, not a certificate of real-world achievement. No changes to chest odds, trade-up odds or owned copies.

## Image production

Four independent transparent game art assets generated with the built-in ImageGen tool. Original PNGs belong in `design/source/mythic-finishes/`; optimized alpha WebPs in `public/assets/mythic-finishes/`. Exact prompts are stored in `design/mythic-finish-prompts.json`.

| Finish | Original PNG | Served WebP | Bytes |
| --- | --- | --- | ---: |
| Quân Vương | `design/source/mythic-finishes/sovereign-v3.png` | `public/assets/mythic-finishes/sovereign-v3.webp` | 114290 |
| Cực Quang | `design/source/mythic-finishes/aurora-v3.png` | `public/assets/mythic-finishes/aurora-v3.webp` | 143544 |
| Thiên Hà | `design/source/mythic-finishes/celestial-v3.png` | `public/assets/mythic-finishes/celestial-v3.webp` | 153158 |
| Sao Băng | `design/source/mythic-finishes/comet-v3.png` | `public/assets/mythic-finishes/comet-v3.webp` | 156156 |

Export: `npm run assets:mythic-finishes`. Whole artwork fits into 608 × 608 with a 16px transparent gutter on each side, producing 640 × 640 WebP. All original pixels remain in the PNGs; no cropping or club-crest replacement. Total original PNGs 8,895,895 bytes; served WebPs 567,148 bytes. All four decoded fingerprints differ, all centres/corners have alpha 0, and each asset is below 200,000 bytes. The gutter also avoids near-zero alpha residues from downsampling delicate tips at the canvas edge.

## Verification — 9 October 2026

- 142/142 automated tests pass; ESLint, TypeScript and isolated production build pass (`XPERIENCE_BUILD_DIR=.next-review`).
- 73 clubs retain 146 Mythic avatar items, 73 Legacy title items, 73 exclusive crest images and all 949 catalog IDs. All avatar/title items are in the actual Mythic chest pool. No inventory copies, equipment slots, EX or probabilities changed.
- Each new finish: 10 full / 7 compact motion owners. Full DOM: 23 nodes (Comet 27); compact: 20 (Comet 24). Existing budgets remain 65/55 nodes and 16/8 motion owners.
- Browser baseline on `/clubs`: Sovereign 8, Aurora 9, Celestial 10, Comet 9 running CSS owners; 0 offscreen owners. After: 10 for each redesigned finish, 0 offscreen; no canvas added. These are owner counts, not FPS or GPU measurements.
- After: top/footer offscreen and manual pause each report 0 running animations, including pseudo-elements. Changing variant while paused stays paused. Both alpha reflections match the exact rendered image content box and use cached `currentSrc`; no duplicate eager mask fetch.
- Viewed all four new finishes on JS Club, Taekwondo's separate crest at 390px and 320px, and Comet around the exclusive volleyball crest. Client/scroll widths 375/375 and 305/305: no horizontal overflow. Quick avatar and achievement-title controls select the existing IDs; Vietnamese legacy text remains native and unbroken. Preview left EX at 10,900 and inventory at one copy. No browser console errors in the final check.
- Reduced-motion and hidden-tab/observer lifecycle are covered by automated checks; no physical-device, FPS, heap or Lighthouse claim.

Proof images: `mythic-fx-v3-before.jpg`, `mythic-fx-v3-sovereign.jpg`, `mythic-fx-v3-aurora.jpg`, `mythic-fx-v3-celestial.jpg`, `mythic-fx-v3-comet.jpg`, `mythic-fx-v3-volleyball-comet.jpg`, `mythic-fx-v3-mobile390.jpg`, `mythic-fx-v3-mobile320.jpg` in this directory.
