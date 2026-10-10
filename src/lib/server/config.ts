import path from "node:path";

export interface ServerConfig {
  databasePath: string;
  sessionCookie: string;
  sessionLifetimeMs: number;
  demoToolsEnabled: boolean;
}

/** Configuration only: never cache a request, player, or session in this module. */
export function getServerConfig(environment: Readonly<Record<string, string | undefined>> = process.env): ServerConfig {
  const sessionCookie = environment.XPERIENCE_SESSION_COOKIE || "xperience_session_v1";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(sessionCookie)) {
    throw new Error("Invalid session cookie configuration");
  }
  return {
    databasePath: path.resolve(environment.XPERIENCE_DB_PATH || path.join(process.cwd(), "data", "xperience.sqlite")),
    sessionCookie,
    sessionLifetimeMs: 30 * 24 * 60 * 60 * 1_000,
    demoToolsEnabled: environment.XPERIENCE_DEMO_TOOLS !== "false",
  };
}
