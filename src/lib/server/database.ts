import { getServerConfig } from "./config";
import { XperienceStore } from "./store";

interface StoreConnection { key: string; store: XperienceStore; }
const databaseGlobal = globalThis as typeof globalThis & { __xperienceDatabaseConnection?: StoreConnection };

/** Keep only the connection across Next.js hot reloads, not user-specific data. */
export function getStore(): XperienceStore {
  const config = getServerConfig();
  const key = `${config.databasePath}:${config.demoToolsEnabled}:${config.sessionLifetimeMs}`;
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
