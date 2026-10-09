"use client";
import { createContext, useContext } from "react";
import type { ArcadeSettings, EquipSlot, GameId, OpeningAttempt, TradeUpAttempt, XperienceState } from "@/types/gamification";
export interface XperienceContextValue {
  state: XperienceState; hydrated: boolean; isPlaying: boolean;
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
