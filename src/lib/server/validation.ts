import { copyArcadeSettings, validateArcadeSettings } from "../../data/economyConfig";
import type { BackendCommand } from "../../types/backend";
import { EVENT_TASKS, FORGE_COIN_STEP, FORGE_MIN_COINS, FORGE_MAX_COINS, MAX_MARKET_PRICE } from "../../data/eventEconomy";
import type { EventId, MarketFilters } from "../../types/economy";
import { getCosmeticById } from "../../data/cosmetics";
import { getClubById } from "../../data/clubs";
import type { Rarity } from "../../types/gamification";
import { validCollectorProfile } from "../../lib/collectorValidation";
import { getSeasonAvatar, SEASON_MISSIONS } from "../../data/seasonCatalog";
import type { SeasonMissionId } from "../../types/season";

export class CommandValidationError extends Error {
  readonly code = "INVALID_REQUEST";
  constructor() { super("Yêu cầu không hợp lệ."); }
}

const rarities = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
const tradeRarities = ["COMMON", "UNCOMMON", "RARE", "EPIC"];
const slots = ["LOGO", "AVATAR", "TITLE", "FRAME", "EFFECT"];
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const isItemId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\u0000-\u0020\u007f]/.test(value);

export const isUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Bounded, catalog-aware filters; every value becomes a SQL bound parameter. */
export function validateMarketFilters(value: unknown): MarketFilters {
  const fields = ["query", "rarity", "clubId", "itemId", "minPrice", "maxPrice", "sort", "wishlistOnly"];
  if (!isObject(value) || Object.keys(value).some(key => !fields.includes(key))) throw new CommandValidationError();
  const result: MarketFilters = {};
  if (Object.hasOwn(value, "query")) {
    if (typeof value.query !== "string" || value.query.length > 80 || /[\p{Cc}\p{Cf}]/u.test(value.query)) throw new CommandValidationError();
    result.query = value.query.trim();
  }
  if (Object.hasOwn(value, "rarity")) {
    if (typeof value.rarity !== "string" || !rarities.includes(value.rarity)) throw new CommandValidationError();
    result.rarity = value.rarity as Rarity;
  }
  if (Object.hasOwn(value, "clubId")) {
    if (!isItemId(value.clubId) || !getClubById(value.clubId)) throw new CommandValidationError();
    result.clubId = value.clubId;
  }
  if (Object.hasOwn(value, "itemId")) {
    if (!isItemId(value.itemId) || !getCosmeticById(value.itemId)) throw new CommandValidationError();
    result.itemId = value.itemId;
  }
  for (const field of ["minPrice", "maxPrice"] as const) {
    if (Object.hasOwn(value, field)) {
      const price = value[field];
      if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 0 || price > MAX_MARKET_PRICE) throw new CommandValidationError();
      result[field] = price;
    }
  }
  if (result.minPrice !== undefined && result.maxPrice !== undefined && result.minPrice > result.maxPrice) throw new CommandValidationError();
  if (Object.hasOwn(value, "sort")) {
    if (value.sort !== "newest" && value.sort !== "price-asc" && value.sort !== "price-desc") throw new CommandValidationError();
    result.sort = value.sort;
  }
  if (Object.hasOwn(value, "wishlistOnly")) {
    if (typeof value.wishlistOnly !== "boolean") throw new CommandValidationError();
    result.wishlistOnly = value.wishlistOnly;
  }
  return result;
}

export function parseMarketQuery(params: URLSearchParams): { cursor?: string; filters: MarketFilters } {
  const fields = ["cursor", "query", "rarity", "clubId", "itemId", "minPrice", "maxPrice", "sort", "wishlistOnly"];
  const raw: Record<string, unknown> = {};
  let cursor: string | undefined;
  for (const [key, value] of params) {
    if (!fields.includes(key) || params.getAll(key).length !== 1 || value === "") throw new CommandValidationError();
    if (key === "cursor") { if (!isUuid(value)) throw new CommandValidationError(); cursor = value.toLowerCase(); }
    else if (key === "minPrice" || key === "maxPrice") { if (!/^\d{1,10}$/.test(value)) throw new CommandValidationError(); raw[key] = Number(value); }
    else if (key === "wishlistOnly") { if (value !== "true" && value !== "false") throw new CommandValidationError(); raw[key] = value === "true"; }
    else raw[key] = value;
  }
  return { cursor, filters: validateMarketFilters(raw) };
}

/** Build a narrow DTO; reject extra fields instead of ever accepting client state. */
export function validateCommand(value: unknown): BackendCommand {
  if (!isObject(value)) throw new CommandValidationError();
  switch (value.type) {
    case "play":
      if (exactKeys(value, ["type", "game"]) && (value.game === "chest" || value.game === "orbit")) {
        return { type: "play", game: value.game };
      }
      break;
    case "trade-up":
      if (exactKeys(value, ["type", "itemIds"]) && Array.isArray(value.itemIds) &&
          value.itemIds.length === 5 && value.itemIds.every(isItemId)) {
        return { type: "trade-up", itemIds: [...value.itemIds] };
      }
      break;
    case "claim-event":
      if (exactKeys(value, ["type", "eventId"]) && EVENT_TASKS.some(task => task.id === value.eventId)) {
        return { type: "claim-event", eventId: value.eventId as EventId };
      }
      break;
    case "claim-season-mission":
      if (exactKeys(value, ["type", "missionId", "day"]) && SEASON_MISSIONS.some(m => m.id === value.missionId) &&
        typeof value.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.day)) {
        return { type: "claim-season-mission", missionId: value.missionId as SeasonMissionId, day: value.day };
      }
      break;
    case "redeem-season-avatar":
      if (exactKeys(value, ["type", "itemId"]) && isItemId(value.itemId) && getSeasonAvatar(value.itemId)) {
        return { type: "redeem-season-avatar", itemId: value.itemId };
      }
      break;
    case "forge-mythic":
      if (exactKeys(value, ["type", "itemIds", "coins"]) && Array.isArray(value.itemIds) &&
          value.itemIds.length === 5 && value.itemIds.every(isItemId) && typeof value.coins === "number" &&
          Number.isSafeInteger(value.coins) && value.coins >= FORGE_MIN_COINS && value.coins <= FORGE_MAX_COINS && value.coins % FORGE_COIN_STEP === 0) {
        return { type: "forge-mythic", itemIds: [...value.itemIds], coins: value.coins };
      }
      break;
    case "market-list":
      if ((exactKeys(value, ["type", "itemId", "price"]) || (exactKeys(value, ["type", "itemId", "price", "copyId"]) && isUuid(value.copyId))) && isItemId(value.itemId) && typeof value.price === "number" &&
          Number.isSafeInteger(value.price) && value.price > 0 && value.price <= MAX_MARKET_PRICE) {
        return { type: "market-list", itemId: value.itemId, price: value.price, ...(typeof value.copyId === "string" ? { copyId: value.copyId.toLowerCase() } : {}) };
      }
      break;
    case "profile-update":
      if (exactKeys(value, ["type", "displayName", "bio", "isPublic", "featuredItemIds"]) && validCollectorProfile(value)) {
        return { type: "profile-update", displayName: value.displayName.trim(), bio: value.bio.trim(), isPublic: value.isPublic, featuredItemIds: [...value.featuredItemIds] };
      }
      break;
    case "copy-lock":
      if (exactKeys(value, ["type", "copyId", "locked"]) && isUuid(value.copyId) && typeof value.locked === "boolean") {
        return { type: "copy-lock", copyId: value.copyId.toLowerCase(), locked: value.locked };
      }
      break;
    case "wishlist-update":
      if (exactKeys(value, ["type", "itemId", "wished"]) && isItemId(value.itemId) && getCosmeticById(value.itemId) && typeof value.wished === "boolean") {
        return { type: "wishlist-update", itemId: value.itemId, wished: value.wished };
      }
      break;
    case "market-buy":
    case "market-cancel":
      if (exactKeys(value, ["type", "listingId"]) && isUuid(value.listingId)) return { type: value.type, listingId: value.listingId.toLowerCase() };
      break;
    case "equip":
      if (exactKeys(value, ["type", "itemId"]) && isItemId(value.itemId)) return { type: "equip", itemId: value.itemId };
      break;
    case "unequip":
      if (exactKeys(value, ["type", "slot"]) && typeof value.slot === "string" && slots.includes(value.slot)) {
        return { type: "unequip", slot: value.slot as Extract<BackendCommand, { type: "unequip" }>["slot"] };
      }
      break;
    case "settings": {
      const settings = value.settings;
      if (exactKeys(value, ["type", "settings"]) && isObject(settings) &&
          exactKeys(settings, ["chestOdds", "tradeUpOdds"]) && isObject(settings.chestOdds) &&
          exactKeys(settings.chestOdds, rarities) && isObject(settings.tradeUpOdds) &&
          exactKeys(settings.tradeUpOdds, tradeRarities) && validateArcadeSettings(settings)) {
        return { type: "settings", settings: copyArcadeSettings(settings) };
      }
      break;
    }
    case "grant-test-ex":
    case "reset-demo":
      if (exactKeys(value, ["type"])) return { type: value.type };
      break;
    case "import-legacy":
      if (exactKeys(value, ["type", "raw"]) && typeof value.raw === "string" &&
          value.raw.length > 0 && value.raw.length <= 1_048_576) return { type: "import-legacy", raw: value.raw };
      break;
  }
  throw new CommandValidationError();
}
