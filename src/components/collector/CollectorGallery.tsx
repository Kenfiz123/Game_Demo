"use client";
import { useState } from "react";
import Link from "next/link";
import { Pause, Play, Gem } from "lucide-react";
import { CosmeticArt } from "@/components/ui/CosmeticArt";
import { getClubById } from "@/data/clubs";
import { getMythicVariant } from "@/data/mythicCatalog";
import type { CosmeticItem } from "@/types/gamification";

export function CollectorGallery({ displayName, bio, username, items, publicView = false }: {
  displayName: string; bio: string; username?: string; items: readonly CosmeticItem[]; publicView?: boolean;
}) {
  const [activeId, setActiveId] = useState("");
  const [paused, setPaused] = useState(false);
  const active = items.find(item => item.id === activeId) ?? items[0];
  const club = active?.clubId ? getClubById(active.clubId) : undefined;
  return <section className="collector-gallery" aria-label="Phòng trưng bày Mythic">
    <div className="collector-identity"><div><p className="collector-gallery-label">Phòng trưng bày Mythic</p><h1>{displayName || "Nhà sưu tầm"}</h1>{username ? <span className="collector-handle">@{username}</span> : <span className="collector-handle">Hồ sơ khách · lưu trong phiên hiện tại</span>}</div><p>{bio || "Mỗi bảo vật là một lần khám phá. Đây là những dấu ấn được chọn để lưu giữ."}</p></div>
    {active ? <>
      <div className="collector-stage" data-showroom-item={active.id}>
        <div className="collector-stage-art"><CosmeticArt key={active.id} item={active} animated={!paused} priority/></div>
        <div className="collector-stage-caption"><span>{club?.shortName}{club ? ` · ${club.campus}` : ""}</span><h2>{active.name}</h2><p>{getMythicVariant(active.mythicVariant).label} · Mythic</p><button type="button" className="collector-motion-button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15}/> : <Pause size={15}/>} {paused ? "Bật chuyển động" : "Tạm dừng chuyển động"}</button></div>
      </div>
      <div className="collector-exhibits" role="group" aria-label="Chọn bảo vật trưng bày">{items.map(item => <button type="button" key={item.id} aria-pressed={item.id === active.id} onClick={() => setActiveId(item.id)}><CosmeticArt item={item} compact animated={false}/><span>{item.name}</span></button>)}</div>
    </> : <div className="collector-empty-stage"><Gem size={36}/><h2>{publicView ? "Chưa có bảo vật được trưng bày" : "Dành một vị trí cho Mythic đầu tiên"}</h2><p>{publicView ? "Nhà sưu tầm chưa chọn vật phẩm nổi bật." : "Chọn tối đa ba Mythic đã sở hữu bên dưới. Việc trưng bày không cấp thêm hay tiêu hao vật phẩm."}</p>{!publicView ? <Link className="secondary-button" href="/chest">Khám phá rương</Link> : null}</div>}
  </section>;
}
