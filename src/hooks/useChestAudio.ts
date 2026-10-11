"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MOTION, REEL_WINNER_INDEX } from "@/data/arcadeConfig";
import { CHEST_AUDIO_KEY, ChestAudio, DEFAULT_CHEST_AUDIO, parseChestAudioPreferences, type ChestAudioPreferences } from "@/lib/chestAudio";
import type { GamePhase, Rarity } from "@/types/gamification";

export function useChestAudio(phase: GamePhase, openingId?: string, rarity?: Rarity) {
  const [preferences, setPreferences] = useState<ChestAudioPreferences>(() => ({ ...DEFAULT_CHEST_AUDIO }));
  const [available, setAvailable] = useState(true);
  const preferencesRef = useRef<{ enabled: boolean; volume: number }>(preferences);
  const engineRef = useRef<ChestAudio | null>(null);

  useEffect(() => {
    try {
      const saved = parseChestAudioPreferences(window.localStorage.getItem(CHEST_AUDIO_KEY));
      preferencesRef.current = saved;
      setPreferences(saved);
    } catch { /* Storage may be disabled; audio still works for this visit. */ }
    const onVisibility = () => { if (document.hidden) engineRef.current?.suspend(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const unlock = useCallback(() => {
    if (!preferencesRef.current.enabled || preferencesRef.current.volume === 0 || document.hidden) return;
    const engine = engineRef.current ?? (engineRef.current = new ChestAudio());
    engine.setVolume(preferencesRef.current.volume);
    // Do not await: AudioContext creation/resume must stay in the original user gesture.
    void engine.unlock().then((ready) => { if (engineRef.current === engine) setAvailable(ready); });
  }, []);

  const updatePreferences = useCallback((next: { enabled: boolean; volume: number }) => {
    preferencesRef.current = next;
    setPreferences(next);
    try { window.localStorage.setItem(CHEST_AUDIO_KEY, JSON.stringify(next)); } catch { /* Optional preference only. */ }
    engineRef.current?.setVolume(next.volume);
    if (!next.enabled) engineRef.current?.suspend();
  }, []);

  const toggle = useCallback(() => {
    const next = { ...preferencesRef.current, enabled: !preferencesRef.current.enabled };
    updatePreferences(next);
    if (next.enabled) unlock();
  }, [unlock, updatePreferences]);

  const setVolume = useCallback((volume: number) => {
    updatePreferences({ ...preferencesRef.current, volume: Math.max(0, Math.min(1, volume)) });
    if (preferencesRef.current.enabled) unlock();
  }, [unlock, updatePreferences]);

  useEffect(() => {
    if (phase !== "result" || rarity !== "MYTHIC") return;
    // Deliberate player input ends this celebration; mere mouse movement does not.
    const onPlayerAction = () => engineRef.current?.stopMusic();
    document.addEventListener("pointerdown", onPlayerAction, true);
    document.addEventListener("click", onPlayerAction, true);
    document.addEventListener("keydown", onPlayerAction, true);
    document.addEventListener("wheel", onPlayerAction, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPlayerAction, true);
      document.removeEventListener("click", onPlayerAction, true);
      document.removeEventListener("keydown", onPlayerAction, true);
      document.removeEventListener("wheel", onPlayerAction, true);
    };
  }, [phase, openingId, rarity]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!preferencesRef.current.enabled || preferencesRef.current.volume === 0 || document.hidden) { engine.stop(); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (phase === "charging") engine.charge(reduced ? 30 : MOTION.charge);
    else if (phase === "rolling") engine.roll(reduced ? 0 : MOTION.reel, REEL_WINNER_INDEX);
    else if (phase === "settling") engine.lock();
    else if (phase === "result" && rarity) {
      void engine.reveal(rarity).then((ready) => {
        if (engineRef.current === engine && !ready) setAvailable(false);
      });
    }
    else engine.stop();
  }, [phase, openingId, rarity]);

  return { enabled: preferences.enabled, volume: preferences.volume, available, unlock, toggle, setVolume };
}
