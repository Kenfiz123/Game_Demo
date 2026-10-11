"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Gift, RefreshCw } from "lucide-react";
import { EVENT_TASKS } from "@/data/eventEconomy";
import { useXperience } from "@/hooks/useXperience";
import type { EventId } from "@/types/economy";
import { CoinSeal, EconomyNav, EconomyNotice, WalletBalance, economyError } from "./EconomyChrome";
import styles from "./economy.module.css";

export function EventHall() {
  const { economy, hydrated, isPlaying, economyAction, retryBackend } = useXperience();
  const [pending, setPending] = useState<EventId | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const claimed = new Set(economy.claimedEventIds);
  const totalRewards = EVENT_TASKS.reduce((sum, task) => sum + task.reward, 0);
  const earned = EVENT_TASKS.reduce((sum, task) => sum + (claimed.has(task.id) ? task.reward : 0), 0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function claim(eventId: EventId) {
    if (inFlight.current || !hydrated || isPlaying) return;
    inFlight.current = true;
    setPending(eventId); setMessage("");
    try {
      const result = await economyAction({ type: "claim-event", eventId });
      if (!mounted.current) return;
      setError(!result.success);
      setMessage(result.success ? `Đã nhận ${result.coinsAwarded ?? 0} XCoin vào ví.` : economyError(result.reason));
    } catch { if (mounted.current) { setError(true); setMessage(economyError("STORAGE_UNAVAILABLE")); } }
    finally { inFlight.current = false; if (mounted.current) setPending(null); }
  }

  return <div className={`page-wrap ${styles.page}`}>
    <header className={styles.pageHeading}><div><h1>Sự kiện XCoin</h1><p>Khám phá mỗi ngày. Tích coin để giao dịch và chạm tới Mythic.</p></div><WalletBalance balance={economy.coinBalance} ready={hydrated}/></header>
    <EconomyNav current="/events"/>
    <section className={styles.eventBanner} aria-labelledby="event-title">
      <div className={styles.eventSeal}><CoinSeal/></div>
      <div className={styles.eventIntroduction}><span className={styles.eventSeason}>Hành trình di sản</span><h2 id="event-title">Một ngày khám phá.<br/>Thêm một cơ hội quý giá.</h2><p>XCoin là đồng coin sự kiện của Xperience. Mua vật phẩm từ người chơi khác hoặc dùng làm nguyên liệu nâng 5 Legendary thành 1 Mythic.</p><div className={styles.inlineLinks}><Link href="/market">Ghé chợ người chơi <ArrowUpRight size={15}/></Link><Link href="/forge">Khám phá lò Mythic <ArrowUpRight size={15}/></Link></div></div>
      <div className={styles.eventDaily}><Gift size={23}/><strong>{totalRewards}<span>XCoin / ngày</span></strong><p>Đã nhận {hydrated ? earned : "—"} / {totalRewards} hôm nay</p></div>
    </section>
    <div className={styles.sectionHeading}><div><h2>Nhiệm vụ hôm nay</h2><p>Mỗi thưởng nhận một lần. Làm mới lúc 00:00, giờ Việt Nam.</p></div><button className={styles.subtleButton} disabled={!hydrated || isPlaying || pending !== null} onClick={() => { setMessage(""); void retryBackend(); }}><RefreshCw size={15}/> Cập nhật</button></div>
    <div className={styles.eventLedger}>{EVENT_TASKS.map(task => {
      const progress = task.metric === "visit" ? (hydrated ? 1 : 0) : economy.progress[task.metric];
      const complete = progress >= task.target;
      const received = claimed.has(task.id);
      return <section className={styles.task} key={task.id} data-claimed={received}>
        <div className={styles.taskReward}><CoinSeal small/><strong>+{task.reward}<span>XCoin</span></strong></div>
        <div className={styles.taskCopy}><h3>{task.name}</h3><p>{task.description}</p><div className={styles.taskProgress}><progress value={Math.min(progress, task.target)} max={task.target} aria-label={`${task.name}: ${Math.min(progress, task.target)} trên ${task.target}`}/><span>{hydrated ? Math.min(progress, task.target) : "—"} / {task.target}</span></div></div>
        <div className={styles.taskAction}><button className={received ? styles.claimedButton : styles.goldButton} disabled={!hydrated || isPlaying || pending !== null || !complete || received} onClick={() => void claim(task.id)}>{received ? <><Check size={16}/> Đã nhận</> : pending === task.id ? "Đang nhận…" : complete ? "Nhận XCoin" : "Chưa hoàn thành"}</button>{!complete && <Link href={task.metric === "trades" ? "/trade-up" : "/chest"}>{task.metric === "trades" ? "Đến đổi đồ" : "Đến mở rương"} <ArrowUpRight size={12}/></Link>}</div>
      </section>;
    })}</div>
    {message && <EconomyNotice error={error}>{message}</EconomyNotice>}
    <aside className={styles.policy}><CoinsNote/><div><h3>Coin ảo, trải nghiệm thật</h3><p>XCoin chỉ dùng trong bản demo; không mua bằng tiền, không quy đổi hoặc rút tiền. Ví và nhiệm vụ được lưu cùng phiên người chơi trên backend local.</p></div></aside>
  </div>;
}

function CoinsNote() { return <Gift size={20} aria-hidden="true"/>; }
