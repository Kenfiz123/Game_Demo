import { CHEST_RARITIES } from "./chestConfig";
import type { ArcadeSettings, Rarity, TradeInputRarity, TradeTargetRarity } from "@/types/gamification";

export const TRADE_UP_ITEM_COUNT = 5;
export const DEFAULT_CHEST_ODDS = Object.fromEntries(CHEST_RARITIES.map(entry => [entry.rarity, entry.probability])) as Record<Rarity, number>;
export const TRADE_UP_PATHS: readonly { inputRarity: TradeInputRarity; targetRarity: TradeTargetRarity; defaultChance: number }[] = [
  { inputRarity: "COMMON", targetRarity: "UNCOMMON", defaultChance: 80 },
  { inputRarity: "UNCOMMON", targetRarity: "RARE", defaultChance: 60 },
  { inputRarity: "RARE", targetRarity: "EPIC", defaultChance: 30 },
  { inputRarity: "EPIC", targetRarity: "LEGENDARY", defaultChance: 5 },
];
export const DEFAULT_TRADE_UP_ODDS = Object.fromEntries(TRADE_UP_PATHS.map(path => [path.inputRarity, path.defaultChance])) as Record<TradeInputRarity, number>;
export function createDefaultSettings(): ArcadeSettings {
  return { chestOdds: { ...DEFAULT_CHEST_ODDS }, tradeUpOdds: { ...DEFAULT_TRADE_UP_ODDS } };
}
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isProbability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
export function validateChestOdds(value: unknown): value is Record<Rarity, number> {
  return isObject(value) && CHEST_RARITIES.every(entry => isProbability(value[entry.rarity])) &&
    Math.abs(CHEST_RARITIES.reduce((sum, entry) => sum + (value[entry.rarity] as number), 0) - 100) <= 1e-7;
}
export function validateTradeUpOdds(value: unknown): value is Record<TradeInputRarity, number> {
  return isObject(value) && TRADE_UP_PATHS.every(path => isProbability(value[path.inputRarity]));
}
export function validateArcadeSettings(value: unknown): value is ArcadeSettings {
  return isObject(value) && validateChestOdds(value.chestOdds) && validateTradeUpOdds(value.tradeUpOdds);
}
export function copyArcadeSettings(settings: ArcadeSettings): ArcadeSettings {
  return {
    chestOdds: Object.fromEntries(CHEST_RARITIES.map(entry => [entry.rarity, settings.chestOdds[entry.rarity]])) as Record<Rarity, number>,
    tradeUpOdds: Object.fromEntries(TRADE_UP_PATHS.map(path => [path.inputRarity, settings.tradeUpOdds[path.inputRarity]])) as Record<TradeInputRarity, number>,
  };
}
