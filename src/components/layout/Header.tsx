"use client";
import Link from "next/link";
import { ArrowUpFromLine, Coins, Flame, Gift, History, Menu, Orbit, Package, ShoppingBag, SlidersHorizontal, Sparkles, Trophy, UserRound, UsersRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useXperience } from "@/hooks/useXperience";
import { getCosmeticById } from "@/data/cosmetics";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
export const navigation = [
  { label: "Rương bí ẩn", shortLabel: "Rương", href: "/chest", icon: Trophy },
  { label: "Lucky Orbit", shortLabel: "Vòng quay", href: "/orbit", icon: Orbit },
  { label: "Đổi đồ", shortLabel: "Đổi đồ", href: "/trade-up", icon: ArrowUpFromLine },
  { label: "Lò Thần Thoại", shortLabel: "Luyện", href: "/forge", icon: Flame },
  { label: "Sự kiện XCoin", shortLabel: "Sự kiện", href: "/events", icon: Gift },
  { label: "Chợ người chơi", shortLabel: "Chợ", href: "/market", icon: ShoppingBag },
  { label: "Bộ CLB", shortLabel: "CLB", href: "/clubs", icon: UsersRound },
  { label: "Kho đồ", shortLabel: "Kho đồ", href: "/inventory", icon: Package },
  { label: "Lịch sử", shortLabel: "Lịch sử", href: "/history", icon: History },
  { label: "Tỷ lệ", shortLabel: "Tỷ lệ", href: "/settings", icon: SlidersHorizontal },
];
const quickNavigation = ["/chest", "/events", "/market", "/forge", "/inventory"].map(href => navigation.find(entry => entry.href === href)!);
export function Header() {
  const pathname = usePathname();
  const { state, hydrated, economy } = useXperience();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const currentPage = navigation.find(entry => entry.href === pathname)?.label ?? "Không gian trải nghiệm";
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  const candidateAvatar = hydrated && state.equipped.AVATAR ? getCosmeticById(state.equipped.AVATAR) : undefined;
  const candidateTitle = hydrated && state.equipped.TITLE ? getCosmeticById(state.equipped.TITLE) : undefined;
  const equippedAvatar = candidateAvatar?.rarity === "MYTHIC" && candidateAvatar.type === "AVATAR" && state.ownedItemIds.includes(candidateAvatar.id) ? candidateAvatar : undefined;
  const equippedTitle = candidateTitle?.rarity === "MYTHIC" && candidateTitle.type === "TITLE" && state.ownedItemIds.includes(candidateTitle.id) ? candidateTitle : undefined;
  return <>
    <header className="site-header">
      <Link href="/chest" className="brand" aria-label="FPTU Xperience — về rương">
        <span className="brand-mark"><Sparkles size={22} /></span>
        <span><b>FPTU</b> XPERIENCE<small>DẤU ẤN CỦA BẠN.</small></span>
      </Link>
      <div className="header-breadcrumb">Không gian trải nghiệm <span>/</span> <strong>{currentPage}</strong></div>
      <div className="header-actions">
        <Link href="/events" className="xcoin-pill" aria-label={hydrated ? `${economy.coinBalance.toLocaleString("vi-VN")} XCoin — xem sự kiện` : "Đang tải ví XCoin"}>
          <Coins size={17}/><strong>{hydrated ? economy.coinBalance.toLocaleString("vi-VN") : "—"}</strong><span>XC</span>
        </Link>
        <div className="ex-pill" aria-label={hydrated ? state.exPoints.toLocaleString("vi-VN") + " EX" : "Đang tải điểm EX"}>
          <span className="ex-symbol">EX</span><strong>{hydrated ? state.exPoints.toLocaleString("vi-VN") : "—"}</strong>
        </div>
        <Link href="/inventory" className="profile-button header-equipped-profile" aria-label="Xem hồ sơ và trang bị"><span className={"avatar" + (equippedAvatar ? " header-equipped-avatar" : "")}>{equippedAvatar ? <CosmeticArt item={equippedAvatar} compact animated/> : <UserRound size={17}/>}</span><span>Student<small className={equippedTitle ? "header-equipped-title" : ""} title={equippedTitle?.name}>{equippedTitle ? <><span className="header-title-effects" aria-hidden="true"><CosmeticArt item={equippedTitle} compact animated/></span><span>{equippedTitle.name}</span></> : "FPT University"}</small></span></Link>
        <button ref={menuButton} className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? "Đóng điều hướng" : "Mở điều hướng"}>{menuOpen ? <X /> : <Menu />}</button>
      </div>
    </header>
    {menuOpen && <nav id="mobile-menu" className="mobile-menu" aria-label="Điều hướng di động">{navigation.map(({ label, href, icon: Icon }) =>
      <Link href={href} key={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon size={18}/>{label}</Link>)}</nav>}
    <nav className="bottom-nav" aria-label="Điều hướng nhanh">{quickNavigation.map(({ label, shortLabel, href, icon: Icon }) =>
      <Link href={href} key={href} aria-label={label} aria-current={pathname === href ? "page" : undefined}><Icon size={19} /><span>{shortLabel}</span></Link>)}</nav>
  </>;
}
