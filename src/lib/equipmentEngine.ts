import { getCosmeticById } from "@/data/cosmetics";
import type { CosmeticItem, EquipSlot, XperienceState } from "@/types/gamification";

export const EQUIP_SLOTS = ["LOGO", "AVATAR", "TITLE", "FRAME", "EFFECT"] as const satisfies readonly EquipSlot[];
export const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  LOGO: "Logo", AVATAR: "Avatar", TITLE: "Danh hiệu", FRAME: "Khung", EFFECT: "Hiệu ứng",
};
const isSlot = (value: string): value is EquipSlot => EQUIP_SLOTS.includes(value as EquipSlot);
export function getEquipSlot(item: CosmeticItem): EquipSlot | null {
  return (item.rarity === "MYTHIC" || item.seasonId === "S1" && item.type === "AVATAR") && isSlot(item.type) ? item.type : null;
}
export function sanitizeEquipped(value: unknown, ownedItemIds: readonly string[]): Partial<Record<EquipSlot, string>> {
  const equipped: Partial<Record<EquipSlot, string>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return equipped;
  const owned = new Set(ownedItemIds);
  for (const [slot, id] of Object.entries(value)) {
    if (!isSlot(slot) || typeof id !== "string" || !owned.has(id)) continue;
    const item = getCosmeticById(id);
    if (item && getEquipSlot(item) === slot) equipped[slot] = id;
  }
  return equipped;
}
export function validateEquipped(value: unknown, ownedItemIds: readonly string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const valid = sanitizeEquipped(value, ownedItemIds);
  const entries = Object.entries(value);
  return entries.length === Object.keys(valid).length && entries.every(([slot, id]) => isSlot(slot) && valid[slot] === id);
}
/** Equipping selects a loadout slot; it never consumes an inventory copy. */
export function equipItemInState(state: XperienceState, id: string, requestedSlot?: EquipSlot): XperienceState | null {
  const item = getCosmeticById(id);
  if (!item || !state.ownedItemIds.includes(id)) return null;
  const slot = getEquipSlot(item);
  if (!slot || (requestedSlot !== undefined && requestedSlot !== slot)) return null;
  return { ...state, equipped: { ...state.equipped, [slot]: id } };
}
export function unequipItemInState(state: XperienceState, slot: EquipSlot): XperienceState | null {
  if (!isSlot(slot)) return null;
  const equipped = { ...state.equipped };
  delete equipped[slot];
  return { ...state, equipped };
}
