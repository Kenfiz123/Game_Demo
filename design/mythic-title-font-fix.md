# Vietnamese Mythic title typography fix · 2026-10-09

Symptom: `Truyền Nhân Của Ada Lovelace` displayed a broken-looking gap around `ề`, both inside the native Legacy plaque and its /clubs heading. Reproduced in the actual browser before editing; screenshot `mythic-title-font-before.jpg`.

Root cause: installed Windows Georgia faces lack `ề` U+1EC1 and `ủ` U+1EE7, forcing per-character font fallback inside a word. Bundled Next fontkit inspected local font character maps: Georgia lacks 36 of the 100 distinct characters across the 146 catalog titles; Cambria and Times New Roman lack none and cover U+1EA0–U+1EFF. The Ada title is already NFC, with ordinary U+0020 spaces only. No data normalization or text replacement is needed. This demo has no GitNexus index; diagnosis used current local source and fonts, not an unrelated indexed project.

Fix: one `--font-royal` stack, `Cambria, "Times New Roman", "Noto Serif", serif`, used by the Legacy plaque, collection headings, spotlight heading and reveal ceremony heading. All five Georgia-first display rules now use this variable. No downloaded font, dependency, React runtime, artwork, animation, catalog, EX, inventory or equipment change.

Browser verification: Ada title is visually continuous in the plaque and heading, computed font stack matches the new variable, neither title clips horizontally. At 390px and 320px, page content/client widths match (375/375 and 305/305); titles wrap and remain fully visible. Viewport override reset. State remains 10,900 EX and 1 copy / 1 unique item. Proof: `mythic-title-font-after.jpg`, `mythic-title-font-mobile.jpg`.

Two development servers were again using `.next`. Restarted only our 3000 server with isolated `.next-dev3000`; left the other server untouched. Next automatically added its generated types path to tsconfig; the temporary output directory is ignored. Production build uses `.next-review` and succeeds (11 static pages).

Regression coverage: 3 new checks for catalog title NFC/characters, exact Ada title, full/compact native rendering, and all five CSS font consumers. Full suite: 139/139 pass, lint and TypeScript exit 0. Actual glyph appearance is browser-verified, not inferred from SSR tests. Generated dev output is excluded from lint, like the other Next build directories.
