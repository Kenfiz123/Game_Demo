export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";
export type CosmeticType = "FRAME" | "BACKGROUND" | "TITLE" | "BADGE" | "NAMEPLATE" | "EFFECT" | "EMOTE" | "LOGO" | "AVATAR";
export type GameId = "chest" | "orbit";
export type GamePhase = "idle" | "charging" | "rolling" | "settling" | "result";
export type MythicVariant = "PRISM" | "SOVEREIGN" | "AURORA" | "CELESTIAL" | "LEGACY" | "PHOENIX" | "COMET" | "REGALIA";
export type EquipSlot = "LOGO" | "AVATAR" | "TITLE" | "FRAME" | "EFFECT";
export type EquippedSlot = EquipSlot;
export interface CosmeticItem {
  id: string; name: string; description: string; rarity: Rarity; type: CosmeticType; image?: string; clubId?: string;
  mythicVariant?: MythicVariant;
  /** Symbolic creative tribute, never an endorsement or membership claim. */
  heritage?: string;
}
export interface ChestRarityConfig {
  rarity: Rarity; label: string; probability: number; color: string; glow: string;
}
export interface OpeningHistoryRecord {
  id: string; itemId: string; itemName: string; rarity: Rarity; cost: number;
  timestamp: string; isDuplicate: boolean; compensation: number; game?: GameId;
}
export type TradeInputRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC";
export type TradeTargetRarity = "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
export interface ArcadeSettings {
  chestOdds: Record<Rarity, number>;
  tradeUpOdds: Record<TradeInputRarity, number>;
}
export interface TradeUpHistoryRecord {
  id: string; inputItemIds: string[]; inputRarity: TradeInputRarity; targetRarity: TradeTargetRarity;
  chance: number; won: boolean; timestamp: string;
  rewardItemId?: string; rewardItemName?: string; isDuplicate?: boolean;
}
export interface XperienceState {
  version: 2; exPoints: number;
  /** A multiset: repeated IDs represent independently consumable copies. */
  ownedItemIds: string[];
  history: OpeningHistoryRecord[];
  tradeHistory: TradeUpHistoryRecord[];
  settings: ArcadeSettings;
  equipped: Partial<Record<EquipSlot, string>>;
}
export interface ChestReward { item: CosmeticItem; isDuplicate: boolean; compensation: number; }
export interface OpeningSuccess { success: true; reward: ChestReward; id: string; sectorIndex?: number; }
export interface OpeningFailure {
  success: false; reason: "INSUFFICIENT_EX" | "BUSY" | "NOT_READY" | "STORAGE_UNAVAILABLE" | "INVALID_SETTINGS";
}
export type OpeningAttempt = OpeningSuccess | OpeningFailure;
export interface TradeUpSuccess {
  /** True means the contract was processed, not that its roll won. */
  success: true; id: string; won: boolean; inputRarity: TradeInputRarity;
  targetRarity: TradeTargetRarity; chance: number; reward: ChestReward | null;
}
export interface TradeUpFailure {
  success: false;
  reason: "INVALID_SELECTION" | "INSUFFICIENT_ITEMS" | "UNSUPPORTED_RARITY" | "BUSY" | "NOT_READY" | "STORAGE_UNAVAILABLE" | "INVALID_SETTINGS";
}
export type TradeUpAttempt = TradeUpSuccess | TradeUpFailure;
