import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { StoreError } from "./storeError";

export interface PasswordCredential { salt: string; hash: string; }
const USERNAME = /^[a-zA-Z0-9_]{3,24}$/;
const CONTROL = /[\p{Cc}\p{Cf}]/u;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 64;
const DUMMY: PasswordCredential = { salt: "0".repeat(32), hash: "0".repeat(KEY_BYTES * 2) };
// Bound total memory even when independent account requests arrive together.
let inFlight = 0;
const waiters: (() => void)[] = [];

export function normalizeUsername(value: unknown): string {
  if (typeof value !== "string" || !USERNAME.test(value)) throw new StoreError("INVALID_REQUEST");
  return value.toLowerCase();
}
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128 && Buffer.byteLength(value, "utf8") <= 512;
}
export function validDisplayName(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length >= 2 && value.length <= 40 && !CONTROL.test(value);
}
export function validBio(value: unknown): value is string {
  return typeof value === "string" && value.length <= 180 && !CONTROL.test(value);
}
async function derive(password: string, salt: string): Promise<Buffer> {
  if (inFlight >= 2) await new Promise<void>(resolve => waiters.push(resolve));
  else inFlight += 1;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, Buffer.from(salt, "hex"), KEY_BYTES, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key));
    });
  } finally {
    const next = waiters.shift();
    if (next) next();
    else inFlight -= 1;
  }
}
export async function hashPassword(password: string): Promise<PasswordCredential> {
  if (!validPassword(password)) throw new StoreError("INVALID_REQUEST");
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: (await derive(password, salt)).toString("hex") };
}
export async function verifyPassword(password: string, credential: PasswordCredential | null): Promise<boolean> {
  if (!validPassword(password)) throw new StoreError("INVALID_REQUEST");
  const stored = credential ?? DUMMY;
  if (!/^[0-9a-f]{32}$/.test(stored.salt) || !/^[0-9a-f]{128}$/.test(stored.hash)) throw new StoreError("STORAGE_UNAVAILABLE");
  const supplied = await derive(password, stored.salt);
  return timingSafeEqual(supplied, Buffer.from(stored.hash, "hex")) && credential !== null;
}
