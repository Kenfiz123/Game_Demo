# Mythic Prismatic edition

The user requested all six rarity tiers for every club, with an extraordinary sparkling/kaleidoscope treatment for Mythic. The original 73 ImageGen emblems and the IDs of the previously owned logo/avatar/title rewards are preserved.

## Asset

Generated with the built-in ImageGen tool, transparent output enabled, no CLI or API fallback. This is one reusable crystal material, composed with each club's own distinct emblem; it is not 73 newly generated Mythic logos.

- Original: `design/source/mythic-prism-halo.png`.
- Web delivery: `public/assets/mythic-prism-halo.webp`, 640 × 640 with alpha.
- Exact final prompt and generation mode: `design/mythic-art-prompt.json`.
- 1,892,350 → 175,470 bytes, 90.7% smaller. The inner hole remains transparent (at most 2/255 alpha tolerance for compressed pixels).
- Rebuild: `npm run assets:mythic`.

The prompt asks for a centered eightfold crystal mandala, champagne-gold filigree, iridescent opal/cyan/rose/violet facets, sparse star glints, a transparent central hole and outer margins, and no text, logos, background disc or watermark. Vietnamese names are rendered as real HTML text.

## Rarity ladder

| Tier | Cosmetic | Treatment |
| --- | --- | --- |
| Common | Logo | Original club emblem |
| Uncommon | Badge | Club-colored shield |
| Rare | Avatar | Circular identity ring |
| Epic | Title | Live-text personalized title plate |
| Legendary | Frame | Double gold border and club-accent jewels |
| Mythic | Effect | Prismatic crystal halo, counter-rotation, six slow sparkles |

73 × 6 = 438 club rewards; 457 rewards including campus originals. Mythic draws remain 0.2%, then select evenly among all 75 Mythics. Individual-item odds are shown separately from rarity odds. All Mythic reel entries remain the same anonymous Vault, including decorative entries; new artwork is not exposed during the roll.

## Motion decisions and verification

This is occasional collection/celebration motion. The emblem remains still and readable; two crystal layers rotate linearly over 48 and 64 seconds in opposite directions. Six stars softly vary transform/opacity over 4.8 seconds. No animated filter, shadow, gradient painting, canvas, RAF loop, timers or new animation dependency.

One shared IntersectionObserver activates an artwork only at ≥98% intersection; partly clipped artwork stays static. One shared document-visibility listener and one reduced-motion listener pause all targets when needed. Every subscription unobserves its target; the final cleanup disconnects the observer, releases both listeners and empties the registry. SSR begins paused. Unsupported IntersectionObserver has a static fallback. A local preview control can pause/resume independently and never awards a cosmetic or changes RNG.

The animation-optimization skill informed the live CSS/pseudo-element probe and lifecycle design. The UI-polish skill informed the slow, restrained motion and static central emblem. React guidance informed shared listeners and avoiding frame-by-frame renders.

Browser baseline on `/clubs`: 1280 × 720, zero CSS animations and zero canvases. After the update, a fully visible preview ran eight CSS animations (two halos and six stars), all in view. The pause button stopped all eight. After reloading the final observer code, partial-card and footer samples reported no offscreen running animations; fully visible reward cards resumed correctly. A production preview also reported eight visible animations, zero offscreen running animations, zero canvases and no console errors/warnings. Heap counters and FPS were not measured.

Responsive verification at 390 px and 320 px found no horizontal overflow. Shared motion behavior is covered by six tests including partial visibility, hidden tabs, reduced motion and final-subscriber cleanup. All 32 tests, lint, TypeScript checking and production build passed. The production chest awarded Avatar AI Club and its ownership survived a reload.

Screenshots: `design/mythic-preview.jpg` (production desktop) and `design/mythic-mobile-preview.jpg` (390 px).
