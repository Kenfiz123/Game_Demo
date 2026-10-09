"use client";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Gamepad2, RotateCcw, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { navigation } from "./Header";
import { useXperience } from "@/hooks/useXperience";
import { COSMETICS, getCosmeticById } from "@/data/cosmetics";
export function Sidebar() {
  const pathname = usePathname();
  const { state, hydrated, resetDemoData, isPlaying } = useXperience();
  const [resetArmed, setResetArmed] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { count, copies } = useMemo(() => {
    const validIds = state.ownedItemIds.filter(id => getCosmeticById(id));
    return { count: new Set(validIds).size, copies: validIds.length };
  }, [state.ownedItemIds]);
  return <aside className="sidebar">
    <div className="sidebar-label">YOUR XPERIENCE</div>
    <div className="sidebar-section"><Gamepad2 size={17}/> Reward arcade <span>03</span></div>
    <nav aria-label="Arcade navigation">{navigation.map(({ label, href, icon: Icon }) =>
      <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={18}/>{label}{href === "/trade-up" && <em>NEW</em>}</Link>)}</nav>
    <div className="collection-progress">
      <span><BookOpen size={15}/> Your collection</span><strong>{hydrated ? count : "—"} <small>/ {COSMETICS.length}</small></strong>
      <div className="collection-track"><i style={{ width: count / COSMETICS.length * 100 + "%" }}/></div>
      <p>{hydrated ? copies.toLocaleString("vi-VN") : "—"} bản trong kho · {hydrated ? count : "—"} mẫu khác nhau.</p><Link href="/inventory">Xem kho đồ <ArrowUpRight size={14}/></Link>
    </div>
    <div className="sidebar-footer"><ShieldCheck size={17}/><p>Campus points.<br/>Real self-expression.</p></div>
    <div className="demo-control">
      {resetArmed ? <><p>Reset your EX, collection, activity and probability settings?</p><button disabled={isPlaying} onClick={async () => {
        const ok = await resetDemoData();
        if (!mounted.current) return;
        setMessage(ok ? "Demo progress reset." : "Unable to reset. Check browser storage."); setResetArmed(false);
      }}>Confirm reset</button><button onClick={() => setResetArmed(false)}>Cancel</button></> :
      <button disabled={isPlaying || !hydrated} onClick={() => setResetArmed(true)}><RotateCcw size={12}/> Reset demo data</button>}
      <span role="status">{message}</span>
    </div>
  </aside>;
}
