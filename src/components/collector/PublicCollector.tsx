"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { readPublicProfile } from "@/lib/backendClient";
import { getCosmeticById } from "@/data/cosmetics";
import { getEquipSlot } from "@/lib/equipmentEngine";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import type { EquipSlot } from "@/types/gamification";
import { deriveClubCollection, selectFeaturedMythics } from "@/lib/collectorCatalog";
import type { PublicCollectorProfile } from "@/types/collector";
import { CollectorGallery } from "./CollectorGallery";
import "./collector.css";

export function PublicCollector({ username }: { username: string }) {
  const [profile, setProfile] = useState<PublicCollectorProfile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readPublicProfile(username, controller.signal).then(value => { if (!controller.signal.aborted) { setProfile(value); setError(""); } }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải hồ sơ. Hãy thử lại.");
    });
    return () => controller.abort();
  }, [username, attempt]);
  if (error) return <div className="collector-empty-stage"><h1>Hồ sơ chưa thể hiển thị</h1><p>{error}</p><p>Hồ sơ riêng tư hoặc chưa tồn tại sẽ không được công khai.</p><div className="collector-editor-actions"><button type="button" className="secondary-button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Thử lại</button><Link className="secondary-button" href="/profile">Hồ sơ của tôi</Link></div></div>;
  if (!profile) return <div className="collector-loading" role="status">Đang mở phòng trưng bày…</div>;
  const progress = deriveClubCollection(profile.discoveredItemIds, []);
  const complete = progress.filter(row => row.complete);
  const discovered = progress.reduce((sum, row) => sum + row.discovered, 0);
  const equipment = (Object.entries(profile.equipped) as [EquipSlot, string][]).flatMap(([slot, id]) => {
    const item = getCosmeticById(id);
    return item && getEquipSlot(item) === slot ? [item] : [];
  });
  return <div className="collector-page"><nav className="collector-page-links" aria-label="Khu vực nhà sưu tầm"><Link href="/profile">Hồ sơ của tôi</Link><Link href="/collection">Sổ bộ sưu tập CLB</Link></nav><CollectorGallery displayName={profile.displayName} bio={profile.bio} username={profile.username} items={selectFeaturedMythics(profile.featuredItemIds)} publicView/>{equipment.length ? <section className="collector-public-equipment"><h2>Trang bị đang dùng</h2><ul>{equipment.map(item => <li key={item.id}><CosmeticArt item={item} compact animated={false}/><span>{item.name}</span></li>)}</ul></section> : null}<section className="collector-public-record"><h2>Hành trình sưu tầm</h2><p>{discovered} mẫu từng khám phá · {complete.length} bộ CLB hoàn chỉnh</p>{complete.length ? <ul>{complete.map(row => <li key={row.club.id}>Bộ hoàn chỉnh: {row.club.shortName} · {row.club.campus}</li>)}</ul> : <p>Những trang đầu tiên vẫn đang được viết.</p>}<small>Huy hiệu bộ hoàn chỉnh chỉ ghi nhận tiến độ trong game, không xác nhận thành tích hay tư cách thành viên CLB.</small></section></div>;
}
