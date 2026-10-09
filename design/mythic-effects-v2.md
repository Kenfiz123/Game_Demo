# Mythic effects v2

Keep the 73 exclusive club relics and all eight collectible IDs. The finish should feel like a crafted animated material around a stable visible crest, not the same spinning ring in different colors. Visual-only: no RNG, inventory, EX, equipment or odds changes.

Palette: midnight #0b1422, champagne #f3d59b, pearl #fff5d7, emerald #73efc7, amethyst #bd9bff, ice #9edaff. Keep existing native Vietnamese type and layout. Titles remain still and readable; only surrounding light and materials move.

```text
back: atmosphere + variant-specific geometry
front: club crest + alpha-masked metal reflection
edge: bounded sparkles / gems + static club signature
```

| Before | After | Why |
| --- | --- | --- |
| Aurora: two thin rotating borders | Soft curved emerald / amethyst / champagne ribbons | Fluid light rather than polygon shards |
| Celestial: front-on circles | Inclined orbital planes, planets and nebula | Depth without spinning the crest |
| Comet: revolving tails | Staggered diagonal shooting stars | Distinct movement signature |
| Static crest material | Reflection masked to the actual artwork | Dimensional gold, same club identity |
| Similar frame around each finish | Engraved seal, crystal facets, flame mantle, regalia bezel, architectural title plaque | Eight recognizable collectibles |

Review: preserve the noble direction but reject eight recolored circles. Emphasize the collectible; controls/page chrome stay quiet. Persistent motion is explicitly requested and signals the equipped finish, not a delay to interactions. Slow ambient loops use transform/opacity only. No rapid flashes, animated text, canvas, RAF, per-frame React updates or new dependency.

Full moving layers capped at 16, compact at 8. All animated owners use royal-motion, default paused; shared visibility/manual/reduced-motion gates include pseudo-elements. Compact art omits atmosphere, extra ribbons/planes/shards/plumes/embers/title dust. Keep royal-core/signature/legacy-copy/plaque and equipment/header hooks.

## Baseline · 2026-10-09

Actual /clubs Taekwondo Aurora: 446 DOM nodes, 8 images, 0 canvas, 6 running visible CSS animations. Top/footer: 0 running/offscreen. 390px visible preview: 6 running, 0 offscreen. Probe includes ::before/::after. The existing observer is already efficient; preserve these gates. Screenshot: mythic-fx-before.jpg. State: 10,900 EX, 1 copy/1 unique item. No FPS/heap/Lighthouse claims.

## Final verification

Completed 2026-10-09. `npm test`: 136/136 pass; lint and TypeScript pass. Isolated `.next-review` production build succeeds, all 11 static pages generated. No dependency, asset, catalog, RNG, storage or gameplay changes.

All eight full previews inspected in the actual /clubs browser. Running visible CSS animations (including pseudo-elements): Prism 12, Sovereign 8, Aurora 9, Celestial 10, Legacy 9, Phoenix 16, Comet 9, Regalia 7. All probes show 0 offscreen animations running and 0 canvas. Aurora: 484 total page DOM nodes versus baseline 446; the extra static SVG nodes create smooth ribbons, not additional frame loops. Its responsive image loads successfully; the shine mask reuses the same cached currentSrc and shares the exact image content box. The crest stays still, with motion confined to its finish.

Manual pause: 0 running layers. Top and footer probes: 0 running layers. At 390px and 320px, Aurora has 9 visible running layers, 0 offscreen; content/client widths match (375/375 and 305/305), with no horizontal overflow. Temporary viewport override reset. Reduced-motion/tab-hidden/cleanup behavior covered by existing shared-observer tests; no claim of an OS-level reduced-motion toggle or hidden-tab browser measurement in this pass.

Renderer budgets: maximum 53 full / 38 compact descendant nodes (Aurora), and 16 full / 8 compact moving owners (Phoenix), below 65/55 and 16/8 caps. Tests also cover unique Aurora gradients across repeated/compact items, alpha-mask readiness and cached image source, every keyframe using only transform/opacity, and full pseudo-element pause gates. Shared equipment/header consumers reviewed; no Mythic was granted or equipped during browser QA. Existing state remains 10,900 EX, 1 copy / 1 unique item.

Browser QA found two simultaneous development servers using `.next`; the redundant 3001 server was stopped and the 3000 server restarted without deleting files or stored state. Final /clubs reload succeeds. Production output remains isolated.

Native browser proof: `mythic-fx-v2-aurora.jpg`, `mythic-fx-v2-celestial.jpg`, `mythic-fx-v2-phoenix.jpg`, `mythic-fx-v2-legacy.jpg`, `mythic-fx-v2-mobile.jpg`. No FPS, heap or Lighthouse benchmark claims.
