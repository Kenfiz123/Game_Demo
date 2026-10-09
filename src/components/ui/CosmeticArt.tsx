import Image from "next/image";
import { MythicArt } from "./MythicArt";
import { getRarityConfig } from "@/data/chestConfig";
import { getClubById } from "@/data/clubs";
import type { CosmeticItem } from "@/types/gamification";
import type { CSSProperties } from "react";
export function CosmeticArt({ item, compact = false, priority = false, animated = true }: { item: CosmeticItem; compact?: boolean; priority?: boolean; animated?: boolean }) {
  const rarity = getRarityConfig(item.rarity);
  const club = item.clubId ? getClubById(item.clubId) : undefined;
  if (!club) return null;
  const style = { "--art-color": rarity.color, "--club-color": club?.color ?? rarity.color } as CSSProperties;
  return <div className={"cosmetic-art art-" + item.type.toLowerCase() + (compact ? " art-compact" : "") + (club ? " club-art" : "") + (item.rarity === "MYTHIC" ? " art-mythic" : "")} style={style} aria-hidden="true">
    {item.rarity === "MYTHIC" ? <MythicArt item={item} compact={compact} priority={priority} animated={animated}/> :
    item.type === "TITLE" ?
      <div className="club-title-plate"><Image src={club.image} alt="" width={56} height={56} sizes="56px" priority={priority}/><span>{item.name}<small>{club.shortName}</small></span></div> :
      item.type === "AVATAR" ?
        <div className="club-avatar-frame"><Image src={club.image} alt="" width={144} height={144} sizes={compact ? "80px" : "144px"} priority={priority}/><span className="avatar-jewel"/></div> :
      item.type === "BADGE" ?
        <div className="club-badge-shield"><Image src={club.image} alt="" width={128} height={128} sizes={compact ? "70px" : "128px"} priority={priority}/><span/></div> :
      item.type === "FRAME" ?
        <div className="club-legendary-frame"><Image src={club.image} alt="" width={144} height={144} sizes={compact ? "80px" : "144px"} priority={priority}/><span/><span/></div> :
        <Image className="club-crest-image" src={club.image} alt="" width={192} height={192} sizes={compact ? "96px" : "(max-width: 700px) 140px, 192px"} priority={priority}/>}
  </div>;
}
