# Five-slot forge · implementation direction

## Scope and visual plan

Retire the 19 generic campus samples from the active catalog; retain all 438 CLB cosmetics and all stored legacy data. Add a five-copy risk contract and browser-local odds editor without changing the existing chest timing or EX costs.

Palette: midnight #0b1018, titanium #111c28, slate #253346, champagne #e7bd83, muted silver #939dad, caution rose #ce9a8b. Preserve Segoe UI, restrained sentence-case labels and the existing shell. A single generous workbench image anchors the new game; probability and irreversible consumption stay beside the action, not hidden in tooltips.

```text
Desktop: heading + three game tabs
         [forge image / result] [four upgrade odds + rules]
         [five selected copies · confirm / cancel]
         [rarity / search · owned-item grid, 12 per page]
Mobile:  same reading order, one column, five slots kept visible
Settings: six-row chest table with live total; four-row contract table
```

Motion decision: selection/filtering/confirmation are instant. Pointer-confirmed contracts use one 1.4-second transform/opacity charge to communicate processing, with no perpetual loop or per-frame React updates. Keyboard confirmation and reduced motion reveal immediately. Results are committed before animation; unmount releases the shared presentation lock. No reward identity is mounted during the charge.

## Rules

Exactly five same-rarity copies; mixing CLBs and repeat copies is allowed. Success probabilities: Common→Uncommon80%, Uncommon→Rare60%, Rare→Epic30%, Epic→Legendary5%. All five are consumed on either outcome. Success adds one uniformly selected item from the entire next-tier pool. Legendary and Mythic are ineligible; Mythic is chest-only. This is a custom FPT prototype, without purchases or cash-out.

Odds editing is draft-first, explicitly saved and validated: each value0–100%; chest total100%. Presets are for testing, never automatic. Existing EX/inventory/history migrate with a non-overwriting v1 backup; refunded legacy duplicates are not invented retrospectively.

## Selective CS references

- [Official publisher disclosure](https://www.csgo.com.cn/news/gamebroad/20170911/206155.shtml): separate rarity odds from uniform item selection inside a quality. Its five-tier values are not transplanted into FPT's six-tier catalog.
- [Valve's classic contract support](https://help.steampowered.com/en/faqs/view/0151-608B-BCAA-D7D5): consumption and next-tier exchange, but FPT intentionally uses five inputs with loss risk, not the classic guaranteed ten-input rule.
- [Valve's 22 October2025 update](https://store.steampowered.com/news/posts/?appids=730&enddate=1761350400&feed=steam_community_announcements): CS2 also has a distinct five-Covert route to special items. FPT's Mythic chest-only rule is our own restriction.
- [Valve art guidance](https://www.counter-strike.net/workshop/workshopstyleguide/): restrained common art and stronger high-tier distinction, using only original CLB concepts.

The independent saved result, anonymous Mythic vault and ornamental reel are our implementation choices, not claims about unpublished Valve RNG internals. Neither near-misses nor longer animations alter winning probability.

## Asset

Built-in ImageGen, new transparent raster illustration. Exact prompt: `forge-art-prompt.json`; source: `source/forge-five-slot.png`; web: `../public/assets/forge-five-slot.webp` (1000×667, approximately120KB, alpha preserved). No Valve assets, text or logos generated. Real labels and interactive slots are HTML.

## Verification checklist

- Both contract outcomes, quantity consumption, random destination and no Mythic upgrade.
- Duplicate stacks, unique progress, legacy backup and unavailable-storage rejection.
- Invalid totals cannot save; valid changes update the reel, rates and club previews.
- Keyboard/focus,320/390px layouts, production render and no missing assets.
- No idle forge animation, no early reward mount; reduced motion does not hold the game lock.
