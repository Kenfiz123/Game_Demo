import { CLUBS, normalizeClubSearch, type Club } from "@/data/clubs";
import { COSMETICS, getCosmeticById } from "@/data/cosmetics";
import type { CosmeticItem } from "@/types/gamification";

const itemsByClub = new Map<string, CosmeticItem[]>();
for (const item of COSMETICS) {
  if (!item.clubId || item.seasonId) continue;
  const items = itemsByClub.get(item.clubId) ?? [];
  items.push(item);
  itemsByClub.set(item.clubId, items);
}
const searchableClubs = new Map(CLUBS.map(club => [club.id, normalizeClubSearch(`${club.name} ${club.shortName} ${club.campus} ${club.group}`)]));
export const getCollectorClubItems = (clubId: string): readonly CosmeticItem[] => itemsByClub.get(clubId) ?? [];
export const normalizeCollectorBio = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu, " ").slice(0, 180);
/** Even two anonymous players must never share a local editor draft. */
export const collectorProfileEditorKey = (playerId: string | null, username?: string) => `${playerId ?? "pending"}:${username ?? "guest"}`;

export interface ClubCollectionProgress {
  club: Club;
  items: readonly CosmeticItem[];
  discovered: number;
  owned: number;
  ownedCopies: number;
  mythicsDiscovered: number;
  complete: boolean;
}

/** Lifetime discoveries and present copies are deliberately independent. Unknown IDs never count. */
export function deriveClubCollection(discoveredItemIds: readonly string[], ownedItemIds: readonly string[]): ClubCollectionProgress[] {
  const discovered = new Set(discoveredItemIds);
  const quantities = new Map<string, number>();
  for (const id of ownedItemIds) if (getCosmeticById(id)) quantities.set(id, (quantities.get(id) ?? 0) + 1);
  return CLUBS.map(club => {
    const items = getCollectorClubItems(club.id);
    let found = 0, owned = 0, ownedCopies = 0, mythicsDiscovered = 0;
    for (const item of items) {
      if (discovered.has(item.id)) { found++; if (item.rarity === "MYTHIC") mythicsDiscovered++; }
      const quantity = quantities.get(item.id) ?? 0;
      if (quantity) { owned++; ownedCopies += quantity; }
    }
    return { club, items, discovered: found, owned, ownedCopies, mythicsDiscovered, complete: items.length > 0 && found === items.length };
  });
}

export interface CollectorFilters { query: string; group: string; campus: string; completion: "all" | "complete" | "incomplete"; }
export function filterClubCollection(rows: readonly ClubCollectionProgress[], filters: CollectorFilters) {
  const terms = normalizeClubSearch(filters.query).trim().split(/\s+/).filter(Boolean);
  return rows.filter(row => (!filters.group || row.club.group === filters.group) && (!filters.campus || row.club.campus === filters.campus) &&
    (filters.completion === "all" || row.complete === (filters.completion === "complete")) &&
    terms.every(term => searchableClubs.get(row.club.id)?.includes(term)));
}

/** Only actual, owned Mythics can become showroom exhibits; repeats consume no extra slots. */
export function selectFeaturedMythics(featuredItemIds: readonly string[], ownedItemIds?: readonly string[]): CosmeticItem[] {
  const owned = ownedItemIds ? new Set(ownedItemIds) : null;
  const selected = new Set<string>();
  const result: CosmeticItem[] = [];
  for (const id of featuredItemIds) {
    const item = getCosmeticById(id);
    if (!item || item.rarity !== "MYTHIC" || selected.has(id) || (owned && !owned.has(id))) continue;
    selected.add(id); result.push(item);
    if (result.length === 3) break;
  }
  return result;
}
