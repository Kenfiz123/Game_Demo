# Per-club Mythic identity repair

## Cause and replacement

The previous renderer correctly kept eight persistent finish variants, but `getMythicImage` reduced 73 clubs to 12 discipline images. Different club names did not make the underlying avatars unique. This repair replaces that shared base-art routing with one newly generated exclusive Mythic crest per club.

- Source: `design/source/mythic-clubs/{clubId}.png`.
- Web asset: `public/assets/mythic-clubs/{clubId}.webp`.
- Exact ImageGen briefs and subjects: `design/mythic-club-prompts.json`.
- Mode: built-in ImageGen, one generation call per club, genuine alpha. No paid API/CLI fallback.
- Same-club variants intentionally retain the same club identity while applying eight independent motion finishes; different clubs must never share the base image.
- Ordinary artwork is unchanged. Mythic must not reuse the lower-tier crest or old discipline crest.
- The sealed chest Vault and Phoenix mantle remain shared finish assets, not club identity artwork.

## Preservation

No cosmetic ID, rarity, item type, name, ownership, quantity, equipped slot, EX, trade odds, chest odds or storage schema changes. All 949 items remain: 365 ordinary items and 584 Mythics. Existing saved items resolve to the new artwork through their unchanged IDs; no migration or random replacement is needed.

## Acceptance

Asset tests require a bijection with all 73 source clubs, unique briefs/subjects, unique source/WebP hashes and decoded source pixels, no ordinary/shared-guild image reuse, substantial nonempty alpha artwork, 512px exports and a per-image budget below 140 KiB. Catalog tests require each club's eight Mythic variants to resolve to that club's canonical path. Rendering tests cover all 584 Mythic identities, including Legacy title artwork.

Browser QA must verify volleyball versus other sports, Taekwondo versus other martial arts, same-sport clubs at different campuses, both avatar variants and Legacy titles. No test grants items, spends EX or alters saved odds. Recheck mobile overflow and offscreen/pause animation gates. Final run results are recorded below after verification.

## Verification · 2026-10-09

- Built-in ImageGen completed all 73 independent club generations. Every selected source was visually inspected and retained in the workspace, alongside the exact prompt manifest. No CLI/API fallback, ordinary-art recoloring, shared sheet or generic guild fallback.
- `npm run assets:mythic-clubs`: exit 0, exported 73 of 73. **154,962,875 PNG bytes → 6,149,274 WebP bytes (96.03% smaller)**. Every output is 512 × 512, quality 82, genuine alpha and substantial visible artwork; range **56,928–133,218 bytes**, all below 140 KiB.
- Full asset tests verify 73 unique source hashes, 73 unique WebP hashes and 73 unique decoded 128px RGBA fingerprints. None reuses the 73 ordinary or 14 historical Royal sources. Runtime paths form a bijection with the 73 clubs, and all eight variants of each club use its exact canonical base.
- `npm test`: **121/121 pass**, no failed/skipped tests. Includes all 584 rendered Mythics, stable item IDs, equipment ownership/persistence, duplicate copies, migration, storage transactions, chest concealment, trade ceilings and motion lifecycle gates. Targeted catalog/equipment run: 30/30 pass.
- `npm run lint` and `npm run typecheck`: exit 0. Isolated production build (`XPERIENCE_BUILD_DIR=.next-review`, `npm run build`): exit 0, all 11 static pages generated. No new animation package or React render-loop changes.
- Actual browser QA at `http://localhost:3000/clubs`: Taekwondo Aurora and Celestial use the new white-enamel kicking fighter/jade crescent; Legacy uses that same club-specific crest and native Vietnamese title. Phoenix and Prism retain their intentional shared finish layers while preserving the new Taekwondo base; all sampled images loaded successfully.
- Vovinam Hanoi (blue belt/scabbard) and Vovinam HCM (paired airborne figures) have visibly different art and distinct canonical paths. Both differ from Taekwondo. Volleyball Hanoi Legacy uses its pearl volleyball/net crest, with `Truyền Nhân Của Karch Kiraly`, not the old generic athletics image.
- Mobile 390px and 320px: document scroll width equals client width (375/305px respectively, excluding the scrollbar), no horizontal overflow. Legacy and Aurora retained the correct club artwork. Temporary viewport overrides were reset.
- Aurora preview: six motion layers run while fully visible. Manual pause sets all six to `paused`; after scrolling the artwork below the viewport, `data-motion-active=false` and all six are paused. The asynchronous observer updates after layout, not in the same event task. No FPS/heap/Lighthouse benchmark claim.
- Browser state before and after remains **10,900 EX, 1 copy, 1 unique item**. No grants, openings, trades, equipment mutations or odds changes performed. Existing Mythic equipment is covered by the automated tests; this origin has no owned Mythic to re-equip during read-only QA.
- Browser error log: no errors. Existing development-only Fast Refresh reload and ordinary-card LCP priority warnings observed; not claimed as a clean performance benchmark.

Saved native JPEG browser proofs: `mythic-identity-taekwondo.jpg`, `mythic-identity-taekwondo-title.jpg`, `mythic-identity-vovinam-hn.jpg`, `mythic-identity-vovinam-hcm.jpg`, `mythic-identity-volleyball-title.jpg`, `mythic-identity-mobile-390.jpg` and `mythic-identity-mobile-320.jpg` in this directory. The development server remains available on port 3000 and the final preview is left on Taekwondo Aurora.
