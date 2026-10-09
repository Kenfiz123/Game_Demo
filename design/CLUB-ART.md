# Club collection

Source: Danh_sach_CLB_FPT_University_theo_nhom.docx supplied by the user, 73 distinct records in 10 groups. Original names, campus labels and source links are retained in src/data/clubs.json.

These are newly designed unofficial game identities, not official club logos. One ImageGen emblem per club is used for its logo cosmetic and adapted into a circular avatar using CSS. Titles are composed as live text to retain exact Vietnamese accents. Unicamp and Color Team retain neutral identities because the source does not define their activities.

Final per-club prompts: club-art-prompts.json. Built-in ImageGen, no API fallback. Original PNGs: design/source/clubs. Optimized web delivery: public/assets/clubs. Every club now receives a Common logo, Uncommon shield badge, Rare avatar, Epic title, Legendary gold frame, and Mythic Prismatic effect. Existing IDs, the 19 campus cosmetics, and rarity probabilities remain compatible.

Design direction follows the existing product: midnight #0b1018, panel #101722, pearl #edf0f5, champagne #edbd7b; each club has a distinct controlled accent. Existing Segoe UI typography is retained. A quiet catalog prioritizes the actual club emblem and name, with filters for campus and activity group. Catalog cards stay static and show six tier markers. Detail views add a dedicated prismatic Mythic preview with a motion pause control.

Completed 2026-10-08: all 73 original PNGs and all 73 WebPs are present. This continuation generated only the 30 missing emblems; the earlier 43 were preserved. PNG total: 92,355,095 bytes. WebP total: 2,438,460 bytes (97.36% smaller), 384 × 384 pixels each, 21,458–46,030 bytes per emblem. Alpha-pixel tests confirm transparent margins and visible artwork for every asset.

Integration: 438 club cosmetics plus 19 campus cosmetics, 457 total. Both games draw from the same indexed rarity pools, with unchanged odds; Orbit still excludes Mythic. Chest Mythic remains 0.2%, distributed equally over 75 items. The catalog renders 12 clubs per page; inventory renders 24 owned cosmetics per page. New demo balance: 50,000 EX; repeatable test grant: 10,000 EX without resetting progress. Existing stored balances and collections remain compatible.

Verification: 32 automated tests cover rarity probabilities, transactions, all 75 Mythics being concealed, every club cosmetic being drawable, legacy club IDs, EX grants, complete prompt coverage, asset integrity and motion lifecycle. Desktop, 390 px and 320 px layouts were checked. The production chest awarded Avatar AI Club, which remained in Collection after reload. A bounded grid track and a square Mythic shell keep artwork correctly sized. Details of the new material and animation audit: MYTHIC-ART.md.
