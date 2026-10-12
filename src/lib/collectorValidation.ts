import type { AccountAction, CollectorProfile } from "@/types/collector";

export const validUsername = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_]{3,24}$/.test(value);
export const validPassword = (value: unknown): value is string => typeof value === "string" && value.length >= 12 && value.length <= 128;
export const validDisplayName = (value: unknown): value is string => typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 40 && !/[\p{Cc}\p{Cf}]/u.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) => Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));

export function validCollectorProfile(value: unknown): value is CollectorProfile {
  return object(value) && validDisplayName(value.displayName) && typeof value.bio === "string" && value.bio.length <= 180 &&
    !/[\p{Cc}\p{Cf}]/u.test(value.bio) && typeof value.isPublic === "boolean" &&
    Array.isArray(value.featuredItemIds) && value.featuredItemIds.length <= 3 &&
    value.featuredItemIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 200 && !/[\u0000-\u0020\u007f]/.test(id)) &&
    new Set(value.featuredItemIds).size === value.featuredItemIds.length;
}

/** Credential DTO only: never accept client player IDs, hashes or session tokens. */
export function parseAccountAction(value: unknown): AccountAction | null {
  if (!object(value)) return null;
  if (value.action === "logout" && exact(value, ["action"])) return { action: "logout" };
  if (value.action === "login" && exact(value, ["action", "username", "password"]) && validUsername(value.username) && validPassword(value.password)) {
    return { action: "login", username: value.username.toLowerCase(), password: value.password };
  }
  if (value.action === "register" && exact(value, ["action", "username", "password", "displayName"]) && validUsername(value.username) && validPassword(value.password) && validDisplayName(value.displayName)) {
    return { action: "register", username: value.username.toLowerCase(), password: value.password, displayName: value.displayName.trim() };
  }
  if (value.action === "password" && exact(value, ["action", "currentPassword", "password"]) && validPassword(value.currentPassword) && validPassword(value.password)) {
    return { action: "password", currentPassword: value.currentPassword, password: value.password };
  }
  return null;
}
