import type { DatabaseSync } from "node:sqlite";
import { economyDay } from "@/data/eventEconomy";
import { emptySeason, getSeasonAvatar, SEASON_COSTS, SEASON_MISSIONS } from "@/data/seasonCatalog";
import { isSeasonProgress } from "@/lib/seasonValidation";
import type { SeasonMissionId, SeasonProgress } from "@/types/season";
import type { EconomyResult, PlayerEconomy } from "@/types/economy";
import { StoreError } from "./storeError";

export class SeasonStore {
  constructor(private db: DatabaseSync, private now: () => number) {}
  /** Called with foreign keys disabled before the enclosing migration transaction. */
  migrate(): void {
    this.db.exec(`
      CREATE TABLE item_copies_s1 (
        id TEXT PRIMARY KEY, item_id TEXT NOT NULL, serial TEXT NOT NULL UNIQUE,
        owner_id TEXT NOT NULL REFERENCES players(id), status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'ESCROW', 'CONSUMED')),
        listing_id TEXT UNIQUE REFERENCES market_listings(id),
        origin TEXT NOT NULL CHECK(origin IN ('CHEST', 'ORBIT', 'TRADE_UP', 'FORGE', 'LEGACY', 'IMPORT', 'SEASON')),
        minted_at TEXT, recorded_at TEXT NOT NULL, acquired_at TEXT NOT NULL,
        original_owner_name TEXT, transfer_count INTEGER NOT NULL DEFAULT 0 CHECK(transfer_count >= 0),
        locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0, 1)),
        CHECK((status = 'ESCROW' AND listing_id IS NOT NULL) OR (status <> 'ESCROW' AND listing_id IS NULL))
      ) STRICT;
      INSERT INTO item_copies_s1 SELECT id, item_id, serial, owner_id, status, listing_id, origin, minted_at,
        recorded_at, acquired_at, original_owner_name, transfer_count, locked FROM item_copies;
      DROP TABLE item_copies;
      ALTER TABLE item_copies_s1 RENAME TO item_copies;
      CREATE INDEX item_copy_owner ON item_copies(owner_id, status, acquired_at, id);
      CREATE TABLE player_seasons (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        season_json TEXT NOT NULL CHECK(json_valid(season_json))
      ) STRICT;
      PRAGMA user_version = 5;
    `);
    this.db.prepare("INSERT INTO player_seasons SELECT id, ? FROM players").run(JSON.stringify(emptySeason(this.now())));
  }
  verifySchema(): void { this.db.prepare("SELECT season_json FROM player_seasons LIMIT 1").get(); }
  initializePlayer(playerId: string): void {
    this.db.prepare("INSERT INTO player_seasons VALUES (?, ?)").run(playerId, JSON.stringify(emptySeason(this.now())));
  }
  snapshot(playerId: string): SeasonProgress {
    const row = this.db.prepare("SELECT season_json FROM player_seasons WHERE player_id = ?").get(playerId);
    const season: unknown = row && typeof row.season_json === "string" ? JSON.parse(row.season_json) : null;
    if (!isSeasonProgress(season)) throw new StoreError("STORAGE_UNAVAILABLE");
    return season.day === economyDay(this.now()) ? season : { ...season, day: economyDay(this.now()), claimedMissionIds: [] };
  }
  private save(playerId: string, season: SeasonProgress): void {
    this.db.prepare("UPDATE player_seasons SET season_json = ? WHERE player_id = ?").run(JSON.stringify(season), playerId);
  }
  claim(playerId: string, economy: PlayerEconomy, missionId: SeasonMissionId, day: string): EconomyResult {
    const season = this.snapshot(playerId);
    if (day !== season.day) return { success: false, reason: "SEASON_DAY_CHANGED" };
    const mission = SEASON_MISSIONS.find(m => m.id === missionId);
    if (!mission) return { success: false, reason: "INVALID_SELECTION" };
    if (season.claimedMissionIds.includes(missionId)) return { success: false, reason: "ALREADY_CLAIMED" };
    const progress = mission.metric === "visit" ? 1 : economy.day === season.day ? economy.progress[mission.metric] : 0;
    if (progress < mission.target) return { success: false, reason: "EVENT_NOT_READY" };
    if (!Number.isSafeInteger(season.earnedPoints + mission.points)) return { success: false, reason: "POINT_LIMIT" };
    this.save(playerId, { ...season, points: season.points + mission.points, earnedPoints: season.earnedPoints + mission.points, claimedMissionIds: [...season.claimedMissionIds, missionId] });
    return { success: true, pointsAwarded: mission.points };
  }
  redeem(playerId: string, itemId: string): EconomyResult {
    const season = this.snapshot(playerId);
    const item = getSeasonAvatar(itemId);
    if (!item || (item.rarity !== "LEGENDARY" && item.rarity !== "MYTHIC")) return { success: false, reason: "INVALID_SELECTION" };
    if (season.redeemedItemIds.includes(itemId)) return { success: false, reason: "ALREADY_REDEEMED" };
    const cost = SEASON_COSTS[item.rarity];
    if (season.points < cost) return { success: false, reason: "INSUFFICIENT_SEASON_POINTS" };
    this.save(playerId, { ...season, points: season.points - cost, redeemedItemIds: [...season.redeemedItemIds, itemId] });
    return { success: true, reward: { item, isDuplicate: false, compensation: 0 } };
  }
}
