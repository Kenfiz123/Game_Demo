import { getServerConfig } from "./config";
import { STORE_SCHEMA_VERSION, XperienceStore } from "./store";

interface StoreConnection { key: string; store: XperienceStore; }
const databaseGlobal = globalThis as typeof globalThis & { __xperienceDatabaseConnection?: StoreConnection };

/** Keep only the connection across Next.js hot reloads, not user-specific data. */
export function getStore(): XperienceStore {
  const config = getServerConfig();
  // A schema upgrade must reopen a connection retained by development hot reload.
  const key = `${config.databasePath}:${config.demoToolsEnabled}:${config.sessionLifetimeMs}:${STORE_SCHEMA_VERSION}`;
  const connection = databaseGlobal.__xperienceDatabaseConnection;
  if (connection?.key === key) return connection.store;
  if (connection) connection.store.close();
  const store = new XperienceStore(config.databasePath, {
    demoToolsEnabled: config.demoToolsEnabled,
    sessionLifetimeMs: config.sessionLifetimeMs,
  });
  databaseGlobal.__xperienceDatabaseConnection = { key, store };
  return store;
}
