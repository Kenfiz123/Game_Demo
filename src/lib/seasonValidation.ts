import { getSeasonAvatar, SEASON_COSTS, SEASON_MISSIONS } from "@/data/seasonCatalog";
import type { SeasonProgress } from "@/types/season";
export function isSeasonProgress(value: unknown): value is SeasonProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = ["seasonId", "day", "points", "earnedPoints", "claimedMissionIds", "redeemedItemIds"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) return false;
  const s = value as SeasonProgress;
  if (s.seasonId !== "S1" || typeof s.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.day) ||
    !Number.isFinite(Date.parse(s.day + "T00:00:00Z")) || new Date(s.day + "T00:00:00Z").toISOString().slice(0, 10) !== s.day ||
    !Number.isSafeInteger(s.points) || s.points < 0 || !Number.isSafeInteger(s.earnedPoints) || s.earnedPoints < s.points ||
    !Array.isArray(s.claimedMissionIds) || s.claimedMissionIds.length > SEASON_MISSIONS.length ||
    new Set(s.claimedMissionIds).size !== s.claimedMissionIds.length || !s.claimedMissionIds.every(id => SEASON_MISSIONS.some(m => m.id === id)) ||
    !Array.isArray(s.redeemedItemIds) || s.redeemedItemIds.length > 146 || new Set(s.redeemedItemIds).size !== s.redeemedItemIds.length) return false;
  let spent = 0;
  for (const id of s.redeemedItemIds) {
    const item = typeof id === "string" ? getSeasonAvatar(id) : undefined;
    if (!item || (item.rarity !== "LEGENDARY" && item.rarity !== "MYTHIC")) return false;
    spent += SEASON_COSTS[item.rarity];
  }
  return s.earnedPoints - s.points === spent;
}
