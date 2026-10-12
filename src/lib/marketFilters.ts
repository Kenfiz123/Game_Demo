import { CLUBS } from "@/data/clubs";
import { getCosmeticById } from "@/data/cosmetics";
import { MAX_MARKET_PRICE } from "@/data/eventEconomy";
import type { ItemCopy } from "@/types/collector";
import type { MarketFilters, MarketPage } from "@/types/economy";
import type { Rarity } from "@/types/gamification";

export const MARKET_RARITIES: readonly Rarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
const clubIds = new Set(CLUBS.map(club => club.id));
export interface MarketFilterDraft {
  query: string; rarity: string; clubId: string; itemId: string;
  minPrice: string; maxPrice: string; sort: "newest" | "price-asc" | "price-desc"; wishlistOnly: boolean;
}
export const emptyMarketDraft = (): MarketFilterDraft => ({ query: "", rarity: "", clubId: "", itemId: "", minPrice: "", maxPrice: "", sort: "newest", wishlistOnly: false });

export function marketDraftForItem(itemId: string | null): MarketFilterDraft {
  return { ...emptyMarketDraft(), itemId: itemId && getCosmeticById(itemId) ? itemId : "" };
}

/** Blank inputs are omitted, never coerced to a zero-price filter. */
export function validateMarketDraft(draft: MarketFilterDraft): { filters: MarketFilters; error: null } | { filters: null; error: string } {
  const query = draft.query.trim();
  if (query.length > 80 || /[\p{Cc}\p{Cf}]/u.test(query)) return { filters: null, error: "Từ khóa tối đa 80 ký tự và không chứa ký tự điều khiển." };
  if (draft.rarity && !MARKET_RARITIES.includes(draft.rarity as Rarity)) return { filters: null, error: "Chọn độ hiếm hợp lệ." };
  if (draft.clubId && !clubIds.has(draft.clubId)) return { filters: null, error: "Chọn CLB hợp lệ." };
  if (draft.itemId && !getCosmeticById(draft.itemId)) return { filters: null, error: "Vật phẩm trong liên kết không còn hợp lệ." };
  if (!["newest", "price-asc", "price-desc"].includes(draft.sort)) return { filters: null, error: "Chọn cách sắp xếp hợp lệ." };
  const parsePrice = (value: string) => value.trim() === "" ? undefined : /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const minPrice = parsePrice(draft.minPrice), maxPrice = parsePrice(draft.maxPrice);
  if ([minPrice, maxPrice].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > MAX_MARKET_PRICE))) return { filters: null, error: "Giá lọc phải là số nguyên từ 0 đến 1.000.000 XCoin." };
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return { filters: null, error: "Giá thấp nhất không được lớn hơn giá cao nhất." };
  return { error: null, filters: {
    ...(query ? { query } : {}), ...(draft.rarity ? { rarity: draft.rarity as Rarity } : {}),
    ...(draft.clubId ? { clubId: draft.clubId } : {}), ...(draft.itemId ? { itemId: draft.itemId } : {}),
    ...(minPrice === undefined ? {} : { minPrice }), ...(maxPrice === undefined ? {} : { maxPrice }),
    sort: draft.sort, wishlistOnly: draft.wishlistOnly,
  } };
}

/** A missing ledger never falls back to selling an unidentified or locked copy. */
export function marketSellCopies(copies: readonly ItemCopy[], ownedItemIds: readonly string[]): ItemCopy[] {
  const remaining = new Map<string, number>();
  for (const id of ownedItemIds) if (getCosmeticById(id)) remaining.set(id, (remaining.get(id) ?? 0) + 1);
  const seen = new Set<string>();
  const available: ItemCopy[] = [];
  for (const copy of copies) {
    if (!copy.id || seen.has(copy.id) || !getCosmeticById(copy.itemId)) continue;
    seen.add(copy.id);
    const count = remaining.get(copy.itemId) ?? 0;
    if (count <= 0) continue;
    remaining.set(copy.itemId, count - 1);
    if (copy.locked !== true) available.push(copy);
  }
  return available;
}

/** Only fresh server receipts count as sales; disappearing listings might be cancellations. */
export function marketRefreshActivity(previous: MarketPage | null, next: MarketPage) {
  if (!previous) return { newSales: 0, newWishlistMatches: 0 };
  const known = new Set((previous.history ?? []).map(receipt => receipt.listingId));
  return {
    newSales: (next.history ?? []).filter(receipt => receipt.side === "sell" && !known.has(receipt.listingId)).length,
    newWishlistMatches: Math.max(0, (next.wishlistMatches ?? 0) - (previous.wishlistMatches ?? 0)),
  };
}
