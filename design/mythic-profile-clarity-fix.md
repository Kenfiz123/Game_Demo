# Equipped Mythic clarity fix — 2026-10-10

The supplied inventory screenshot shows an empty AVATAR slot, REGALIA frame, LEGACY title and COMET effect. The faint image to the right is the equipped effect, not an equipped avatar. Preserve that distinction and all existing equipment IDs.

| Before | After | Why |
| --- | --- | --- |
| Entire effect at opacity `.46`, crest at `.32` | Both explicitly at `1` | Multiplication reduced crest visibility to 14.72% before raster alpha |
| Absolute effect behind identity and title, `z-index: -1` | Separate normal-flow showcase after identity/logo | Keep the valuable item unobscured without covering text |
| Background illustration easily mistaken for avatar | Visible “Hiệu ứng Mythic” label | Explain which equipped slot is being shown |
| Fixed backdrop on narrow screens | Dedicated full-width mobile row with bounded 240px artwork | Preserve legibility and space for the animation |

No new artwork, image enlargement, sharpening filter, dependency or animation loop. The existing source images are already crisp; the issue was compositing and placement. Native title text, avatar placeholder, frame overlay and visibility/reduced-motion gates remain unchanged. No avatar is automatically equipped, no copies/EX/odds/storage keys are changed.

## Verification

- Two new regression tests failed on the old source, then passed after the fix: full opacity / normal-flow responsive effect; labeled PRISM / PHOENIX / COMET display with empty AVATAR and unchanged state.
- Full suite: **145/145 pass**, zero skipped/cancelled. ESLint, TypeScript and isolated production build pass.
- Real Edge profile at `http://localhost:3001/inventory`: preserved **39,350 EX, 98 copies, 93 unique items, 3/5 equipped slots**, with COMET / REGALIA / LEGACY unchanged. No opening, granting, trading, equip or unequip action was performed.
- Desktop effect is bright and unobscured at the right of the identity. At 390px and 320px emulated widths it occupies a separate centered row and stays clear of the title. Screenshots: `mythic-profile-clarity-desktop.jpg`, `mythic-profile-clarity-mobile390.jpg`, `mythic-profile-clarity-mobile320.jpg`. Temporary device emulation and DevTools are closed after verification.
- Browser console shows an existing missing `favicon.ico` (404), plus development lazy-image/LCP warnings; no claim of a completely clean console or FPS benchmark. This fix does not change image-loading policy.
- GitNexus `list_repos` checked the complete registry: this demo is not indexed. Diagnosis is source/test/native-UI-backed, not based on another project's graph.

Skills applied: `emil-design-eng` keeps the identity and item separate and readable; `vercel-react-best-practices` preserves derived equipment/rendering without new state or effects; `webapp-testing` informs the test/observe workflow; `computer-use` verifies the live saved profile through Edge because the prior browser-control tool is unavailable. `gitnexus-debugging` supplied repository binding checks, then fell back to direct source for this unindexed demo.
