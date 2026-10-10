"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_CONFIG, MOTION } from "@/data/arcadeConfig";
import { useXperience } from "./useXperience";
import type { GameId, GamePhase, OpeningSuccess } from "@/types/gamification";
export function useRewardGame(game: GameId) {
  const { playGame, completeOpening, hydrated, isPlaying, state } = useXperience();
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [opening, setOpening] = useState<OpeningSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeId = useRef<string | null>(null);
  const mounted = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const cost = GAME_CONFIG[game].cost;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeId.current) completeOpening(activeId.current);
      activeId.current = null;
    };
  }, [completeOpening]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (phase === "charging") {
      const panel = panelRef.current;
      if (panel) {
        const bounds = panel.getBoundingClientRect();
        if (bounds.top < 80 || bounds.bottom > window.innerHeight) {
          panel.scrollIntoView({ block: "start", behavior: reduced ? "instant" : "smooth" });
        }
      }
      const timer = window.setTimeout(() => setPhase("rolling"), reduced ? 30 : MOTION.charge);
      return () => window.clearTimeout(timer);
    }
    if (phase === "settling") {
      const timer = window.setTimeout(() => {
        setPhase("result");
        if (activeId.current) completeOpening(activeId.current);
        activeId.current = null;
      }, reduced ? 80 : MOTION.settle);
      return () => window.clearTimeout(timer);
    }
  }, [phase, completeOpening]);
  const start = async () => {
    const attempt = await playGame(game);
    if (!mounted.current) {
      if (attempt.success) completeOpening(attempt.id);
      return;
    }
    if (!attempt.success) {
      setError(attempt.reason === "INSUFFICIENT_EX" ? "Bạn cần " + cost + " EX để chơi. Hãy nhận thêm EX từ hoạt động tại trường." :
        attempt.reason === "STORAGE_UNAVAILABLE" ? "Chưa thể xác nhận kết quả trên backend. Hãy kết nối lại và kiểm tra lịch sử trước khi chơi tiếp." :
        attempt.reason === "NOT_READY" ? "Đang kết nối và tải bộ sưu tập đã lưu." : "Hãy chờ lượt hiện tại kết thúc.");
      return;
    }
    activeId.current = attempt.id;
    setOpening(attempt);
    setError(null);
    setPhase("charging");
  };
  const onLanded = useCallback(() => setPhase((current) => current === "rolling" ? "settling" : current), []);
  const close = () => { setPhase("idle"); setOpening(null); setError(null); };
  return { panelRef, phase, opening, error, start, onLanded, close, cost, disabled: !hydrated || isPlaying, canAfford: state.exPoints >= cost };
}
