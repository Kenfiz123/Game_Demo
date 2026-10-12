"use client";
import { createContext, useContext } from "react";
import type { ArcadeSettings, EquipSlot, GameId, OpeningAttempt, TradeUpAttempt, XperienceState } from "@/types/gamification";
import type { EconomyCommand, EconomyResult, PlayerEconomy } from "@/types/economy";
import type { AccountAction, AccountIdentity, CollectorProfile, CollectorSnapshot } from "@/types/collector";
export type BackendStatus = "connecting" | "ready" | "error";
export interface XperienceContextValue {
  state: XperienceState; hydrated: boolean; isPlaying: boolean;
  economy: PlayerEconomy;
  playerId: string | null;
  account: AccountIdentity | null;
  collector: CollectorSnapshot;
  authError: string | null;
  authAction: (action: AccountAction) => Promise<boolean>;
  updateProfile: (profile: CollectorProfile) => Promise<boolean>;
  economyAction: (command: EconomyCommand) => Promise<EconomyResult>;
  backendStatus: BackendStatus;
  backendError: string | null;
  retryBackend: () => Promise<void>;
  demoToolsEnabled: boolean;
  canImportLegacy: boolean;
  legacyAvailable: boolean;
  importLegacy: () => Promise<boolean>;
  playGame: (game: GameId) => Promise<OpeningAttempt>;
  tradeUp: (ids: string[]) => Promise<TradeUpAttempt>;
  updateSettings: (settings: ArcadeSettings) => Promise<boolean>;
  equipItem: (id: string) => Promise<boolean>;
  unequipItem: (slot: EquipSlot) => Promise<boolean>;
  completeOpening: (id: string) => void;
  resetDemoData: () => Promise<boolean>;
  grantTestEx: () => Promise<boolean>;
}
export const XperienceContext = createContext<XperienceContextValue | null>(null);
export function useXperience(): XperienceContextValue {
  const context = useContext(XperienceContext);
  if (!context) throw new Error("useXperience must be used inside XperienceProvider");
  return context;
}
