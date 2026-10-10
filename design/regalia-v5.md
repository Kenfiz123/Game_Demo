# Vương Miện — coronation frame v5

Targeted replacement of the REGALIA Mythic frame, not a new collectible or rarity.

- Built-in ImageGen created a jewellery-only crown: dimensional champagne gold, burgundy rubies, diamonds and pearls. Original 73 club crests remain separate and unchanged.
- Source: `design/source/mythic-finishes/regalia-v5.png`.
- Optimized asset: `public/assets/mythic-finishes/regalia-v5.webp`, 640 × 640, 118,258 bytes, genuine alpha. Rebuild with `node scripts/optimize-regalia.mjs`.
- Exact prompt, generation mode and aperture measurements: `design/regalia-v5.json`.
- The setting stays still; alpha-masked gold reflections and staggered jewel glints supply motion. The loaded responsive image also supplies its alpha mask, avoiding a second full-resolution material request.
- Chest reveal, catalog and inventory all use the same renderer. The existing visible-motion gate, manual pause and reduced-motion handling remain.
- On an equipped portrait, the crown is the outer frame. A nested Mythic avatar keeps its private crest and animated light but does not show a second sculpted surround or a tiny overlapping label.

## Verification

Visual QA used an isolated local database and QA browser sessions, never the user's production inventory. FCC and Cóc Sài Gòn were inspected in the catalog; the real RewardReveal component was inspected using a temporary renderer-only fixture, removed before production build. Catalog widths 320, 390 and 1280 had no horizontal overflow or clipped crown tips.

Runtime measurements for a visible full REGALIA: 8 CSS animations running; manual pause, offscreen and reduced-motion states: 0 running. Jewel transform and opacity changed across a 700 ms sample. These are bounded CSS motion checks, not FPS or heap-leak claims. No timer, RAF loop, canvas or animation library was added.

Source and WebP aperture tests checked 284,491 and 68,076 pixels respectively, with maximum alpha 1/255. Full/compact renderer budgets: 22/18 DOM nodes, 9/5 gated motion owners. Existing rarity, RNG, copies, equipment IDs, backend/session and reel behavior are preserved.

Browser screenshots are under `output/playwright/regalia-v5/` (ignored QA artifacts).

Equipped default portrait and Crown + Aurora combination were also checked at 1280, 390 and 320 widths with zero horizontal overflow. The scoped wearable-frame composition increased the actual selected crest from 35.94 to 66.53 px on desktop and from 23.81 to 44.09 px on mobile, removing the nested signature that covered it. Standalone avatars retain their original surrounds.

Equipped Crown + Aurora showed 14 actual CSS animations in view and 0 running per artwork offscreen. Removing the crown restored the original avatar surround and label; re-equipping and reloading retained both slots and both owned copies. Browser console had no errors; a development-only LCP image-priority warning was observed. No production data was used for these checks.

Final gates: 219/219 tests, ESLint, TypeScript and optimized production build passed. Node 22's existing experimental SQLite warning remains non-fatal. Temporary QA route removed; `tsconfig.json` restored to its pre-task include list.
