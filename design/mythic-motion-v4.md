# Mythic motion v4

User requested unmistakable movement, not just illustrated ornaments with slow light sweeps. Preserve the four ImageGen v3 material assets and all 73 private crests; animate the surround and distinct physical accents without moving the club identity or native title text.

| Before | After | Why |
| --- | --- | --- |
| Static jewellery frame | Independent floating / swaying surround | Depth should remain visibly alive between light sweeps |
| Quân Vương: tiny jewel opacity changes | Travelling diamonds and a coronation energy wave | Royal light has spatial choreography |
| Cực Quang: nearly static flat gradients | Curved light ribbons moving on separate wrappers | Show luminous silk flowing around the item |
| Thiên Hà: faint static constellations | Two inclined orbital planes with revolving gems | Actual celestial motion, while the crest remains readable |
| Sao Băng: 13–23 second sparse streaks | Shorter staggered meteor flights and an expanding wake | Motion should be recognisable during an ordinary preview |

Animation purpose: communicate the rare item's active finish in its preview, reveal and equipped rendering, as explicitly requested. These are continuous cosmetic animations, not delays on frequently used UI controls. No entry or selection delay added.

Constraints: transform/opacity keyframes only; the existing single shared visibility observer observes each art shell; explicit Pause, offscreen/hidden-tab and reduced-motion gates. No per-frame React state, new RAF loop, timers, canvas, network request or dependency. Preserve full/compact DOM budgets 65/55 and motion-owner budgets 16/8. Compact rendering omits the full meteor wake and coronation pseudo-wave. All 949 item IDs, chest odds, EX, copies and equipment slots stay unchanged.

## Verification — 2026-10-09

- `npm test`: 143/143 pass, no skipped/cancelled tests. ESLint, TypeScript and isolated production build (`XPERIENCE_BUILD_DIR=.next-review`) pass.
- Tests resolve base, modifier and compact CSS together, requiring spatial transform motion instead of accepting opacity-only twinkles. All 584 private-crest/material combinations remain covered; the frame moves as a separate sibling of the stationary crest. Shared inventory, header and reveal consumers retain `animated` rendering.
- Full DOM nodes: Sovereign 25, Aurora 31, Celestial 29, Comet 28; compact 22/28/26/24. Motion owners full 11/11/11/12, compact 8 each. Sovereign additionally has a gated full-only coronation pseudo-wave.
- Read-only browser baseline, before v4 edits: visible desktop Comet 10 running CSS layers, 0 running offscreen, 473 DOM nodes, 9 images, 0 canvas. Current Comet: 12 running, 0 offscreen, 476 nodes, 9 images, 0 canvas. These are bounded DOM snapshots, not FPS or memory benchmarks.
- Current visible browser samples: Sovereign 12 running layers including its pseudo-wave; Aurora and Celestial 11 each; Comet 12. All have 0 running offscreen layers.
- Temporal computed-style checks show real motion. Comet frame changed from `matrix(0.99992,-0.01266,0.01266,0.99992,-1.52,0.84)` to `matrix(0.99991,0.01357,-0.01357,0.99991,1.63,-2.77)`; its first meteor moved from `(35.41,28.49)` to `(152.15,122.41)` while fading. Celestial orbit and Aurora ribbon matrices also change independently over time. Club crest stays `transform: none` in each sample.
- Manual Pause: 0 running layers and identical frozen transform samples across separate observations. Switching to Celestial while paused also stays at 0. Resume reactivates motion when fully visible. Page top and footer: 0 running layers. Hidden-tab and reduced-motion cleanup/gates are covered by the motion lifecycle tests; those OS settings were not changed during browser QA.
- Responsive checks at 390×844 and 320×780: no horizontal overflow, Aurora active with 11 running layers, 0 running offscreen. Reset the temporary viewport afterwards. Console errors: 0. Wallet and collection remain 10,900 EX / 1 copy / 1 unique; preview does not grant or consume items.

## Visual evidence and capture limitation

Real UI screenshots: `mythic-motion-v4-sovereign.jpg`, `mythic-motion-v4-aurora.jpg`, `mythic-motion-v4-celestial.jpg`, `mythic-motion-v4-mobile390.jpg`, `mythic-motion-v4-mobile320.jpg`.

The browser screenshot tool repeatedly freezes the illustrated state: source frame hashes were almost identical even though read-only computed transforms continued changing. An attempted GIF would therefore misrepresent the live animation and is not included. Trial captures were moved, without deletion, to ignored `.next-review/motion-proof-scratch-v4-20261009/`. No invented or interpolated frames were used. View the actual movement at `/clubs`; screenshots document layout and materials only, not motion cadence. No FPS, heap or Lighthouse claim is made.

`scripts/build-motion-proof.mjs` can assemble externally captured real frame sequences with explicit per-frame delays; it does not generate motion. The v4 effect itself reuses the ImageGen v3 artwork and adds only code-native animation.
