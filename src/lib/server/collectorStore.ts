import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getCosmeticById } from "@/data/cosmetics";
import type { CollectorProfile, CollectorSnapshot, ItemCopy, ItemOrigin, ItemPassport, ItemTrailEntry } from "@/types/collector";
import { validBio, validDisplayName } from "./accounts";
import { StoreError } from "./storeError";

interface CopyRow {
  id: string; item_id: string; serial: string; owner_id: string; status: "ACTIVE" | "ESCROW" | "CONSUMED";
  listing_id: string | null; origin: ItemOrigin; minted_at: string | null; recorded_at: string; acquired_at: string;
  original_owner_name: string | null; transfer_count: number; locked: number;
}
export function validCollectorProfile(value: unknown): value is CollectorProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return Object.keys(profile).every(key => ["displayName", "bio", "isPublic", "featuredItemIds"].includes(key)) &&
    validDisplayName(profile.displayName) && validBio(profile.bio) && typeof profile.isPublic === "boolean" &&
    Array.isArray(profile.featuredItemIds) && profile.featuredItemIds.length <= 3 &&
    profile.featuredItemIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 256) &&
    new Set(profile.featuredItemIds).size === profile.featuredItemIds.length;
}
const copyDTO = (row: CopyRow): ItemCopy => ({
  id: row.id, itemId: row.item_id, serial: row.serial, origin: row.origin, mintedAt: row.minted_at,
  recordedAt: row.recorded_at, acquiredAt: row.acquired_at, originalOwnerName: row.original_owner_name, transferCount: row.transfer_count,
  locked: row.locked === 1,
});

/** Copy identities are mutated inside the parent store's authoritative transaction. */
export class CollectorStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number) {}

  migrate(): void {
    this.db.exec(`
      CREATE TABLE accounts (
        username TEXT PRIMARY KEY CHECK(length(username) BETWEEN 3 AND 24),
        player_id TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
        password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_version INTEGER NOT NULL CHECK(password_version = 1),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE account_attempts (
        username TEXT PRIMARY KEY, window_started INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(attempts >= 0)
      ) STRICT;
      CREATE TABLE collector_profiles (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        profile_json TEXT NOT NULL CHECK(json_valid(profile_json))
      ) STRICT;
      CREATE TABLE item_copies (
        id TEXT PRIMARY KEY, item_id TEXT NOT NULL, serial TEXT NOT NULL UNIQUE,
        owner_id TEXT NOT NULL REFERENCES players(id), status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'ESCROW', 'CONSUMED')),
        listing_id TEXT UNIQUE REFERENCES market_listings(id),
        origin TEXT NOT NULL CHECK(origin IN ('CHEST', 'ORBIT', 'TRADE_UP', 'FORGE', 'LEGACY', 'IMPORT')),
        minted_at TEXT, recorded_at TEXT NOT NULL, acquired_at TEXT NOT NULL,
        original_owner_name TEXT, transfer_count INTEGER NOT NULL DEFAULT 0 CHECK(transfer_count >= 0),
        CHECK((status = 'ESCROW' AND listing_id IS NOT NULL) OR (status <> 'ESCROW' AND listing_id IS NULL))
      ) STRICT;
      CREATE INDEX item_copy_owner ON item_copies(owner_id, status, acquired_at, id);
      CREATE TABLE item_trail (
        id INTEGER PRIMARY KEY, copy_id TEXT NOT NULL REFERENCES item_copies(id),
        kind TEXT NOT NULL CHECK(kind IN ('MINT', 'TRANSFER', 'LIST', 'RETURN', 'CONSUME')),
        timestamp TEXT NOT NULL, owner_name TEXT
      ) STRICT;
      CREATE INDEX item_trail_copy ON item_trail(copy_id, id);
      CREATE TABLE collector_discoveries (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, item_id TEXT NOT NULL,
        PRIMARY KEY(player_id, item_id)
      ) STRICT;
    `);
    const players = this.db.prepare("SELECT id, state_json FROM players").all();
    for (const player of players) {
      const state: unknown = JSON.parse(player.state_json as string);
      if (!state || typeof state !== "object" || !("ownedItemIds" in state) || !Array.isArray(state.ownedItemIds) ||
        !state.ownedItemIds.every(id => typeof id === "string")) throw new StoreError("STORAGE_UNAVAILABLE");
      this.initializePlayer(player.id as string);
      for (const id of state.ownedItemIds) this.mint(player.id as string, id, "LEGACY");
    }
    // Existing escrow already belongs to its seller; never mint it into inventory a second time.
    for (const listing of this.db.prepare("SELECT id, item_id, seller_id FROM market_listings WHERE status = 'ACTIVE'").all()) {
      const copy = this.mint(listing.seller_id as string, listing.item_id as string, "LEGACY");
      this.db.prepare("UPDATE item_copies SET status = 'ESCROW', listing_id = ? WHERE id = ?").run(listing.id, copy.id);
    }
    this.db.exec("PRAGMA user_version = 3;");
  }

  verifySchema(): void {
    for (const table of ["accounts", "account_attempts", "collector_profiles", "item_copies", "item_trail", "collector_discoveries", "collector_wishlist"]) {
      this.db.prepare(`SELECT * FROM ${table} LIMIT 1`).get();
    }
    this.db.prepare("SELECT locked FROM item_copies LIMIT 1").get();
  }
  migrateProtection(): void {
    this.db.exec(`ALTER TABLE item_copies ADD COLUMN locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0, 1));
      CREATE TABLE collector_wishlist (
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, item_id TEXT NOT NULL,
        PRIMARY KEY(player_id, item_id)
      ) STRICT;
      CREATE INDEX market_active_price_asc ON market_listings(status, price ASC, created_at DESC, id DESC);
      CREATE INDEX market_active_price_desc ON market_listings(status, price DESC, created_at DESC, id DESC);
      CREATE INDEX market_item_sales ON market_listings(status, item_id, closed_at DESC, id DESC);
      CREATE INDEX market_buyer_history ON market_listings(buyer_id, status, closed_at DESC, id DESC);
      CREATE INDEX market_seller_history ON market_listings(seller_id, status, closed_at DESC, id DESC);
      PRAGMA user_version = 4;`);
  }
  initializePlayer(playerId: string): void {
    const profile: CollectorProfile = { displayName: "Student", bio: "", isPublic: false, featuredItemIds: [] };
    this.db.prepare("INSERT INTO collector_profiles (player_id, profile_json) VALUES (?, ?)").run(playerId, JSON.stringify(profile));
  }
  profile(playerId: string): CollectorProfile {
    const row = this.db.prepare("SELECT profile_json FROM collector_profiles WHERE player_id = ?").get(playerId);
    if (!row || typeof row.profile_json !== "string") throw new StoreError("STORAGE_UNAVAILABLE");
    const profile: unknown = JSON.parse(row.profile_json);
    if (!validCollectorProfile(profile)) throw new StoreError("STORAGE_UNAVAILABLE");
    return profile;
  }
  updateProfile(playerId: string, profile: CollectorProfile, ownedIds: readonly string[]): void {
    if (!validCollectorProfile(profile)) throw new StoreError("INVALID_REQUEST");
    const owned = new Set(ownedIds);
    if (profile.featuredItemIds.some(id => !owned.has(id) || getCosmeticById(id)?.rarity !== "MYTHIC")) throw new StoreError("INVALID_REQUEST");
    this.db.prepare("UPDATE collector_profiles SET profile_json = ? WHERE player_id = ?").run(JSON.stringify(profile), playerId);
  }
  pruneFeatures(playerId: string, ownedIds: readonly string[]): void {
    const profile = this.profile(playerId);
    const owned = new Set(ownedIds);
    const featuredItemIds = profile.featuredItemIds.filter(id => owned.has(id) && getCosmeticById(id)?.rarity === "MYTHIC");
    if (featuredItemIds.length !== profile.featuredItemIds.length) {
      this.db.prepare("UPDATE collector_profiles SET profile_json = ? WHERE player_id = ?").run(JSON.stringify({ ...profile, featuredItemIds }), playerId);
    }
  }
  private ownerName(playerId: string): string | null {
    return this.db.prepare("SELECT 1 FROM accounts WHERE player_id = ?").get(playerId) ? this.profile(playerId).displayName : null;
  }
  private discover(playerId: string, itemId: string): void {
    if (getCosmeticById(itemId)) this.db.prepare("INSERT OR IGNORE INTO collector_discoveries (player_id, item_id) VALUES (?, ?)").run(playerId, itemId);
  }
  private trail(copyId: string, kind: ItemTrailEntry["kind"], playerId: string): void {
    this.db.prepare("INSERT INTO item_trail (copy_id, kind, timestamp, owner_name) VALUES (?, ?, ?, ?)")
      .run(copyId, kind, new Date(this.now()).toISOString(), this.ownerName(playerId));
  }
  mint(playerId: string, itemId: string, origin: ItemOrigin): ItemCopy {
    const id = randomUUID();
    const timestamp = new Date(this.now()).toISOString();
    // Imported/legacy saves cannot establish who originally minted a particular copy.
    const originalOwnerName = origin === "LEGACY" || origin === "IMPORT" ? null : this.ownerName(playerId);
    this.db.prepare(`INSERT INTO item_copies (id, item_id, serial, owner_id, status, origin, minted_at, recorded_at, acquired_at, original_owner_name)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`).run(id, itemId, `XP-${id.replaceAll("-", "").toUpperCase()}`, playerId,
      origin, origin === "LEGACY" || origin === "IMPORT" ? null : timestamp, timestamp, timestamp, originalOwnerName);
    this.discover(playerId, itemId);
    if (origin !== "LEGACY") this.trail(id, "MINT", playerId);
    return this.copyById(id)!;
  }
  private copyById(id: string): ItemCopy | null {
    const row = this.db.prepare("SELECT * FROM item_copies WHERE id = ?").get(id) as unknown as CopyRow | undefined;
    return row ? copyDTO(row) : null;
  }
  selectOwnedCopy(playerId: string, itemId: string, copyId?: string): ItemCopy | null {
    const row = (copyId
      ? this.db.prepare("SELECT * FROM item_copies WHERE owner_id = ? AND item_id = ? AND status = 'ACTIVE' AND id = ?").get(playerId, itemId, copyId.toLowerCase())
      : this.db.prepare("SELECT * FROM item_copies WHERE owner_id = ? AND item_id = ? AND status = 'ACTIVE' AND locked = 0 ORDER BY acquired_at, rowid LIMIT 1").get(playerId, itemId)) as unknown as CopyRow | undefined;
    return row ? copyDTO(row) : null;
  }
  hasLockedObstruction(playerId: string, itemIds: readonly string[]): boolean {
    const requested = new Map<string, number>();
    for (const id of itemIds) requested.set(id, (requested.get(id) ?? 0) + 1);
    let blocked = false;
    for (const [id, needed] of requested) {
      const counts = this.db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN locked = 0 THEN 1 ELSE 0 END) AS unlocked FROM item_copies WHERE owner_id = ? AND item_id = ? AND status = 'ACTIVE'")
        .get(playerId, id)!;
      // Let the original engines report malformed or truly insufficient selections.
      if ((counts.total as number) < needed) return false;
      if (((counts.unlocked as number | null) ?? 0) < needed) blocked = true;
    }
    return blocked;
  }
  setLocked(playerId: string, copyId: string, locked: boolean): boolean {
    return this.db.prepare("UPDATE item_copies SET locked = ? WHERE owner_id = ? AND id = ? AND status = 'ACTIVE'")
      .run(locked ? 1 : 0, playerId, copyId.toLowerCase()).changes === 1;
  }
  wishlist(playerId: string): string[] {
    return this.db.prepare("SELECT item_id FROM collector_wishlist WHERE player_id = ? ORDER BY item_id").all(playerId)
      .map(row => row.item_id as string).filter(id => !!getCosmeticById(id));
  }
  updateWishlist(playerId: string, itemId: string, wished: boolean): boolean {
    if (!getCosmeticById(itemId)) throw new StoreError("INVALID_REQUEST");
    if (!wished) { this.db.prepare("DELETE FROM collector_wishlist WHERE player_id = ? AND item_id = ?").run(playerId, itemId); return true; }
    const existing = this.db.prepare("SELECT 1 FROM collector_wishlist WHERE player_id = ? AND item_id = ?").get(playerId, itemId);
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM collector_wishlist WHERE player_id = ?").get(playerId)!.count as number;
    if (!existing && count >= 200) return false;
    this.db.prepare("INSERT OR IGNORE INTO collector_wishlist (player_id, item_id) VALUES (?, ?)").run(playerId, itemId);
    return true;
  }
  consume(playerId: string, itemIds: readonly string[]): void {
    for (const itemId of itemIds) {
      const copy = this.selectOwnedCopy(playerId, itemId);
      if (!copy) throw new StoreError("STORAGE_UNAVAILABLE");
      this.db.prepare("UPDATE item_copies SET status = 'CONSUMED' WHERE id = ?").run(copy.id);
      this.trail(copy.id, "CONSUME", playerId);
    }
  }
  reset(playerId: string): void {
    const rows = this.db.prepare("SELECT id FROM item_copies WHERE owner_id = ? AND status IN ('ACTIVE', 'ESCROW')").all(playerId);
    for (const row of rows) this.trail(row.id as string, "CONSUME", playerId);
    this.db.prepare("UPDATE item_copies SET status = 'CONSUMED', listing_id = NULL WHERE owner_id = ? AND status IN ('ACTIVE', 'ESCROW')").run(playerId);
  }
  list(playerId: string, copyId: string, listingId: string): void {
    const updated = this.db.prepare("UPDATE item_copies SET status = 'ESCROW', listing_id = ? WHERE id = ? AND owner_id = ? AND status = 'ACTIVE' AND locked = 0")
      .run(listingId, copyId, playerId);
    if (updated.changes !== 1) throw new StoreError("STORAGE_UNAVAILABLE");
    this.trail(copyId, "LIST", playerId);
  }
  returnListing(playerId: string, listingId: string): void {
    const row = this.db.prepare("SELECT * FROM item_copies WHERE owner_id = ? AND listing_id = ? AND status = 'ESCROW'").get(playerId, listingId) as unknown as CopyRow | undefined;
    if (!row) throw new StoreError("STORAGE_UNAVAILABLE");
    this.db.prepare("UPDATE item_copies SET status = 'ACTIVE', listing_id = NULL WHERE id = ?").run(row.id);
    this.trail(row.id, "RETURN", playerId);
  }
  transferListing(sellerId: string, buyerId: string, listingId: string): void {
    const row = this.db.prepare("SELECT * FROM item_copies WHERE owner_id = ? AND listing_id = ? AND status = 'ESCROW'").get(sellerId, listingId) as unknown as CopyRow | undefined;
    if (!row) throw new StoreError("STORAGE_UNAVAILABLE");
    this.db.prepare("UPDATE item_copies SET status = 'ACTIVE', listing_id = NULL, owner_id = ?, acquired_at = ?, transfer_count = transfer_count + 1 WHERE id = ?")
      .run(buyerId, new Date(this.now()).toISOString(), row.id);
    this.discover(buyerId, row.item_id);
    this.trail(row.id, "TRANSFER", buyerId);
  }
  snapshot(playerId: string, ownedIds: readonly string[]): CollectorSnapshot {
    const rows = this.db.prepare("SELECT * FROM item_copies WHERE owner_id = ? AND status = 'ACTIVE' ORDER BY acquired_at, rowid").all(playerId) as unknown as CopyRow[];
    // Catalog IDs stay duplicated in the save; every active copy must agree exactly.
    const counts = new Map<string, number>();
    for (const id of ownedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const row of rows) counts.set(row.item_id, (counts.get(row.item_id) ?? 0) - 1);
    if ([...counts.values()].some(count => count !== 0)) throw new StoreError("STORAGE_UNAVAILABLE");
    return {
      profile: this.profile(playerId), copies: rows.map(copyDTO),
      discoveredItemIds: this.db.prepare("SELECT item_id FROM collector_discoveries WHERE player_id = ? ORDER BY item_id").all(playerId)
        .map(row => row.item_id as string).filter(id => !!getCosmeticById(id)),
      wishlistItemIds: this.wishlist(playerId),
    };
  }
  passport(playerId: string, copyId: string): ItemPassport | null {
    const row = this.db.prepare("SELECT * FROM item_copies WHERE id = ? AND owner_id = ? AND status <> 'CONSUMED'")
      .get(copyId.toLowerCase(), playerId) as unknown as CopyRow | undefined;
    if (!row) return null;
    const trail = this.db.prepare("SELECT kind, timestamp, owner_name FROM item_trail WHERE copy_id = ? ORDER BY id").all(row.id)
      .map(entry => ({ kind: entry.kind, timestamp: entry.timestamp, ownerName: entry.owner_name })) as ItemTrailEntry[];
    return { copy: copyDTO(row), trail };
  }
}
