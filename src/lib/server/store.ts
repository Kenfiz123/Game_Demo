import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getCosmeticById } from "@/data/cosmetics";
import { copyArcadeSettings, validateArcadeSettings } from "@/data/economyConfig";
import { grantDemoPoints } from "@/lib/demoPoints";
import { EQUIP_SLOTS, equipItemInState, getEquipSlot, unequipItemInState } from "@/lib/equipmentEngine";
import { createOpening } from "@/lib/gameEngine";
import { createDemoState } from "@/lib/storage";
import { createTradeUp } from "@/lib/tradeUpEngine";
import type { BackendCommand, BackendCommandReply, BackendCommandResult, BackendSnapshot } from "@/types/backend";
import type { XperienceState } from "@/types/gamification";
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
export interface StoreOptions {
  demoToolsEnabled?: boolean;
  sessionLifetimeMs?: number;
  /** Clock injection is only for deterministic server tests. */
  now?: () => number;
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
  }
  if (!valid) throw new StoreError("INVALID_REQUEST");
}

/** Local authoritative store. No player state is cached outside SQLite transactions. */
export class XperienceStore {
  private readonly db!: DatabaseSync;
  private readonly demoToolsEnabled: boolean;
  private readonly sessionLifetimeMs: number;
  private readonly now: () => number;

  constructor(path: string, options: StoreOptions = {}) {
    this.demoToolsEnabled = options.demoToolsEnabled ?? true;
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    if (!Number.isSafeInteger(this.sessionLifetimeMs) || this.sessionLifetimeMs <= 0) throw new StoreError("INVALID_REQUEST");
    try {
      if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
      this.db = new DatabaseSync(path);
      this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
      this.transaction(() => {
        const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
        if (version !== 0 && version !== 1) throw new StoreError("STORAGE_UNAVAILABLE");
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
    };
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
      this.db.prepare("INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(hash(newToken), player.id, now, now + this.sessionLifetimeMs);
      this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
      return { token: newToken, snapshot: this.snapshot(player) };
    }));
  }

  getSnapshot(token: string): BackendSnapshot | null {
    return this.safe(() => {
      const player = this.findPlayer(token);
      return player ? this.snapshot(player) : null;
    });
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
        let next = state;
        let result: BackendCommandResult;
        switch (command.type) {
          case "play": {
            const attempt = createOpening(state, command.game);
            if (attempt.success) {
              const { next: updated, ...outcome } = attempt;
              next = updated; result = outcome;
            } else result = attempt;
            break;
          }
          case "trade-up": {
            const attempt = createTradeUp(state, command.itemIds);
            if (attempt.success) {
              const { next: updated, ...outcome } = attempt;
              next = updated; result = outcome;
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
          case "reset-demo": next = createDemoState(); result = { success: true }; break;
          case "import-legacy": {
            if (player.revision !== 0 || player.legacy_imported !== 0) throw new StoreError("IMPORT_NOT_ALLOWED");
            next = parseLegacyImport(command.raw);
            player.legacy_imported = 1;
            result = { success: true };
            break;
          }
        }
        // A rejected game attempt is also recorded, so retrying a key cannot perform a new roll later.
        if (next !== state) {
          player.state_json = JSON.stringify(next);
          player.revision += 1;
          this.db.prepare("UPDATE players SET state_json = ?, revision = ?, legacy_imported = ? WHERE id = ?")
            .run(player.state_json, player.revision, player.legacy_imported, player.id);
        }
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
