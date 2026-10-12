export interface AccountIdentity {
  username: string;
  displayName: string;
  createdAt: string;
}
export interface CollectorProfile {
  displayName: string;
  bio: string;
  isPublic: boolean;
  featuredItemIds: string[];
}
export type ItemOrigin = "CHEST" | "ORBIT" | "TRADE_UP" | "FORGE" | "LEGACY" | "IMPORT" | "SEASON";
/** One persistent identity per copy, never a catalog item ID. */
export interface ItemCopy {
  id: string;
  itemId: string;
  serial: string;
  origin: ItemOrigin;
  mintedAt: string | null;
  recordedAt: string;
  acquiredAt: string;
  originalOwnerName: string | null;
  transferCount: number;
  /** Optional only for older client fixtures; the server always includes it. */
  locked?: boolean;
}
export interface ItemTrailEntry {
  kind: "MINT" | "TRANSFER" | "LIST" | "RETURN" | "CONSUME";
  timestamp: string;
  ownerName: string | null;
}
export interface ItemPassport { copy: ItemCopy; trail: ItemTrailEntry[]; }
export interface CollectorSnapshot {
  profile: CollectorProfile;
  copies: ItemCopy[];
  /** Discovered catalog IDs remain after a copy is sold or consumed. */
  discoveredItemIds: string[];
  /** Private player preference, never included in a shared collector profile. */
  wishlistItemIds?: string[];
}
export interface PublicCollectorProfile {
  username: string;
  displayName: string;
  bio: string;
  joinedAt: string;
  featuredItemIds: string[];
  equipped: Partial<Record<import("./gamification").EquipSlot, string>>;
  discoveredItemIds: string[];
}
export type AccountAction =
  | { action: "register"; username: string; password: string; displayName: string }
  | { action: "login"; username: string; password: string }
  | { action: "logout" }
  | { action: "password"; currentPassword: string; password: string };
