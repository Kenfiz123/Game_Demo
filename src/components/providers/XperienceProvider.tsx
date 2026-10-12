"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyArcadeSettings, validateArcadeSettings } from "@/data/economyConfig";
import { emptyEconomy } from "@/data/eventEconomy";
import { BackendRequestError, bootstrapBackend, readBackend, reconcileBackendSnapshot, sendAccountAction, sendBackendCommand } from "@/lib/backendClient";
import { createDemoState, parseStoredState, STORAGE_KEY } from "@/lib/storage";
import { XperienceContext, type BackendStatus } from "@/hooks/useXperience";
import type { BackendCommand, BackendCommandResult, BackendSnapshot } from "@/types/backend";
import type { ArcadeSettings, EquipSlot, GameId, OpeningAttempt, TradeUpAttempt } from "@/types/gamification";
import type { EconomyCommand, EconomyResult } from "@/types/economy";
import type { AccountAction, CollectorProfile, CollectorSnapshot } from "@/types/collector";
import { validCollectorProfile } from "@/lib/collectorValidation";
import { emptySeason } from "@/data/seasonCatalog";

const SYNC_CHANNEL = "fptu-xperience-backend-v1";
const MAX_LEGACY_LENGTH = 512 * 1024;
const EMPTY_COLLECTOR: CollectorSnapshot = { profile: { displayName: "Student", bio: "", isPublic: false, featuredItemIds: [] }, copies: [], discoveredItemIds: [], wishlistItemIds: [] };
const AUTH_MESSAGES: Partial<Record<import("@/types/backend").BackendErrorCode, string>> = {
  ACCOUNT_EXISTS: "Tên tài khoản đã được sử dụng. Hãy chọn tên khác.",
  INVALID_CREDENTIALS: "Tên tài khoản hoặc mật khẩu không đúng.",
  INVALID_REQUEST: "Thông tin chưa hợp lệ. Kiểm tra tên tài khoản và mật khẩu.",
  ACCOUNT_REQUIRED: "Hãy đăng nhập tài khoản trước khi thực hiện thao tác này.",
  RATE_LIMITED: "Đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.",
  NO_SESSION: "Phiên đã hết hạn. Hãy tải lại dữ liệu rồi thử lại.",
  SESSION_CHANGED: "Tài khoản ở tab khác đã thay đổi. Hãy tải lại dữ liệu.",
};
export function hasLegacyProgress(raw: string | null): boolean {
  if (!raw || raw.length > MAX_LEGACY_LENGTH) return false;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    if ((candidate.version !== undefined && candidate.version !== 1 && candidate.version !== 2) ||
      !Number.isSafeInteger(candidate.exPoints) || (candidate.exPoints as number) < 0 || !Array.isArray(candidate.ownedItemIds) || !Array.isArray(candidate.history)) return false;
    const legacy = parseStoredState(raw), initial = createDemoState();
    return legacy.ownedItemIds.length > 0 || legacy.history.length > 0 || legacy.tradeHistory.length > 0 ||
      legacy.exPoints !== initial.exPoints || legacy.chestPity > 0 || Object.keys(legacy.equipped).length > 0 || JSON.stringify(legacy.settings) !== JSON.stringify(initial.settings);
  } catch { return false; }
}
function readLegacySave(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return hasLegacyProgress(raw) ? raw : null;
  } catch { return null; }
}
export function XperienceProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<BackendSnapshot | null>(null);
  // Do not present the prototype's initial balance as server-confirmed progress.
  const [emptyState] = useState(() => ({ ...createDemoState(), exPoints: 0 }));
  const [initialEconomy] = useState(() => emptyEconomy(0));
  const [initialSeason] = useState(() => emptySeason(0));
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("connecting");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const snapshotRef = useRef<BackendSnapshot | null>(null);
  const statusRef = useRef<BackendStatus>("connecting");
  const activeOpening = useRef<string | symbol | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const connectionController = useRef<AbortController | null>(null);
  const connectionPromise = useRef<Promise<void> | null>(null);
  const syncQueued = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const mounted = useRef(false);
  const setStatus = useCallback((status: BackendStatus, error: string | null = null) => {
    statusRef.current = status;
    if (mounted.current) { setBackendStatus(status); setBackendError(error); }
  }, []);
  const applySnapshot = useCallback((next: BackendSnapshot, allowPlayerChange = false) => {
    const current = snapshotRef.current;
    const accepted = reconcileBackendSnapshot(current, next, allowPlayerChange);
    if (accepted === current) return;
    snapshotRef.current = accepted;
    if (mounted.current) setSnapshot(accepted);
  }, []);
  const retryBackend = useCallback(async (): Promise<void> => {
    if (!mounted.current) return;
    if (activeOpening.current) { syncQueued.current = true; return; }
    if (connectionPromise.current) {
      // A newer cross-tab invalidation may have happened after the current read.
      syncQueued.current = true;
      return connectionPromise.current;
    }
    const controller = new AbortController();
    connectionController.current = controller;
    const reconnecting = statusRef.current !== "ready" || !snapshotRef.current;
    if (reconnecting) setStatus("connecting");
    const operation = (async () => {
      try {
        let next: BackendSnapshot;
        let allowPlayerChange = false;
        try {
          next = snapshotRef.current ? await readBackend(controller.signal) : await bootstrapBackend(controller.signal);
        } catch (error) {
          if (!(error instanceof BackendRequestError) || error.code !== "NO_SESSION") throw error;
          if (activeOpening.current) throw new BackendRequestError("Phiên đã hết hạn. Hãy kết nối lại sau thao tác hiện tại.", 409, "SESSION_CHANGED");
          setStatus("connecting");
          next = await bootstrapBackend(controller.signal);
          allowPlayerChange = true;
        }
        if (snapshotRef.current && next.player.id !== snapshotRef.current.player.id) {
          if (activeOpening.current) throw new BackendRequestError("Phiên đã thay đổi. Hãy kết nối lại.", 409, "SESSION_CHANGED");
          setStatus("connecting");
          // Resolve the cookie again before explicitly changing the active player.
          next = await bootstrapBackend(controller.signal);
          allowPlayerChange = true;
        }
        if (!mounted.current || controller.signal.aborted) return;
        applySnapshot(next, allowPlayerChange);
        setStatus("ready");
      } catch (error) {
        if (!mounted.current || controller.signal.aborted) return;
        setStatus("error", error instanceof Error ? error.message : "Không thể kết nối backend local.");
      } finally {
        if (connectionController.current === controller) {
          connectionController.current = null;
          connectionPromise.current = null;
          if (syncQueued.current && !activeOpening.current && statusRef.current === "ready") {
            syncQueued.current = false;
            queueMicrotask(() => { void retryBackend(); });
          }
        }
      }
    })();
    connectionPromise.current = operation;
    return operation;
  }, [applySnapshot, setStatus]);
  useEffect(() => {
    mounted.current = true;
    setLegacyAvailable(readLegacySave() !== null);
    void retryBackend();
    const sync = () => { if (document.visibilityState === "visible") void retryBackend(); };
    const legacyChanged = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setLegacyAvailable(readLegacySave() !== null);
    };
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const openedChannel = new BroadcastChannel(SYNC_CHANNEL);
        channel.current = openedChannel;
        openedChannel.onmessage = (event: MessageEvent<unknown>) => {
          if (event.data && typeof event.data === "object" && "type" in event.data && event.data.type === "invalidate") sync();
        };
      }
    } catch { /* Focus/visibility refresh still works if channels are unavailable. */ }
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("storage", legacyChanged);
    return () => {
      mounted.current = false;
      mutationController.current?.abort();
      connectionController.current?.abort();
      mutationController.current = null;
      connectionController.current = null;
      connectionPromise.current = null;
      activeOpening.current = null;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("storage", legacyChanged);
    };
  }, [retryBackend]);
  const runMutation = useCallback(async (command: BackendCommand): Promise<BackendCommandResult | null> => {
    const current = snapshotRef.current;
    if (!mounted.current || !current || statusRef.current !== "ready" || activeOpening.current) return null;
    const token = Symbol("pending backend command"), controller = new AbortController();
    activeOpening.current = token;
    // A pre-command GET must not later clear an uncertain command error or
    // confirm an older balance. Refresh again only after this command settles.
    if (connectionController.current) {
      connectionController.current.abort();
      connectionController.current = null;
      connectionPromise.current = null;
      syncQueued.current = true;
    }
    mutationController.current = controller;
    setIsPlaying(true);
    let reconnect = false;
    try {
      const reply = await sendBackendCommand(command, current.player.id, controller.signal);
      if (!mounted.current || controller.signal.aborted || activeOpening.current !== token) return null;
      applySnapshot(reply.snapshot);
      if ((command.type === "play" || command.type === "trade-up") && reply.result.success && "id" in reply.result && typeof reply.result.id === "string") activeOpening.current = reply.result.id;
      try { channel.current?.postMessage({ type: "invalidate" }); } catch { /* A later focus refresh is sufficient. */ }
      return reply.result;
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return null;
      reconnect = error instanceof BackendRequestError && (error.code === "NO_SESSION" || error.code === "SESSION_CHANGED");
      setStatus("error", error instanceof Error ? error.message : "Chưa thể xác nhận lưu dữ liệu. Hãy kết nối lại.");
      return null;
    } finally {
      if (mutationController.current === controller) mutationController.current = null;
      if (activeOpening.current === token) {
        activeOpening.current = null;
        if (mounted.current) setIsPlaying(false);
        if (reconnect || (syncQueued.current && statusRef.current === "ready")) {
          syncQueued.current = false;
          void retryBackend();
        }
      }
    }
  }, [applySnapshot, retryBackend, setStatus]);
  const playGame = useCallback(async (game: GameId): Promise<OpeningAttempt> => {
    if (statusRef.current !== "ready") return { success: false, reason: snapshotRef.current ? "STORAGE_UNAVAILABLE" : "NOT_READY" };
    if (activeOpening.current) return { success: false, reason: "BUSY" };
    return await runMutation({ type: "play", game }) as OpeningAttempt | null ?? { success: false, reason: "STORAGE_UNAVAILABLE" };
  }, [runMutation]);
  const tradeUp = useCallback(async (ids: string[]): Promise<TradeUpAttempt> => {
    if (statusRef.current !== "ready") return { success: false, reason: snapshotRef.current ? "STORAGE_UNAVAILABLE" : "NOT_READY" };
    if (activeOpening.current) return { success: false, reason: "BUSY" };
    return await runMutation({ type: "trade-up", itemIds: [...ids] }) as TradeUpAttempt | null ?? { success: false, reason: "STORAGE_UNAVAILABLE" };
  }, [runMutation]);
  const economyAction = useCallback(async (command: EconomyCommand): Promise<EconomyResult> => {
    if (statusRef.current !== "ready") return { success: false, reason: "NOT_READY" };
    if (activeOpening.current) return { success: false, reason: "BUSY" };
    return await runMutation(command) as EconomyResult | null ?? { success: false, reason: "STORAGE_UNAVAILABLE" };
  }, [runMutation]);
  const updateSettings = useCallback(async (settings: ArcadeSettings): Promise<boolean> => {
    if (!snapshotRef.current?.demoToolsEnabled || !validateArcadeSettings(settings)) return false;
    return (await runMutation({ type: "settings", settings: copyArcadeSettings(settings) }))?.success ?? false;
  }, [runMutation]);
  const completeOpening = useCallback((id: string) => {
    if (activeOpening.current !== id) return;
    activeOpening.current = null;
    if (mounted.current) setIsPlaying(false);
    if (syncQueued.current) { syncQueued.current = false; void retryBackend(); }
  }, [retryBackend]);
  const equipItem = useCallback(async (itemId: string) => (await runMutation({ type: "equip", itemId }))?.success ?? false, [runMutation]);
  const unequipItem = useCallback(async (slot: EquipSlot) => (await runMutation({ type: "unequip", slot }))?.success ?? false, [runMutation]);
  const resetDemoData = useCallback(async () => snapshotRef.current?.demoToolsEnabled ? (await runMutation({ type: "reset-demo" }))?.success ?? false : false, [runMutation]);
  const grantTestEx = useCallback(async () => snapshotRef.current?.demoToolsEnabled ? (await runMutation({ type: "grant-test-ex" }))?.success ?? false : false, [runMutation]);
  const importLegacy = useCallback(async () => {
    if (!snapshotRef.current?.demoToolsEnabled || !snapshotRef.current.canImportLegacy) return false;
    const raw = readLegacySave();
    if (!raw) { setLegacyAvailable(false); return false; }
    // The local save remains untouched as a backup. Only this explicit action uploads it.
    return (await runMutation({ type: "import-legacy", raw }))?.success ?? false;
  }, [runMutation]);
  const authAction = useCallback(async (action: AccountAction): Promise<boolean> => {
    const current = snapshotRef.current;
    if (!mounted.current || !current || statusRef.current !== "ready" || activeOpening.current) return false;
    const token = Symbol("pending account action"), controller = new AbortController();
    activeOpening.current = token;
    if (connectionController.current) {
      connectionController.current.abort(); connectionController.current = null; connectionPromise.current = null; syncQueued.current = true;
    }
    mutationController.current = controller;
    setAuthError(null); setIsPlaying(true);
    let reconnect = false;
    try {
      const next = await sendAccountAction(action, current.player.id, controller.signal);
      if (!mounted.current || controller.signal.aborted || activeOpening.current !== token) return false;
      applySnapshot(next, true);
      setStatus("ready");
      try { channel.current?.postMessage({ type: "invalidate" }); } catch { /* Focus refresh remains available. */ }
      return true;
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return false;
      const known = error instanceof BackendRequestError ? error.code : undefined;
      setAuthError(known && AUTH_MESSAGES[known] ? AUTH_MESSAGES[known]! : "Chưa thể xác nhận thao tác tài khoản. Kết nối lại để kiểm tra trạng thái.");
      reconnect = error instanceof BackendRequestError && (error.uncertain || known === "NO_SESSION" || known === "SESSION_CHANGED");
      if (reconnect) setStatus("error", "Cần tải lại trạng thái sau thao tác tài khoản.");
      return false;
    } finally {
      if (mutationController.current === controller) mutationController.current = null;
      if (activeOpening.current === token) {
        activeOpening.current = null;
        if (mounted.current) setIsPlaying(false);
        if (mounted.current && (reconnect || syncQueued.current)) { syncQueued.current = false; void retryBackend(); }
      }
    }
  }, [applySnapshot, retryBackend, setStatus]);
  const updateProfile = useCallback(async (profile: CollectorProfile): Promise<boolean> => {
    if (!validCollectorProfile(profile)) return false;
    return (await runMutation({ type: "profile-update", ...profile, featuredItemIds: [...profile.featuredItemIds] }))?.success ?? false;
  }, [runMutation]);
  const setCopyLock = useCallback(async (copyId: string, locked: boolean): Promise<boolean> => {
    if (typeof locked !== "boolean" || !snapshotRef.current?.collector?.copies.some(copy => copy.id === copyId)) return false;
    return (await runMutation({ type: "copy-lock", copyId, locked }))?.success ?? false;
  }, [runMutation]);
  const setWishlist = useCallback(async (itemId: string, wished: boolean): Promise<boolean> => {
    if (typeof wished !== "boolean" || typeof itemId !== "string" || !itemId || itemId.length > 200) return false;
    return (await runMutation({ type: "wishlist-update", itemId, wished }))?.success ?? false;
  }, [runMutation]);
  const state = snapshot?.state ?? emptyState;
  const hydrated = snapshot !== null && backendStatus === "ready";
  const demoToolsEnabled = snapshot?.demoToolsEnabled ?? false;
  const canImportLegacy = snapshot?.canImportLegacy ?? false;
  const economy = snapshot?.economy ?? initialEconomy;
  const season = snapshot?.season ?? initialSeason;
  const playerId = snapshot?.player.id ?? null;
  const account = snapshot?.account ?? null;
  const collector = snapshot?.collector ?? EMPTY_COLLECTOR;
  const value = useMemo(() => ({ state, hydrated, isPlaying, playGame, tradeUp, updateSettings, equipItem, unequipItem, completeOpening, resetDemoData, grantTestEx,
    economy, season, playerId, account, collector, authAction, authError, updateProfile, setCopyLock, setWishlist, economyAction, backendStatus, backendError, retryBackend, demoToolsEnabled, canImportLegacy, legacyAvailable, importLegacy }),
  [state, hydrated, isPlaying, playGame, tradeUp, updateSettings, equipItem, unequipItem, completeOpening, resetDemoData, grantTestEx,
    economy, season, playerId, account, collector, authAction, authError, updateProfile, setCopyLock, setWishlist, economyAction, backendStatus, backendError, retryBackend, demoToolsEnabled, canImportLegacy, legacyAvailable, importLegacy]);
  return <XperienceContext.Provider value={value}>{children}</XperienceContext.Provider>;
}
