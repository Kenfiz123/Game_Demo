# FPTU Xperience — image direction

Created with the built-in ImageGen tool. Direction: tactile midnight titanium, champagne gold, soft cyan energy, restrained editorial lighting. No franchise artwork or copied UI.

## Chest key art

Source: `design/source/chest-premium.png`
Web asset: `public/assets/chest-premium.webp`

```text
Use case: stylized-concept
Asset type: isolated transparent PNG 3D product key art for FPTU Xperience mystery chest website
Primary request: one exquisite futuristic cosmetic reward chest, complete object floating, three-quarter front view slightly from above. Deep midnight anodized blue titanium body, sophisticated chamfered construction, thin luminous cyan seams, modest champagne-gold trim, a glowing amber diamond lock at front. Elegant physical product rather than cartoon treasure. Lid closed. Two fine energy arcs circling low around its base, restrained tiny suspended cyan crystals. Photoreal quality 3D product rendering with immaculate detailing, smooth reflections, premium student achievement collectible. Strong readable silhouette, object fills 75 percent canvas. Truly transparent background with alpha, generous clean transparent margins. Soft cyan rim lighting and warm amber front glow. No platform, no scenery, no floor, no text, no logo, no watermark, no weapon, no game franchise motifs. Landscape 1536x1024.
```

## Lucky Orbit observatory

Source: `design/source/orbit-observatory.png`
Web asset: `public/assets/orbit-observatory.webp`

```text
Use case: stylized-concept
Asset type: premium website hero backdrop for FPTU Xperience rewards arcade, wide landscape 1536x1024
Scene: a beautifully art-directed midnight blue futuristic observatory with a floating translucent amber energy orb inside two elegant concentric brushed titanium orbital rings. Ring device placed on the right two-thirds, left third is very dark clean negative space for website text. Subtle midnight teal haze, a few pinprick stars, glass reflections and a low circular plinth. Sophisticated architectural render, premium digital product imagery with tangible materials, controlled warm amber and icy cyan edge lighting. Quiet dramatic cinematic lighting with deep blacks. No text, no labels, no logo, no people, no weapons, no interface, no watermark. Full-bleed artwork only. The orb must feel like an original futuristic cosmetic-reward artifact, not a casino or game franchise asset.
```

## Delivery

Run `npm run assets` to produce optimized WebP assets from the original PNGs using Sharp. Web delivery uses Next Image with responsive sizes; the chest is prioritized, supporting artwork is lazy-loaded. CSS/SVG draw the interactive wheel and cosmetic emblems, keeping labels and motion crisp at every size.
