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
  const { state, hydrated, resetDemoData, isPlaying, demoToolsEnabled } = useXperience();
  const [resetArmed, setResetArmed] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { count, copies } = useMemo(() => {
    const validIds = state.ownedItemIds.filter(id => getCosmeticById(id));
    return { count: new Set(validIds).size, copies: validIds.length };
  }, [state.ownedItemIds]);
  return <aside className="sidebar">
    <div className="sidebar-label">KHÔNG GIAN CỦA BẠN</div>
    <div className="sidebar-section"><Gamepad2 size={17}/> Trải nghiệm <span>04</span></div>
    <nav aria-label="Điều hướng trải nghiệm">{navigation.map(({ label, href, icon: Icon }) =>
      <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={18}/>{label}{href === "/trade-up" && <em>NEW</em>}</Link>)}</nav>
    <div className="collection-progress">
      <span><BookOpen size={15}/> Bộ sưu tập</span><strong>{hydrated ? count : "—"} <small>/ {COSMETICS.length}</small></strong>
      <div className="collection-track"><i style={{ width: count / COSMETICS.length * 100 + "%" }}/></div>
      <p>{hydrated ? copies.toLocaleString("vi-VN") : "—"} bản trong kho · {hydrated ? count : "—"} mẫu khác nhau.</p><Link href="/inventory">Xem kho đồ <ArrowUpRight size={14}/></Link>
    </div>
    <div className="sidebar-footer"><ShieldCheck size={17}/><p>EX trải nghiệm.<br/>Dấu ấn của riêng bạn.</p></div>
    {demoToolsEnabled && <div className="demo-control">
      {resetArmed ? <><p>Xóa EX, XCoin, kho, trang bị, lịch sử và tỷ lệ của phiên này? Tin rao đang mở cũng bị hủy. Thưởng đã nhận hôm nay, giao dịch hoàn tất và bản lưu trình duyệt cũ không bị xóa.</p><button disabled={isPlaying || !hydrated} onClick={async () => {
        const ok = await resetDemoData();
        if (!mounted.current) return;
        setMessage(ok ? "Đã đặt lại phiên demo trên server." : "Chưa đặt lại được. Kiểm tra kết nối backend."); setResetArmed(false);
      }}>Xác nhận đặt lại</button><button onClick={() => setResetArmed(false)}>Hủy</button></> :
      <button disabled={isPlaying || !hydrated} onClick={() => setResetArmed(true)}><RotateCcw size={12}/> Đặt lại demo</button>}
      <span role="status">{message}</span>
    </div>}
  </aside>;
}
