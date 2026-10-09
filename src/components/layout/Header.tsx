"use client";
import Link from "next/link";
import { ArrowUpFromLine, History, Menu, Orbit, Package, SlidersHorizontal, Sparkles, Trophy, UserRound, UsersRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useXperience } from "@/hooks/useXperience";
import { getCosmeticById } from "@/data/cosmetics";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
export const navigation = [
  { label: "Mystery Chest", shortLabel: "Rương", href: "/chest", icon: Trophy },
  { label: "Lucky Orbit", shortLabel: "Vòng quay", href: "/orbit", icon: Orbit },
  { label: "Đổi đồ", shortLabel: "Đổi đồ", href: "/trade-up", icon: ArrowUpFromLine },
  { label: "Bộ CLB", shortLabel: "CLB", href: "/clubs", icon: UsersRound },
  { label: "Kho đồ", shortLabel: "Kho đồ", href: "/inventory", icon: Package },
  { label: "Lịch sử", shortLabel: "Lịch sử", href: "/history", icon: History },
  { label: "Tỷ lệ", shortLabel: "Tỷ lệ", href: "/settings", icon: SlidersHorizontal },
];
export function Header() {
  const pathname = usePathname();
  const { state, hydrated } = useXperience();
  const [menuOpen, setMenuOpen] = useState(false);
  const candidateAvatar = hydrated && state.equipped.AVATAR ? getCosmeticById(state.equipped.AVATAR) : undefined;
  const candidateTitle = hydrated && state.equipped.TITLE ? getCosmeticById(state.equipped.TITLE) : undefined;
  const equippedAvatar = candidateAvatar?.rarity === "MYTHIC" && candidateAvatar.type === "AVATAR" && state.ownedItemIds.includes(candidateAvatar.id) ? candidateAvatar : undefined;
  const equippedTitle = candidateTitle?.rarity === "MYTHIC" && candidateTitle.type === "TITLE" && state.ownedItemIds.includes(candidateTitle.id) ? candidateTitle : undefined;
  return <>
    <header className="site-header">
      <Link href="/chest" className="brand" aria-label="FPTU Xperience home">
        <span className="brand-mark"><Sparkles size={22} /></span>
        <span><b>FPTU</b> XPERIENCE<small>THE CAMPUS IS YOURS.</small></span>
      </Link>
      <div className="header-breadcrumb">Student life <span>/</span> <strong>Reward arcade</strong></div>
      <div className="header-actions">
        <div className="ex-pill" aria-label={hydrated ? state.exPoints.toLocaleString() + " EX points" : "Loading balance"}>
          <span className="ex-symbol">EX</span><strong>{hydrated ? state.exPoints.toLocaleString() : "—"}</strong>
        </div>
        <Link href="/inventory" className="profile-button header-equipped-profile" aria-label="Xem hồ sơ và trang bị"><span className={"avatar" + (equippedAvatar ? " header-equipped-avatar" : "")}>{equippedAvatar ? <CosmeticArt item={equippedAvatar} compact animated/> : <UserRound size={17}/>}</span><span>Student<small className={equippedTitle ? "header-equipped-title" : ""} title={equippedTitle?.name}>{equippedTitle ? <><span className="header-title-effects" aria-hidden="true"><CosmeticArt item={equippedTitle} compact animated/></span><span>{equippedTitle.name}</span></> : "FPT University"}</small></span></Link>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
      </div>
    </header>
    {menuOpen && <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation">{navigation.map(({ label, href, icon: Icon }) =>
      <Link href={href} key={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon size={18}/>{label}</Link>)}</nav>}
    <nav className="bottom-nav" aria-label="Quick navigation">{navigation.map(({ label, shortLabel, href, icon: Icon }) =>
      <Link href={href} key={href} aria-label={label} aria-current={pathname === href ? "page" : undefined}><Icon size={19} /><span>{shortLabel}</span></Link>)}</nav>
  </>;
}
