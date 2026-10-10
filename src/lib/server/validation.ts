import { copyArcadeSettings, validateArcadeSettings } from "../../data/economyConfig";
import type { BackendCommand } from "../../types/backend";

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
