import type { ChestReward, Rarity } from "./gamification";

export type EventId = "daily-visit" | "open-three" | "open-ten" | "trade-once";
export interface ForgeRecord {
  id: string; timestamp: string; inputItemIds: string[]; coins: number; chance: number;
  won: boolean; rewardItemId?: string;
  /** Missing only on receipts created before the paid-only, 25% cap rules. */
  ruleVersion?: 2;
}
export interface PlayerEconomy {
  coinBalance: number;
  day: string;
  progress: { chests: number; trades: number };
  claimedEventIds: EventId[];
  forgeHistory: ForgeRecord[];
}
export interface MarketListing {
  id: string; itemId: string; sellerId: string; price: number; createdAt: string;
}
export interface MarketPage {
  listings: MarketListing[];
  ownListings: MarketListing[];
  nextCursor: string | null;
  history?: MarketTransaction[];
  priceSummary?: MarketPriceSummary | null;
  wishlistMatches?: number;
}
export interface MarketFilters {
  query?: string; rarity?: Rarity; clubId?: string; itemId?: string;
  minPrice?: number; maxPrice?: number; sort?: "newest" | "price-asc" | "price-desc"; wishlistOnly?: boolean;
}
export interface MarketTransaction {
  listingId: string; itemId: string; price: number; completedAt: string; side: "buy" | "sell";
}
export interface MarketPriceSummary {
  itemId: string; salesCount: number; minPrice: number; maxPrice: number; averagePrice: number; lastPrice: number;
}
export type EconomyCommand =
  | { type: "claim-season-mission"; missionId: import("./season").SeasonMissionId; day: string }
  | { type: "redeem-season-avatar"; itemId: string }
  | { type: "claim-event"; eventId: EventId }
  | { type: "forge-mythic"; itemIds: string[]; coins: number }
  | { type: "market-list"; itemId: string; price: number; copyId?: string }
  | { type: "market-buy"; listingId: string }
  | { type: "market-cancel"; listingId: string };
export interface EconomyResult {
  success: boolean;
  reason?: string;
  id?: string;
  coinsAwarded?: number;
  pointsAwarded?: number;
  listingId?: string;
  won?: boolean;
  chance?: number;
  reward?: ChestReward | null;
}
