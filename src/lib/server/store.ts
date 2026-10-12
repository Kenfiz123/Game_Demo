import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { COSMETICS, getCosmeticById } from "@/data/cosmetics";
import { getClubById, normalizeClubSearch } from "@/data/clubs";
import { copyArcadeSettings, validateArcadeSettings } from "@/data/economyConfig";
import { EVENT_TASKS, MAX_ACTIVE_LISTINGS, MAX_MARKET_PRICE, emptyEconomy } from "@/data/eventEconomy";
import { secureRandom } from "@/lib/chestRandom";
import { grantDemoPoints } from "@/lib/demoPoints";
import { EQUIP_SLOTS, equipItemInState, getEquipSlot, unequipItemInState } from "@/lib/equipmentEngine";
import { createOpening } from "@/lib/gameEngine";
import { getChestPity, isValidChestPity } from "@/lib/chestPity";
import { createDemoState } from "@/lib/storage";
import { createTradeUp } from "@/lib/tradeUpEngine";
import type { BackendCommand, BackendCommandReply, BackendCommandResult, BackendSnapshot } from "@/types/backend";
import type { XperienceState } from "@/types/gamification";
import type { MarketFilters, MarketListing, MarketPage, MarketPriceSummary, MarketTransaction, PlayerEconomy } from "@/types/economy";
import type { AccountIdentity, CollectorProfile, ItemPassport, PublicCollectorProfile } from "@/types/collector";
import { hashPassword, normalizeUsername, validDisplayName, validPassword, verifyPassword } from "./accounts";
import { CollectorStore, validCollectorProfile } from "./collectorStore";
import { claimEvent, consumeOwnedCopies, forgeMythic, isPersistedEconomy, normalizeEconomyDay, validForgeCoins } from "./economyEngine";
import { isStoredOpeningRecord, isStoredTradeRecord, parseLegacyImport } from "./legacyImport";
import { StoreError } from "./storeError";
import { validateMarketFilters } from "./validation";
import { SeasonStore } from "./seasonStore";
import { getSeasonAvatar, SEASON_MISSIONS } from "@/data/seasonCatalog";

interface PlayerRow {
  id: string;
  created_at: string;
  state_json: string;
  revision: number;
  legacy_imported: number;
}
interface OperationRow { command_hash: string; result_json: string; }
interface AccountRow {
  username: string; player_id: string; password_salt: string; password_hash: string; password_version: number; created_at: string;
}
interface ListingRow {
  id: string; item_id: string; seller_id: string; price: number; created_at: string;
  status: "ACTIVE" | "SOLD" | "CANCELLED";
}
export interface StoreOptions {
  demoToolsEnabled?: boolean;
  sessionLifetimeMs?: number;
  /** Clock injection is only for deterministic server tests. */
  now?: () => number;
  /** Server-side injection only; the HTTP API never accepts a random source. */
  random?: () => number;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sessionToken = /^[A-Za-z0-9_-]{43}$/;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const itemId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
const stateKeys = new Set(["version", "exPoints", "chestPity", "ownedItemIds", "history", "tradeHistory", "settings", "equipped"]);
function validPersistedLoadout(value: unknown, ownedIds: readonly string[]): boolean {
  if (!object(value)) return false;
  const owned = new Set(ownedIds);
  return Object.entries(value).every(([slot, id]) => {
    if (!EQUIP_SLOTS.includes(slot as typeof EQUIP_SLOTS[number]) || !itemId(id) || !owned.has(id)) return false;
    const item = getCosmeticById(id);
    // Catalog retirement must not lock the entire player. Unknown owned loadout
    // references remain archived; UI ignores them and new equips remain strict.
    return !item || getEquipSlot(item) === slot;
  });
}
type PersistedState = Omit<XperienceState, "chestPity"> & { chestPity?: number };
function isPersistedState(value: unknown): value is PersistedState {
  // Do not use the forgiving browser migration, which can replace malformed saves
  // with defaults. Server histories may legitimately grow beyond import-only caps.
  return object(value) && Object.keys(value).every(key => stateKeys.has(key)) &&
    value.version === 2 && typeof value.exPoints === "number" && Number.isSafeInteger(value.exPoints) && value.exPoints >= 0 &&
    (!Object.hasOwn(value, "chestPity") || isValidChestPity(value.chestPity)) &&
    Array.isArray(value.ownedItemIds) && value.ownedItemIds.every(itemId) &&
    Array.isArray(value.history) && value.history.every(isStoredOpeningRecord) &&
    Array.isArray(value.tradeHistory) && value.tradeHistory.every(isStoredTradeRecord) &&
    validateArcadeSettings(value.settings) && validPersistedLoadout(value.equipped, value.ownedItemIds);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function validateCommand(value: unknown): asserts value is BackendCommand {
  if (!object(value)) throw new StoreError("INVALID_REQUEST");
  let valid = false;
  switch (value.type) {
    case "play": valid = value.game === "chest" || value.game === "orbit"; break;
    case "trade-up": valid = Array.isArray(value.itemIds) && value.itemIds.length === 5 && value.itemIds.every(itemId); break;
    case "equip": valid = itemId(value.itemId); break;
    case "unequip": valid = EQUIP_SLOTS.includes(value.slot as typeof EQUIP_SLOTS[number]); break;
    case "settings": valid = validateArcadeSettings(value.settings); break;
    case "grant-test-ex": case "reset-demo": valid = true; break;
    case "import-legacy": valid = typeof value.raw === "string" && Buffer.byteLength(value.raw, "utf8") <= 1024 * 1024; break;
    case "claim-event": valid = EVENT_TASKS.some(task => task.id === value.eventId); break;
    case "claim-season-mission": valid = SEASON_MISSIONS.some(task => task.id === value.missionId) && typeof value.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.day); break;
    case "redeem-season-avatar": valid = itemId(value.itemId) && !!getSeasonAvatar(value.itemId); break;
    case "forge-mythic": valid = Array.isArray(value.itemIds) && value.itemIds.length === 5 && value.itemIds.every(itemId) && validForgeCoins(value.coins); break;
    case "market-list": valid = itemId(value.itemId) && typeof value.price === "number" && Number.isSafeInteger(value.price) && value.price > 0 && value.price <= MAX_MARKET_PRICE &&
      (value.copyId === undefined || typeof value.copyId === "string" && uuid.test(value.copyId)); break;
    case "market-buy": case "market-cancel": valid = typeof value.listingId === "string" && uuid.test(value.listingId); break;
    case "profile-update": valid = validCollectorProfile({ displayName: value.displayName, bio: value.bio, isPublic: value.isPublic, featuredItemIds: value.featuredItemIds }); break;
    case "copy-lock": valid = typeof value.copyId === "string" && uuid.test(value.copyId) && typeof value.locked === "boolean"; break;
    case "wishlist-update": valid = itemId(value.itemId) && !!getCosmeticById(value.itemId) && typeof value.wished === "boolean"; break;
  }
  const fields: Record<string, readonly string[]> = {
    play: ["type", "game"], "trade-up": ["type", "itemIds"], equip: ["type", "itemId"], unequip: ["type", "slot"],
    settings: ["type", "settings"], "grant-test-ex": ["type"], "reset-demo": ["type"], "import-legacy": ["type", "raw"],
    "claim-event": ["type", "eventId"], "forge-mythic": ["type", "itemIds", "coins"], "market-list": ["type", "itemId", "price", "copyId"],
    "claim-season-mission": ["type", "missionId", "day"], "redeem-season-avatar": ["type", "itemId"],
    "market-buy": ["type", "listingId"], "market-cancel": ["type", "listingId"],
    "profile-update": ["type", "displayName", "bio", "isPublic", "featuredItemIds"],
    "copy-lock": ["type", "copyId", "locked"], "wishlist-update": ["type", "itemId", "wished"],
  };
  if (typeof value.type !== "string" || !fields[value.type] || !Object.keys(value).every(key => fields[value.type as string].includes(key))) valid = false;
  if (!valid) throw new StoreError("INVALID_REQUEST");
}

export const STORE_SCHEMA_VERSION = 5;

/** Local authoritative store. No player state is cached outside SQLite transactions. */
export class XperienceStore {
  private readonly db!: DatabaseSync;
  private readonly demoToolsEnabled: boolean;
  private readonly sessionLifetimeMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly collector!: CollectorStore;
  private readonly season!: SeasonStore;

  constructor(path: string, options: StoreOptions = {}) {
    this.demoToolsEnabled = options.demoToolsEnabled ?? true;
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? secureRandom;
    if (!Number.isSafeInteger(this.sessionLifetimeMs) || this.sessionLifetimeMs <= 0) throw new StoreError("INVALID_REQUEST");
    try {
      if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
      this.db = new DatabaseSync(path);
      this.collector = new CollectorStore(this.db, this.now);
      this.season = new SeasonStore(this.db, this.now);
      this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
      // SQLite's table-rebuild migration requires FK enforcement off before BEGIN.
      const needsSeasonMigration = this.db.prepare("PRAGMA user_version").get()?.user_version !== STORE_SCHEMA_VERSION;
      if (needsSeasonMigration) this.db.exec("PRAGMA foreign_keys = OFF;");
      this.transaction(() => {
        const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
        if (version !== 0 && version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== STORE_SCHEMA_VERSION) throw new StoreError("STORAGE_UNAVAILABLE");
        if (version === 0) this.db.exec(`
          CREATE TABLE players (
            id TEXT PRIMARY KEY, created_at TEXT NOT NULL, state_json TEXT NOT NULL CHECK(json_valid(state_json)),
            revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
            legacy_imported INTEGER NOT NULL DEFAULT 0 CHECK(legacy_imported IN (0, 1))
          ) STRICT;
          CREATE TABLE sessions (
            token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
          ) STRICT;
          CREATE INDEX sessions_expiry ON sessions(expires_at);
          CREATE TABLE operations (
            player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, request_id TEXT NOT NULL,
            command_hash TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at INTEGER NOT NULL,
            PRIMARY KEY(player_id, request_id)
          ) STRICT;
          PRAGMA user_version = 1;
        `);
        if (version !== 2 && version !== 3 && version !== 4 && version !== 5) {
          this.db.exec(`
            CREATE TABLE player_economies (
              player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
              economy_json TEXT NOT NULL CHECK(json_valid(economy_json))
            ) STRICT;
            CREATE TABLE market_listings (
              id TEXT PRIMARY KEY, item_id TEXT NOT NULL, seller_id TEXT NOT NULL REFERENCES players(id),
              price INTEGER NOT NULL CHECK(price > 0 AND price <= ${MAX_MARKET_PRICE}), created_at TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'SOLD', 'CANCELLED')),
              buyer_id TEXT REFERENCES players(id), closed_at TEXT,
              CHECK((status = 'ACTIVE' AND buyer_id IS NULL AND closed_at IS NULL) OR
                (status = 'SOLD' AND buyer_id IS NOT NULL AND closed_at IS NOT NULL) OR
                (status = 'CANCELLED' AND buyer_id IS NULL AND closed_at IS NOT NULL))
            ) STRICT;
            CREATE INDEX market_active ON market_listings(status, created_at DESC, id DESC);
            CREATE INDEX market_seller ON market_listings(seller_id, status, created_at DESC, id DESC);
          `);
          // Existing players retain their exact save and start with an empty coin wallet.
          this.db.prepare("INSERT INTO player_economies (player_id, economy_json) SELECT id, ? FROM players")
            .run(JSON.stringify(emptyEconomy(this.now())));
          this.db.exec("PRAGMA user_version = 2;");
        }
        // An incomplete version-2 schema must not be mistaken for an old, migratable save.
        this.db.prepare("SELECT economy_json FROM player_economies LIMIT 1").get();
        this.db.prepare("SELECT id FROM market_listings LIMIT 1").get();
        if (version !== 3 && version !== 4 && version !== 5) this.collector.migrate();
        if (version !== 4 && version !== 5) this.collector.migrateProtection();
        if (needsSeasonMigration) this.season.migrate();
        this.collector.verifySchema();
        this.season.verifySchema();
        if (this.db.prepare("PRAGMA foreign_key_check").all().length) throw new StoreError("STORAGE_UNAVAILABLE");
      });
      this.db.exec("PRAGMA foreign_keys = ON;");
    } catch (error) {
      // A partially opened handle must not keep files locked after failed initialization.
      try { this.db!.close(); } catch { /* No usable handle was opened. */ }
      if (error instanceof StoreError) throw error;
      throw new StoreError("STORAGE_UNAVAILABLE");
    }
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
      throw error;
    }
  }

  private safe<T>(operation: () => T): T {
    try { return operation(); }
    catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError("STORAGE_UNAVAILABLE");
    }
  }

  private findPlayer(token: string): PlayerRow | null {
    if (!sessionToken.test(token)) return null;
    const row = this.db.prepare(`SELECT p.* FROM players p JOIN sessions s ON s.player_id = p.id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(hash(token), this.now());
    return row ? row as unknown as PlayerRow : null;
  }

  private snapshot(player: PlayerRow): BackendSnapshot {
    // Stored JSON is written only by validated engines/imports. Fail closed if the file was corrupted.
    const state: unknown = JSON.parse(player.state_json);
    if (!isPersistedState(state)) throw new StoreError("STORAGE_UNAVAILABLE");
    // Read-only compatibility: do not rewrite old JSON or increment its revision
    // merely because a player loads their saved inventory after this upgrade.
    const normalizedState: XperienceState = { ...state, chestPity: getChestPity(state) };
    return {
      player: { id: player.id, createdAt: player.created_at }, state: normalizedState, revision: player.revision,
      demoToolsEnabled: this.demoToolsEnabled,
      canImportLegacy: this.demoToolsEnabled && player.revision === 0 && player.legacy_imported === 0,
      economy: normalizeEconomyDay(this.readEconomy(player.id), this.now()),
      account: this.accountIdentity(player.id),
      collector: this.collector.snapshot(player.id, state.ownedItemIds),
      season: this.season.snapshot(player.id),
    };
  }

  private readEconomy(playerId: string): PlayerEconomy {
    const row = this.db.prepare("SELECT economy_json FROM player_economies WHERE player_id = ?").get(playerId);
    if (!row || typeof row.economy_json !== "string") throw new StoreError("STORAGE_UNAVAILABLE");
    const value: unknown = JSON.parse(row.economy_json);
    if (!isPersistedEconomy(value)) throw new StoreError("STORAGE_UNAVAILABLE");
    return value;
  }

  private accountIdentity(playerId: string): AccountIdentity | null {
    const row = this.db.prepare("SELECT username, created_at FROM accounts WHERE player_id = ?").get(playerId);
    return row ? { username: row.username as string, displayName: this.collector.profile(playerId).displayName, createdAt: row.created_at as string } : null;
  }

  private rotateSession(playerId: string, previousToken?: string): string {
    if (previousToken && sessionToken.test(previousToken)) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(previousToken));
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    this.db.prepare("INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(hash(token), playerId, now, now + this.sessionLifetimeMs);
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    return token;
  }

  private createGuest(previousToken?: string): { token: string; snapshot: BackendSnapshot } {
    const now = this.now();
    const player: PlayerRow = { id: randomUUID(), created_at: new Date(now).toISOString(), state_json: JSON.stringify(createDemoState()), revision: 0, legacy_imported: 0 };
    this.db.prepare("INSERT INTO players (id, created_at, state_json) VALUES (?, ?, ?)").run(player.id, player.created_at, player.state_json);
    this.db.prepare("INSERT INTO player_economies (player_id, economy_json) VALUES (?, ?)").run(player.id, JSON.stringify(emptyEconomy(now)));
    this.collector.initializePlayer(player.id);
    this.season.initializePlayer(player.id);
    const token = this.rotateSession(player.id, previousToken);
    return { token, snapshot: this.snapshot(player) };
  }

  private account(username: string): AccountRow | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE username = ?").get(username) as unknown as AccountRow | undefined;
    if (row && row.password_version !== 1) throw new StoreError("STORAGE_UNAVAILABLE");
    return row ?? null;
  }

  /** Throttle follows the username, not a replaceable browser cookie. */
  private reserveCredentialAttempt(username: string): void {
    this.safe(() => this.transaction(() => {
      const now = this.now();
      const windowMs = 15 * 60 * 1000;
      this.db.prepare("DELETE FROM account_attempts WHERE window_started <= ?").run(now - windowMs);
      const row = this.db.prepare("SELECT window_started, attempts FROM account_attempts WHERE username = ?").get(username);
      if (row && (row.attempts as number) >= 5) throw new StoreError("RATE_LIMITED");
      this.db.prepare(`INSERT INTO account_attempts (username, window_started, attempts) VALUES (?, ?, 1)
        ON CONFLICT(username) DO UPDATE SET attempts = attempts + 1`).run(username, now);
    }));
  }

  async registerAccount(token: string, username: string, password: string, displayName: string): Promise<{ token: string; snapshot: BackendSnapshot }> {
    username = normalizeUsername(username);
    if (!validPassword(password) || !validDisplayName(displayName)) throw new StoreError("INVALID_REQUEST");
    this.safe(() => {
      const player = this.findPlayer(token);
      if (!player) throw new StoreError("NO_SESSION");
      if (this.account(username) || this.accountIdentity(player.id)) throw new StoreError("ACCOUNT_EXISTS");
    });
    const credential = await hashPassword(password);
    return this.safe(() => this.transaction(() => {
      // Crypto deliberately happens outside SQLite locks; revalidate after the await.
      const player = this.findPlayer(token);
      if (!player) throw new StoreError("NO_SESSION");
      if (this.account(username) || this.accountIdentity(player.id)) throw new StoreError("ACCOUNT_EXISTS");
      const state = this.snapshot(player).state;
      this.db.prepare("INSERT INTO accounts (username, player_id, password_salt, password_hash, password_version, created_at) VALUES (?, ?, ?, ?, 1, ?)")
        .run(username, player.id, credential.salt, credential.hash, new Date(this.now()).toISOString());
      this.collector.updateProfile(player.id, { ...this.collector.profile(player.id), displayName }, state.ownedItemIds);
      return { token: this.rotateSession(player.id, token), snapshot: this.snapshot(player) };
    }));
  }

  async loginAccount(token: string | undefined, username: string, password: string): Promise<{ token: string; snapshot: BackendSnapshot }> {
    username = normalizeUsername(username);
    if (!validPassword(password)) throw new StoreError("INVALID_REQUEST");
    const initiatingPlayerId = this.safe(() => token ? this.findPlayer(token)?.id : undefined);
    if (token && !initiatingPlayerId) throw new StoreError("NO_SESSION");
    this.reserveCredentialAttempt(username);
    const account = this.safe(() => this.account(username));
    const verified = await verifyPassword(password, account ? { salt: account.password_salt, hash: account.password_hash } : null);
    if (!verified || !account) throw new StoreError("INVALID_CREDENTIALS");
    return this.safe(() => this.transaction(() => {
      // A later logout/account switch must win over this earlier, slow login.
      // No-cookie logins remain supported for a genuinely new browser.
      if (token && this.findPlayer(token)?.id !== initiatingPlayerId) throw new StoreError("SESSION_CHANGED");
      const current = this.account(username);
      // A simultaneous password change invalidates an already running login check.
      if (!current || current.password_hash !== account.password_hash || current.password_salt !== account.password_salt) throw new StoreError("INVALID_CREDENTIALS");
      const player = this.db.prepare("SELECT * FROM players WHERE id = ?").get(current.player_id) as unknown as PlayerRow | undefined;
      if (!player) throw new StoreError("STORAGE_UNAVAILABLE");
      const snapshot = this.snapshot(player);
      this.db.prepare("DELETE FROM account_attempts WHERE username = ?").run(username);
      return { token: this.rotateSession(player.id, token), snapshot };
    }));
  }

  logoutAccount(token: string): { token: string; snapshot: BackendSnapshot } {
    return this.safe(() => this.transaction(() => {
      if (!this.findPlayer(token)) throw new StoreError("NO_SESSION");
      return this.createGuest(token);
    }));
  }

  async changeAccountPassword(token: string, currentPassword: string, password: string): Promise<{ token: string; snapshot: BackendSnapshot }> {
    if (!validPassword(currentPassword) || !validPassword(password)) throw new StoreError("INVALID_REQUEST");
    const account = this.safe(() => {
      const player = this.findPlayer(token);
      if (!player) throw new StoreError("NO_SESSION");
      const row = this.db.prepare("SELECT * FROM accounts WHERE player_id = ?").get(player.id) as unknown as AccountRow | undefined;
      if (!row) throw new StoreError("ACCOUNT_REQUIRED");
      return this.account(row.username)!;
    });
    this.reserveCredentialAttempt(account.username);
    if (!await verifyPassword(currentPassword, { salt: account.password_salt, hash: account.password_hash })) throw new StoreError("INVALID_CREDENTIALS");
    const credential = await hashPassword(password);
    return this.safe(() => this.transaction(() => {
      const player = this.findPlayer(token);
      if (!player) throw new StoreError("NO_SESSION");
      const current = this.account(account.username);
      if (!current || current.player_id !== player.id || current.password_hash !== account.password_hash || current.password_salt !== account.password_salt) throw new StoreError("INVALID_CREDENTIALS");
      this.snapshot(player);
      this.db.prepare("UPDATE accounts SET password_hash = ?, password_salt = ? WHERE username = ?").run(credential.hash, credential.salt, account.username);
      this.db.prepare("DELETE FROM sessions WHERE player_id = ?").run(player.id);
      this.db.prepare("DELETE FROM account_attempts WHERE username = ?").run(account.username);
      return { token: this.rotateSession(player.id), snapshot: this.snapshot(player) };
    }));
  }

  private persistPlayer(player: PlayerRow, state: XperienceState, economy: PlayerEconomy): void {
    if (!isPersistedState(state) || !isPersistedEconomy(economy)) throw new StoreError("STORAGE_UNAVAILABLE");
    player.state_json = JSON.stringify(state);
    player.revision += 1;
    this.db.prepare("UPDATE players SET state_json = ?, revision = ?, legacy_imported = ? WHERE id = ?")
      .run(player.state_json, player.revision, player.legacy_imported, player.id);
    this.db.prepare("UPDATE player_economies SET economy_json = ? WHERE player_id = ?")
      .run(JSON.stringify(economy), player.id);
  }

  private listingDTO(row: ListingRow): MarketListing {
    return { id: row.id, itemId: row.item_id, sellerId: row.seller_id, price: row.price, createdAt: row.created_at };
  }

  bootstrapSession(token?: string): { token?: string; snapshot: BackendSnapshot } {
    return this.safe(() => this.transaction(() => {
      const existing = token ? this.findPlayer(token) : null;
      if (existing) return { snapshot: this.snapshot(existing) };
      return this.createGuest(token);
    }));
  }

  getSnapshot(token: string): BackendSnapshot | null {
    // State, revision and wallet must come from one committed SQLite view, including
    // when a different process pays this player as the seller of a marketplace item.
    return this.safe(() => this.transaction(() => {
      const player = this.findPlayer(token);
      return player ? this.snapshot(player) : null;
    }));
  }

  getItemPassport(token: string, copyId: string): ItemPassport | null {
    if (!uuid.test(copyId)) throw new StoreError("INVALID_REQUEST");
    return this.safe(() => this.transaction(() => {
      const player = this.findPlayer(token);
      if (!player) return null;
      this.snapshot(player);
      return this.collector.passport(player.id, copyId);
    }));
  }

  getPublicProfile(username: string): PublicCollectorProfile | null {
    username = normalizeUsername(username);
    return this.safe(() => this.transaction(() => {
      const account = this.account(username);
      if (!account) return null;
      const profile = this.collector.profile(account.player_id);
      if (!profile.isPublic) return null;
      const player = this.db.prepare("SELECT * FROM players WHERE id = ?").get(account.player_id) as unknown as PlayerRow | undefined;
      if (!player) throw new StoreError("STORAGE_UNAVAILABLE");
      const snapshot = this.snapshot(player);
      const owned = new Set(snapshot.state.ownedItemIds);
      return {
        username: account.username, displayName: profile.displayName, bio: profile.bio, joinedAt: account.created_at,
        featuredItemIds: profile.featuredItemIds.filter(id => owned.has(id) && getCosmeticById(id)?.rarity === "MYTHIC"),
        equipped: Object.fromEntries(Object.entries(snapshot.state.equipped).filter(([, id]) => owned.has(id) && !!getCosmeticById(id))),
        discoveredItemIds: snapshot.collector!.discoveredItemIds,
      };
    }));
  }

  getMarket(token: string, cursor?: string, filters: MarketFilters = {}): MarketPage | null {
    // Direct store callers use the same bounded DTO as HTTP clients.
    try { filters = validateMarketFilters(filters); } catch { throw new StoreError("INVALID_REQUEST"); }
    return this.safe(() => this.transaction(() => {
      const player = this.findPlayer(token);
      if (!player) return null;
      this.snapshot(player);
      let anchor: ListingRow | undefined;
      if (cursor !== undefined) {
        if (!uuid.test(cursor)) throw new StoreError("INVALID_REQUEST");
        anchor = this.db.prepare("SELECT * FROM market_listings WHERE id = ?").get(cursor.toLowerCase()) as unknown as ListingRow | undefined;
        if (!anchor) throw new StoreError("INVALID_REQUEST");
      }
      const clauses = ["status = 'ACTIVE'"];
      const values: (string | number)[] = [];
      if (filters.query || filters.rarity || filters.clubId || filters.itemId) {
        const query = normalizeClubSearch(filters.query ?? "");
        const matchingIds = COSMETICS.filter(item => {
          if (filters.itemId && item.id !== filters.itemId || filters.rarity && item.rarity !== filters.rarity || filters.clubId && item.clubId !== filters.clubId) return false;
          const club = item.clubId ? getClubById(item.clubId) : undefined;
          return !query || normalizeClubSearch([item.name, item.description, club?.name, club?.shortName, club?.campus].join(" ")).includes(query);
        }).map(item => item.id);
        clauses.push(matchingIds.length ? `item_id IN (${matchingIds.map(() => "?").join(",")})` : "0 = 1");
        values.push(...matchingIds);
      }
      if (filters.minPrice !== undefined) { clauses.push("price >= ?"); values.push(filters.minPrice); }
      if (filters.maxPrice !== undefined) { clauses.push("price <= ?"); values.push(filters.maxPrice); }
      if (filters.wishlistOnly) {
        clauses.push("EXISTS (SELECT 1 FROM collector_wishlist w WHERE w.player_id = ? AND w.item_id = market_listings.item_id)"); values.push(player.id);
      }
      const sort = filters.sort ?? "newest";
      const tie = "(created_at < ? OR (created_at = ? AND id < ?))";
      if (anchor) {
        if (sort === "newest") { clauses.push(tie); values.push(anchor.created_at, anchor.created_at, anchor.id); }
        else {
          clauses.push(`(price ${sort === "price-asc" ? ">" : "<"} ? OR (price = ? AND ${tie}))`);
          values.push(anchor.price, anchor.price, anchor.created_at, anchor.created_at, anchor.id);
        }
      }
      const order = sort === "newest" ? "created_at DESC, id DESC" : `price ${sort === "price-asc" ? "ASC" : "DESC"}, created_at DESC, id DESC`;
      const rows = this.db.prepare(`SELECT * FROM market_listings WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT 41`).all(...values) as unknown as ListingRow[];
      const own = this.db.prepare("SELECT * FROM market_listings WHERE seller_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(player.id, MAX_ACTIVE_LISTINGS) as unknown as ListingRow[];
      const history = this.db.prepare("SELECT id, item_id, price, closed_at, seller_id FROM market_listings WHERE status = 'SOLD' AND (buyer_id = ? OR seller_id = ?) ORDER BY closed_at DESC, id DESC LIMIT 50")
        .all(player.id, player.id).map(row => ({ listingId: row.id, itemId: row.item_id, price: row.price, completedAt: row.closed_at, side: row.seller_id === player.id ? "sell" : "buy" })) as MarketTransaction[];
      let priceSummary: MarketPriceSummary | null = null;
      if (filters.itemId) {
        const aggregate = this.db.prepare("SELECT COUNT(*) AS salesCount, MIN(price) AS minPrice, MAX(price) AS maxPrice, AVG(price) AS averagePrice FROM market_listings WHERE status = 'SOLD' AND item_id = ?").get(filters.itemId)!;
        if ((aggregate.salesCount as number) > 0) {
          const last = this.db.prepare("SELECT price FROM market_listings WHERE status = 'SOLD' AND item_id = ? ORDER BY closed_at DESC, id DESC LIMIT 1").get(filters.itemId)!;
          priceSummary = { itemId: filters.itemId, salesCount: aggregate.salesCount as number, minPrice: aggregate.minPrice as number, maxPrice: aggregate.maxPrice as number, averagePrice: aggregate.averagePrice as number, lastPrice: last.price as number };
        }
      }
      const wishlistMatches = this.db.prepare("SELECT COUNT(*) AS count FROM market_listings l WHERE l.status = 'ACTIVE' AND l.seller_id <> ? AND EXISTS (SELECT 1 FROM collector_wishlist w WHERE w.player_id = ? AND w.item_id = l.item_id)").get(player.id, player.id)!.count as number;
      return { listings: rows.slice(0, 40).map(row => this.listingDTO(row)), ownListings: own.map(row => this.listingDTO(row)), nextCursor: rows.length > 40 ? rows[39].id : null, history, priceSummary, wishlistMatches };
    }));
  }

  execute(token: string, requestId: string, command: BackendCommand, expectedPlayerId: string): BackendCommandReply {
    return this.safe(() => {
      if (!uuid.test(requestId) || !uuid.test(expectedPlayerId)) throw new StoreError("INVALID_REQUEST");
      // UUID text is case-insensitive; casing must not turn a retry into a second purchase.
      requestId = requestId.toLowerCase();
      expectedPlayerId = expectedPlayerId.toLowerCase();
      validateCommand(command);
      const commandHash = hash(canonical(command));
      return this.transaction(() => {
        const player = this.findPlayer(token);
        if (!player) throw new StoreError("NO_SESSION");
        if (player.id !== expectedPlayerId) throw new StoreError("SESSION_CHANGED");
        const previous = this.db.prepare("SELECT command_hash, result_json FROM operations WHERE player_id = ? AND request_id = ?")
          .get(player.id, requestId) as unknown as OperationRow | undefined;
        if (previous) {
          if (previous.command_hash !== commandHash) throw new StoreError("IDEMPOTENCY_CONFLICT");
          return { snapshot: this.snapshot(player), result: JSON.parse(previous.result_json) as BackendCommandResult };
        }
        if (!this.demoToolsEnabled && ["settings", "grant-test-ex", "reset-demo", "import-legacy"].includes(command.type)) {
          throw new StoreError("DEMO_DISABLED");
        }
        const state = this.snapshot(player).state;
        const storedEconomy = this.readEconomy(player.id);
        const economy = normalizeEconomyDay(storedEconomy, this.now());
        let nextEconomy = economy;
        let next = state;
        let result: BackendCommandResult;
        switch (command.type) {
          case "play": {
            const attempt = createOpening(state, command.game, this.random);
            if (attempt.success) {
              const { next: updated, ...outcome } = attempt;
              next = updated; result = outcome;
              this.collector.mint(player.id, attempt.reward.item.id, command.game === "chest" ? "CHEST" : "ORBIT");
              if (command.game === "chest") nextEconomy = { ...economy, progress: { ...economy.progress, chests: economy.progress.chests + 1 } };
            } else result = attempt;
            break;
          }
          case "trade-up": {
            if (this.collector.hasLockedObstruction(player.id, command.itemIds)) { result = { success: false, reason: "ITEM_LOCKED" }; break; }
            const attempt = createTradeUp(state, command.itemIds, this.random);
            if (attempt.success) {
              const { next: updated, ...outcome } = attempt;
              next = updated; result = outcome;
              this.collector.consume(player.id, command.itemIds);
              if (attempt.reward) this.collector.mint(player.id, attempt.reward.item.id, "TRADE_UP");
              nextEconomy = { ...economy, progress: { ...economy.progress, trades: economy.progress.trades + 1 } };
            } else result = attempt;
            break;
          }
          case "equip": {
            const updated = equipItemInState(state, command.itemId);
            if (updated) next = updated;
            result = updated ? { success: true } : { success: false, reason: "INVALID_SELECTION" };
            break;
          }
          case "unequip": next = unequipItemInState(state, command.slot)!; result = { success: true }; break;
          case "settings": next = { ...state, settings: copyArcadeSettings(command.settings) }; result = { success: true }; break;
          case "grant-test-ex": next = grantDemoPoints(state); result = { success: true }; break;
          case "reset-demo": {
            // Escrow belongs to this reset player; never cancel another player's listing or undo a completed sale.
            this.db.prepare("UPDATE market_listings SET status = 'CANCELLED', closed_at = ? WHERE seller_id = ? AND status = 'ACTIVE'")
              .run(new Date(this.now()).toISOString(), player.id);
            this.collector.reset(player.id);
            next = createDemoState();
            // Demo reset is not a way to claim and transfer the same daily reward again.
            nextEconomy = { ...emptyEconomy(this.now()), claimedEventIds: economy.claimedEventIds };
            result = { success: true }; break;
          }
          case "import-legacy": {
            if (player.revision !== 0 || player.legacy_imported !== 0) throw new StoreError("IMPORT_NOT_ALLOWED");
            next = parseLegacyImport(command.raw);
            this.collector.reset(player.id);
            for (const id of next.ownedItemIds) this.collector.mint(player.id, id, "IMPORT");
            player.legacy_imported = 1;
            result = { success: true };
            break;
          }
          case "claim-event": {
            const attempt = claimEvent(economy, command.eventId);
            nextEconomy = attempt.economy; result = attempt.result; break;
          }
          case "claim-season-mission": {
            result = this.season.claim(player.id, economy, command.missionId, command.day);
            if (result.success) next = { ...state };
            break;
          }
          case "redeem-season-avatar": {
            const attempt = this.season.redeem(player.id, command.itemId);
            if (attempt.success && attempt.reward) {
              const item = attempt.reward.item;
              this.collector.mint(player.id, item.id, "SEASON");
              next = { ...state, ownedItemIds: [...state.ownedItemIds, item.id] };
              attempt.reward.isDuplicate = state.ownedItemIds.includes(item.id);
            }
            result = attempt;
            break;
          }
          case "forge-mythic": {
            if (this.collector.hasLockedObstruction(player.id, command.itemIds)) { result = { success: false, reason: "ITEM_LOCKED" }; break; }
            const attempt = forgeMythic(state, economy, command.itemIds, command.coins, this.now(), this.random);
            if (attempt.result.success) {
              this.collector.consume(player.id, command.itemIds);
              if (attempt.result.reward) this.collector.mint(player.id, attempt.result.reward.item.id, "FORGE");
            }
            next = attempt.state; nextEconomy = attempt.economy; result = attempt.result; break;
          }
          case "market-list": {
            if (!getCosmeticById(command.itemId)) { result = { success: false, reason: "INVALID_SELECTION" }; break; }
            const count = this.db.prepare("SELECT COUNT(*) AS count FROM market_listings WHERE seller_id = ? AND status = 'ACTIVE'").get(player.id)!.count as number;
            if (count >= MAX_ACTIVE_LISTINGS) { result = { success: false, reason: "LISTING_LIMIT" }; break; }
            const updated = consumeOwnedCopies(state, [command.itemId]);
            if (!updated) { result = { success: false, reason: "INSUFFICIENT_ITEMS" }; break; }
            const copy = this.collector.selectOwnedCopy(player.id, command.itemId, command.copyId);
            if (!copy) { result = { success: false, reason: this.collector.hasLockedObstruction(player.id, [command.itemId]) ? "ITEM_LOCKED" : "INSUFFICIENT_ITEMS" }; break; }
            if (copy.locked) { result = { success: false, reason: "ITEM_LOCKED" }; break; }
            const listingId = randomUUID();
            this.db.prepare("INSERT INTO market_listings (id, item_id, seller_id, price, created_at, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')")
              .run(listingId, command.itemId, player.id, command.price, new Date(this.now()).toISOString());
            this.collector.list(player.id, copy.id, listingId);
            next = updated; result = { success: true, listingId }; break;
          }
          case "market-cancel": {
            const listing = this.db.prepare("SELECT * FROM market_listings WHERE id = ?").get(command.listingId.toLowerCase()) as unknown as ListingRow | undefined;
            if (!listing || listing.status !== "ACTIVE") { result = { success: false, reason: "LISTING_UNAVAILABLE" }; break; }
            if (listing.seller_id !== player.id) { result = { success: false, reason: "NOT_OWNER" }; break; }
            this.db.prepare("UPDATE market_listings SET status = 'CANCELLED', closed_at = ? WHERE id = ?")
              .run(new Date(this.now()).toISOString(), listing.id);
            this.collector.returnListing(player.id, listing.id);
            next = { ...state, ownedItemIds: [...state.ownedItemIds, listing.item_id] };
            result = { success: true, listingId: listing.id }; break;
          }
          case "market-buy": {
            const listing = this.db.prepare("SELECT * FROM market_listings WHERE id = ?").get(command.listingId.toLowerCase()) as unknown as ListingRow | undefined;
            if (!listing || listing.status !== "ACTIVE") { result = { success: false, reason: "LISTING_UNAVAILABLE" }; break; }
            if (listing.seller_id === player.id) { result = { success: false, reason: "SELF_PURCHASE" }; break; }
            if (economy.coinBalance < listing.price) { result = { success: false, reason: "INSUFFICIENT_COINS" }; break; }
            const item = getCosmeticById(listing.item_id);
            if (!item) { result = { success: false, reason: "LISTING_UNAVAILABLE" }; break; }
            const seller = this.db.prepare("SELECT * FROM players WHERE id = ?").get(listing.seller_id) as unknown as PlayerRow | undefined;
            if (!seller) throw new StoreError("STORAGE_UNAVAILABLE");
            const sellerSnapshot = this.snapshot(seller);
            const sellerEconomy = sellerSnapshot.economy!;
            if (!Number.isSafeInteger(sellerEconomy.coinBalance + listing.price)) { result = { success: false, reason: "COIN_LIMIT" }; break; }
            const reward = { item, isDuplicate: state.ownedItemIds.includes(item.id), compensation: 0 };
            this.db.prepare("UPDATE market_listings SET status = 'SOLD', buyer_id = ?, closed_at = ? WHERE id = ?")
              .run(player.id, new Date(this.now()).toISOString(), listing.id);
            this.collector.transferListing(seller.id, player.id, listing.id);
            this.persistPlayer(seller, sellerSnapshot.state, { ...sellerEconomy, coinBalance: sellerEconomy.coinBalance + listing.price });
            next = { ...state, ownedItemIds: [...state.ownedItemIds, item.id] };
            nextEconomy = { ...economy, coinBalance: economy.coinBalance - listing.price };
            result = { success: true, listingId: listing.id, reward }; break;
          }
          case "profile-update": {
            const profile: CollectorProfile = { displayName: command.displayName, bio: command.bio, isPublic: command.isPublic, featuredItemIds: command.featuredItemIds };
            if (profile.isPublic && !this.accountIdentity(player.id)) throw new StoreError("ACCOUNT_REQUIRED");
            this.collector.updateProfile(player.id, profile, state.ownedItemIds);
            next = { ...state };
            result = { success: true }; break;
          }
          case "copy-lock": {
            const updated = this.collector.setLocked(player.id, command.copyId, command.locked);
            if (updated) next = { ...state };
            result = updated ? { success: true } : { success: false, reason: "INVALID_SELECTION" };
            break;
          }
          case "wishlist-update": {
            const updated = this.collector.updateWishlist(player.id, command.itemId, command.wished);
            if (updated) next = { ...state };
            result = updated ? { success: true } : { success: false, reason: "WISHLIST_LIMIT" };
            break;
          }
        }
        this.collector.pruneFeatures(player.id, next.ownedItemIds);
        // A rejected game attempt is also recorded, so retrying a key cannot perform a new roll later.
        if (next !== state || nextEconomy !== storedEconomy) this.persistPlayer(player, next, nextEconomy);
        const resultJson = JSON.stringify(result);
        this.db.prepare("INSERT INTO operations (player_id, request_id, command_hash, result_json, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(player.id, requestId, commandHash, resultJson, this.now());
        // Normalize the first reply to the same JSON DTO returned on later retries.
        return { snapshot: this.snapshot(player), result: JSON.parse(resultJson) as BackendCommandResult };
      });
    });
  }

  health(): boolean {
    try { return this.db.prepare("SELECT 1 AS ok").get()?.ok === 1; } catch { return false; }
  }

  close(): void { this.db.close(); }
}
