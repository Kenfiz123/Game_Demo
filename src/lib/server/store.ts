import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getCosmeticById } from "@/data/cosmetics";
import { copyArcadeSettings, validateArcadeSettings } from "@/data/economyConfig";
import { EVENT_TASKS, MAX_ACTIVE_LISTINGS, MAX_MARKET_PRICE, emptyEconomy } from "@/data/eventEconomy";
import { secureRandom } from "@/lib/chestRandom";
import { grantDemoPoints } from "@/lib/demoPoints";
import { EQUIP_SLOTS, equipItemInState, getEquipSlot, unequipItemInState } from "@/lib/equipmentEngine";
import { createOpening } from "@/lib/gameEngine";
import { createDemoState } from "@/lib/storage";
import { createTradeUp } from "@/lib/tradeUpEngine";
import type { BackendCommand, BackendCommandReply, BackendCommandResult, BackendSnapshot } from "@/types/backend";
import type { XperienceState } from "@/types/gamification";
import type { MarketListing, MarketPage, PlayerEconomy } from "@/types/economy";
import { claimEvent, consumeOwnedCopies, forgeMythic, isPersistedEconomy, normalizeEconomyDay, validForgeCoins } from "./economyEngine";
import { isStoredOpeningRecord, isStoredTradeRecord, parseLegacyImport } from "./legacyImport";
import { StoreError } from "./storeError";

interface PlayerRow {
  id: string;
  created_at: string;
  state_json: string;
  revision: number;
  legacy_imported: number;
}
interface OperationRow { command_hash: string; result_json: string; }
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
const stateKeys = new Set(["version", "exPoints", "ownedItemIds", "history", "tradeHistory", "settings", "equipped"]);
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
function isPersistedState(value: unknown): value is XperienceState {
  // Do not use the forgiving browser migration, which can replace malformed saves
  // with defaults. Server histories may legitimately grow beyond import-only caps.
  return object(value) && Object.keys(value).every(key => stateKeys.has(key)) &&
    value.version === 2 && typeof value.exPoints === "number" && Number.isSafeInteger(value.exPoints) && value.exPoints >= 0 &&
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
    case "forge-mythic": valid = Array.isArray(value.itemIds) && value.itemIds.length === 5 && value.itemIds.every(itemId) && validForgeCoins(value.coins); break;
    case "market-list": valid = itemId(value.itemId) && typeof value.price === "number" && Number.isSafeInteger(value.price) && value.price > 0 && value.price <= MAX_MARKET_PRICE; break;
    case "market-buy": case "market-cancel": valid = typeof value.listingId === "string" && uuid.test(value.listingId); break;
  }
  const fields: Record<string, readonly string[]> = {
    play: ["type", "game"], "trade-up": ["type", "itemIds"], equip: ["type", "itemId"], unequip: ["type", "slot"],
    settings: ["type", "settings"], "grant-test-ex": ["type"], "reset-demo": ["type"], "import-legacy": ["type", "raw"],
    "claim-event": ["type", "eventId"], "forge-mythic": ["type", "itemIds", "coins"], "market-list": ["type", "itemId", "price"],
    "market-buy": ["type", "listingId"], "market-cancel": ["type", "listingId"],
  };
  if (typeof value.type !== "string" || !fields[value.type] || !Object.keys(value).every(key => fields[value.type as string].includes(key))) valid = false;
  if (!valid) throw new StoreError("INVALID_REQUEST");
}

/** Local authoritative store. No player state is cached outside SQLite transactions. */
export class XperienceStore {
  private readonly db!: DatabaseSync;
  private readonly demoToolsEnabled: boolean;
  private readonly sessionLifetimeMs: number;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(path: string, options: StoreOptions = {}) {
    this.demoToolsEnabled = options.demoToolsEnabled ?? true;
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? secureRandom;
    if (!Number.isSafeInteger(this.sessionLifetimeMs) || this.sessionLifetimeMs <= 0) throw new StoreError("INVALID_REQUEST");
    try {
      if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
      this.db = new DatabaseSync(path);
      this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
      this.transaction(() => {
        const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
        if (version !== 0 && version !== 1 && version !== 2) throw new StoreError("STORAGE_UNAVAILABLE");
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
        if (version !== 2) {
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
      });
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
    return {
      player: { id: player.id, createdAt: player.created_at }, state, revision: player.revision,
      demoToolsEnabled: this.demoToolsEnabled,
      canImportLegacy: this.demoToolsEnabled && player.revision === 0 && player.legacy_imported === 0,
      economy: normalizeEconomyDay(this.readEconomy(player.id), this.now()),
    };
  }

  private readEconomy(playerId: string): PlayerEconomy {
    const row = this.db.prepare("SELECT economy_json FROM player_economies WHERE player_id = ?").get(playerId);
    if (!row || typeof row.economy_json !== "string") throw new StoreError("STORAGE_UNAVAILABLE");
    const value: unknown = JSON.parse(row.economy_json);
    if (!isPersistedEconomy(value)) throw new StoreError("STORAGE_UNAVAILABLE");
    return value;
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
      const now = this.now();
      const newToken = randomBytes(32).toString("base64url");
      const player: PlayerRow = {
        id: randomUUID(), created_at: new Date(now).toISOString(), state_json: JSON.stringify(createDemoState()),
        revision: 0, legacy_imported: 0,
      };
      this.db.prepare("INSERT INTO players (id, created_at, state_json) VALUES (?, ?, ?)")
        .run(player.id, player.created_at, player.state_json);
      this.db.prepare("INSERT INTO player_economies (player_id, economy_json) VALUES (?, ?)")
        .run(player.id, JSON.stringify(emptyEconomy(now)));
      this.db.prepare("INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(hash(newToken), player.id, now, now + this.sessionLifetimeMs);
      this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
      return { token: newToken, snapshot: this.snapshot(player) };
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

  getMarket(token: string, cursor?: string): MarketPage | null {
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
      const rows = (anchor
        ? this.db.prepare("SELECT * FROM market_listings WHERE status = 'ACTIVE' AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT 41")
          .all(anchor.created_at, anchor.created_at, anchor.id)
        : this.db.prepare("SELECT * FROM market_listings WHERE status = 'ACTIVE' ORDER BY created_at DESC, id DESC LIMIT 41").all()) as unknown as ListingRow[];
      const own = this.db.prepare("SELECT * FROM market_listings WHERE seller_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(player.id, MAX_ACTIVE_LISTINGS) as unknown as ListingRow[];
      return { listings: rows.slice(0, 40).map(row => this.listingDTO(row)), ownListings: own.map(row => this.listingDTO(row)), nextCursor: rows.length > 40 ? rows[39].id : null };
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
              if (command.game === "chest") nextEconomy = { ...economy, progress: { ...economy.progress, chests: economy.progress.chests + 1 } };
            } else result = attempt;
            break;
          }
          case "trade-up": {
            const attempt = createTradeUp(state, command.itemIds, this.random);
            if (attempt.success) {
              const { next: updated, ...outcome } = attempt;
              next = updated; result = outcome;
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
            next = createDemoState();
            // Demo reset is not a way to claim and transfer the same daily reward again.
            nextEconomy = { ...emptyEconomy(this.now()), claimedEventIds: economy.claimedEventIds };
            result = { success: true }; break;
          }
          case "import-legacy": {
            if (player.revision !== 0 || player.legacy_imported !== 0) throw new StoreError("IMPORT_NOT_ALLOWED");
            next = parseLegacyImport(command.raw);
            player.legacy_imported = 1;
            result = { success: true };
            break;
          }
          case "claim-event": {
            const attempt = claimEvent(economy, command.eventId);
            nextEconomy = attempt.economy; result = attempt.result; break;
          }
          case "forge-mythic": {
            const attempt = forgeMythic(state, economy, command.itemIds, command.coins, this.now(), this.random);
            next = attempt.state; nextEconomy = attempt.economy; result = attempt.result; break;
          }
          case "market-list": {
            if (!getCosmeticById(command.itemId)) { result = { success: false, reason: "INVALID_SELECTION" }; break; }
            const count = this.db.prepare("SELECT COUNT(*) AS count FROM market_listings WHERE seller_id = ? AND status = 'ACTIVE'").get(player.id)!.count as number;
            if (count >= MAX_ACTIVE_LISTINGS) { result = { success: false, reason: "LISTING_LIMIT" }; break; }
            const updated = consumeOwnedCopies(state, [command.itemId]);
            if (!updated) { result = { success: false, reason: "INSUFFICIENT_ITEMS" }; break; }
            const listingId = randomUUID();
            this.db.prepare("INSERT INTO market_listings (id, item_id, seller_id, price, created_at, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')")
              .run(listingId, command.itemId, player.id, command.price, new Date(this.now()).toISOString());
            next = updated; result = { success: true, listingId }; break;
          }
          case "market-cancel": {
            const listing = this.db.prepare("SELECT * FROM market_listings WHERE id = ?").get(command.listingId.toLowerCase()) as unknown as ListingRow | undefined;
            if (!listing || listing.status !== "ACTIVE") { result = { success: false, reason: "LISTING_UNAVAILABLE" }; break; }
            if (listing.seller_id !== player.id) { result = { success: false, reason: "NOT_OWNER" }; break; }
            this.db.prepare("UPDATE market_listings SET status = 'CANCELLED', closed_at = ? WHERE id = ?")
              .run(new Date(this.now()).toISOString(), listing.id);
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
            this.persistPlayer(seller, sellerSnapshot.state, { ...sellerEconomy, coinBalance: sellerEconomy.coinBalance + listing.price });
            next = { ...state, ownedItemIds: [...state.ownedItemIds, item.id] };
            nextEconomy = { ...economy, coinBalance: economy.coinBalance - listing.price };
            result = { success: true, listingId: listing.id, reward }; break;
          }
        }
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
