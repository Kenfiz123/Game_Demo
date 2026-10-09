"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createOpening } from "@/lib/gameEngine";
import { createTradeUp } from "@/lib/tradeUpEngine";
import { copyArcadeSettings, validateArcadeSettings } from "@/data/economyConfig";
import { grantDemoPoints } from "@/lib/demoPoints";
import { createDemoState, loadXperienceState, saveXperienceState, STORAGE_KEY } from "@/lib/storage";
import { withStorageTransaction } from "@/lib/storageTransaction";
import { equipItemInState, unequipItemInState } from "@/lib/equipmentEngine";
import { XperienceContext } from "@/hooks/useXperience";
import type { ArcadeSettings, EquipSlot, GameId, OpeningAttempt, TradeUpAttempt, XperienceState } from "@/types/gamification";
interface MutationOutcome<T> { value: T; next?: XperienceState; presentationId?: string; }
export function XperienceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(createDemoState);
  const [hydrated, setHydrated] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const activeOpening = useRef<string | symbol | null>(null);
  const pendingController = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setState(loadXperienceState());
    setHydrated(true);
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setState(loadXperienceState());
    };
    window.addEventListener("storage", sync);
    return () => {
      mounted.current = false;
      pendingController.current?.abort();
      pendingController.current = null;
      activeOpening.current = null;
      window.removeEventListener("storage", sync);
    };
  }, []);
  const runMutation = useCallback(async <T,>(operation: () => MutationOutcome<T>): Promise<T | null> => {
    // Reserve synchronously, before awaiting the cross-tab lock or React's render.
    if (!hydrated || !mounted.current || activeOpening.current) return null;
    const token = Symbol("pending storage transaction");
    const controller = new AbortController();
    activeOpening.current = token;
    pendingController.current = controller;
    setIsPlaying(true);
    try {
      const transaction = await withStorageTransaction(() => {
        if (!mounted.current || controller.signal.aborted) throw new Error("Provider unmounted");
        return operation();
      }, { signal: controller.signal });
      if (!transaction.success) return null;
      if (!mounted.current || activeOpening.current !== token) return null;
      const result = transaction.value;
      if (result.next) setState(result.next);
      // The storage lock is already released. Only presentation stays locally busy.
      if (result.presentationId) activeOpening.current = result.presentationId;
      return result.value;
    } finally {
      if (pendingController.current === controller) pendingController.current = null;
      if (activeOpening.current === token) {
        activeOpening.current = null;
        if (mounted.current) setIsPlaying(false);
      }
    }
  }, [hydrated]);
  const playGame = useCallback(async (game: GameId): Promise<OpeningAttempt> => {
    if (!hydrated) return { success: false, reason: "NOT_READY" };
    if (activeOpening.current) return { success: false, reason: "BUSY" };
    return await runMutation<OpeningAttempt>(() => {
      const attempt = createOpening(loadXperienceState(), game);
      if (!attempt.success) return { value: attempt };
      // Read, draw and save are covered by the same lock across every tab.
      if (!saveXperienceState(attempt.next)) return { value: { success: false, reason: "STORAGE_UNAVAILABLE" } };
      return {
        value: { success: true, id: attempt.id, reward: attempt.reward, sectorIndex: attempt.sectorIndex },
        next: attempt.next, presentationId: attempt.id,
      };
    }) ?? { success: false, reason: "STORAGE_UNAVAILABLE" };
  }, [hydrated, runMutation]);
  const tradeUp = useCallback(async (ids: string[]): Promise<TradeUpAttempt> => {
    if (!hydrated) return { success: false, reason: "NOT_READY" };
    if (activeOpening.current) return { success: false, reason: "BUSY" };
    const selection = [...ids];
    return await runMutation<TradeUpAttempt>(() => {
      const attempt = createTradeUp(loadXperienceState(), selection);
      if (!attempt.success) return { value: attempt };
      if (!saveXperienceState(attempt.next)) return { value: { success: false, reason: "STORAGE_UNAVAILABLE" } };
      return {
        value: {
          success: true, id: attempt.id, won: attempt.won, inputRarity: attempt.inputRarity,
          targetRarity: attempt.targetRarity, chance: attempt.chance, reward: attempt.reward,
        },
        next: attempt.next, presentationId: attempt.id,
      };
    }) ?? { success: false, reason: "STORAGE_UNAVAILABLE" };
  }, [hydrated, runMutation]);
  const updateSettings = useCallback(async (settings: ArcadeSettings): Promise<boolean> => {
    if (!hydrated || activeOpening.current || !validateArcadeSettings(settings)) return false;
    const snapshot = copyArcadeSettings(settings);
    return await runMutation(() => {
      const next = { ...loadXperienceState(), settings: snapshot };
      return saveXperienceState(next) ? { value: true, next } : { value: false };
    }) ?? false;
  }, [hydrated, runMutation]);
  const completeOpening = useCallback((id: string) => {
    if (activeOpening.current === id) {
      activeOpening.current = null;
      if (mounted.current) setIsPlaying(false);
    }
  }, []);
  const equipItem = useCallback(async (id: string): Promise<boolean> => {
    if (!hydrated || activeOpening.current) return false;
    return await runMutation(() => {
      const next = equipItemInState(loadXperienceState(), id);
      return next && saveXperienceState(next) ? { value: true, next } : { value: false };
    }) ?? false;
  }, [hydrated, runMutation]);
  const unequipItem = useCallback(async (slot: EquipSlot): Promise<boolean> => {
    if (!hydrated || activeOpening.current) return false;
    return await runMutation(() => {
      const next = unequipItemInState(loadXperienceState(), slot);
      return next && saveXperienceState(next) ? { value: true, next } : { value: false };
    }) ?? false;
  }, [hydrated, runMutation]);
  const resetDemoData = useCallback(async (): Promise<boolean> => {
    if (!hydrated || activeOpening.current) return false;
    return await runMutation(() => {
      const initial = createDemoState();
      return saveXperienceState(initial) ? { value: true, next: initial } : { value: false };
    }) ?? false;
  }, [hydrated, runMutation]);
  const grantTestEx = useCallback(async (): Promise<boolean> => {
    if (!hydrated || activeOpening.current) return false;
    return await runMutation(() => {
      const next = grantDemoPoints(loadXperienceState());
      return saveXperienceState(next) ? { value: true, next } : { value: false };
    }) ?? false;
  }, [hydrated, runMutation]);
  const value = useMemo(() => ({ state, hydrated, isPlaying, playGame, tradeUp, updateSettings, equipItem, unequipItem, completeOpening, resetDemoData, grantTestEx }),
    [state, hydrated, isPlaying, playGame, tradeUp, updateSettings, equipItem, unequipItem, completeOpening, resetDemoData, grantTestEx]);
  return <XperienceContext.Provider value={value}>{children}</XperienceContext.Provider>;
}
