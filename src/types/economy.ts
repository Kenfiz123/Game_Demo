import type { ChestReward } from "./gamification";

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
}
export type EconomyCommand =
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
  listingId?: string;
  won?: boolean;
  chance?: number;
  reward?: ChestReward | null;
}
