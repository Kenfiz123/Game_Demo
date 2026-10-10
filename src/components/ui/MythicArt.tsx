"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { getClubById } from "@/data/clubs";
import { getMythicVariant } from "@/data/mythicCatalog";
import { observeVisibleMotion } from "@/lib/visibleMotion";
import type { CosmeticItem } from "@/types/gamification";

export const MYTHIC_HALO = "/assets/mythic-prism-halo.webp";
export const MYTHIC_FINISHES = {
  SOVEREIGN: "/assets/mythic-finishes/sovereign-v3.webp",
  AURORA: "/assets/mythic-finishes/aurora-v3.webp",
  CELESTIAL: "/assets/mythic-finishes/celestial-v3.webp",
  COMET: "/assets/mythic-finishes/comet-v3.webp",
  REGALIA: "/assets/mythic-finishes/regalia-v5.webp",
} as const;
const stars = [0, 1, 2, 3] as const;
const trails = [0, 1, 2] as const;
const embers = [0, 1, 2, 3, 4, 5] as const;
type ArtProps = { item: CosmeticItem; compact?: boolean; priority?: boolean; animated?: boolean };

/** Each crafted surround keeps its reflection aligned to the exact responsive alpha. */
function RoyalFinish({ src, variant, compact, priority }: {
  src: string; variant: string; compact: boolean; priority: boolean;
}) {
  const lustre = useRef<HTMLSpanElement>(null);
  return <div className={"royal-finish royal-finish-" + variant.toLowerCase() + " royal-motion"} aria-hidden="true">
    <Image src={src} alt="" width={640} height={640} sizes={compact ? "110px" : "(max-width: 700px) 260px, 300px"}
      priority={priority} onLoad={event => {
        if (!lustre.current) return;
        const mask = 'url("' + event.currentTarget.currentSrc + '")';
        lustre.current.style.maskImage = mask;
        lustre.current.style.setProperty("-webkit-mask-image", mask);
        lustre.current.dataset.lustreReady = "true";
      }}/>
    <span ref={lustre} className="royal-finish-lustre" data-lustre-ready="false">
      <span className="royal-finish-sweep royal-motion"/>
    </span>
  </div>;
}

/** A moving reflection is masked to the real item; the club crest never spins. */
function RoyalCore({ item, compact, priority, legacy = false }: Omit<ArtProps, "animated"> & { legacy?: boolean }) {
  const lustre = useRef<HTMLSpanElement>(null);
  return <div className={"royal-core" + (legacy ? " royal-legacy-crest" : "")}>
    {item.image ? <div className="royal-core-media">
      <Image src={item.image} alt="" width={512} height={512}
        sizes={legacy ? (compact ? "28px" : "72px") : (compact ? "96px" : "(max-width: 700px) 170px, 220px")}
        priority={priority} onLoad={event => {
          const node = lustre.current;
          if (!node) return;
          // Reuse the responsive image already in cache, not another eager 512px download.
          const mask = 'url("' + event.currentTarget.currentSrc + '")';
          node.style.maskImage = mask;
          node.style.setProperty("-webkit-mask-image", mask);
          node.dataset.lustreReady = "true";
        }}/>
      <span ref={lustre} className="royal-lustre" aria-hidden="true" data-lustre-ready="false">
        <span className="royal-metal-sweep royal-motion"/>
      </span>
    </div> : null}
  </div>;
}

/** Shared by chest reveals, collection cards and permanent equipped profiles. */
export function MythicArt({ item, compact = false, priority = false, animated = true }: ArtProps) {
  const shell = useRef<HTMLDivElement>(null);
  const variant = item.mythicVariant ?? "PRISM";
  const club = item.clubId ? getClubById(item.clubId) : undefined;
  const definition = getMythicVariant(variant);
  const finish = variant === "SOVEREIGN" || variant === "AURORA" || variant === "CELESTIAL" || variant === "COMET" || variant === "REGALIA"
    ? MYTHIC_FINISHES[variant] : undefined;
  useEffect(() => {
    if (!shell.current || !animated) return;
    return observeVisibleMotion(shell.current);
  }, [animated]);

  return <div ref={shell}
    className={"mythic-art royal-mythic variant-" + variant.toLowerCase() + (compact ? " royal-compact" : "")}
    data-item-id={item.id} data-mythic-variant={variant} data-mythic-fx="4"
    data-motion-active="false" data-motion-enabled={animated}>
    <div className="royal-aura" aria-hidden="true"/>
    {!compact ? <span className="royal-atmosphere royal-motion" aria-hidden="true"/> : null}
    {variant !== "LEGACY" ? <span className="royal-horizon" aria-hidden="true"/> : null}
    {finish ? <RoyalFinish key={variant} src={finish} variant={variant} compact={compact} priority={priority}/> : null}

    {variant === "PRISM" ? <>
      {["back", "front"].map(layer => <div className={"royal-prism royal-prism-" + layer + " royal-motion"} key={layer}>
        <Image src={MYTHIC_HALO} alt="" width={640} height={640} sizes={compact ? "110px" : "280px"} priority={priority}/>
      </div>)}
      {stars.slice(0, compact ? 2 : 4).map(shard => <span aria-hidden="true" className={"royal-shard royal-shard-" + shard + " royal-motion"} key={shard}/>)}
    </> : null}

    {variant === "SOVEREIGN" ? <>
      <span className="royal-court-aura royal-motion" aria-hidden="true"/>
      {[0, 1].map(jewel => <span className={"royal-court-jewel royal-court-jewel-" + jewel + " royal-motion"} aria-hidden="true" key={jewel}><i/></span>)}
    </> : null}

    {variant === "AURORA" ? <>
      <span className="royal-aurora-veil royal-motion" aria-hidden="true"/>
      {[0, 1].map(ribbon => <span className={"royal-light-ribbon royal-light-ribbon-" + ribbon + " royal-motion"} key={ribbon} aria-hidden="true">
        <svg className="royal-flow-geometry" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
          <path d="M8 71C-1 31 52 0 87 22C56 9 13 46 19 81Z" fill="currentColor" fillOpacity=".4"/>
          <path d="M10 70C3 34 52 8 85 22" stroke="#fff5d7" strokeWidth=".4" strokeOpacity=".9"/>
          <path d="M18 80C13 46 58 13 87 22" stroke="currentColor" strokeWidth="1.2" strokeOpacity=".8"/>
        </svg>
      </span>)}
    </> : null}

    {variant === "CELESTIAL" ? <>
      <span className="royal-galaxy-cloud royal-motion" aria-hidden="true"/>
      {[0, 1].map(orbit => <div className={"royal-orbit-track royal-orbit-track-" + orbit} key={orbit} aria-hidden="true">
        <span className={"royal-constellation royal-constellation-" + orbit + " royal-motion"}><i/><b/></span>
      </div>)}
    </> : null}

    {variant === "PHOENIX" ? <>
      <span className="royal-flare royal-motion" aria-hidden="true"/>
      <div className="royal-wing royal-motion"><Image src="/assets/mythic/phoenix-mantle.webp" alt="" width={512} height={512} sizes={compact ? "110px" : "280px"} priority={priority}/></div>
      {!compact ? [0, 1].map(plume => <span className={"royal-plume royal-plume-" + plume + " royal-motion"} key={plume} aria-hidden="true"/>) : null}
      {embers.slice(0, compact ? 3 : 6).map(ember => <span className={"royal-ember royal-ember-" + ember + " royal-motion"} key={ember} aria-hidden="true"/>)}
    </> : null}

    {variant === "COMET" ? <>
      <span className="royal-comet-field" aria-hidden="true"/>
      {!compact ? <span className="royal-comet-wake royal-motion" aria-hidden="true"/> : null}
      {trails.map(trail => <span className={"royal-comet royal-comet-" + trail + " royal-motion"} key={trail} aria-hidden="true"><i/></span>)}
    </> : null}

    {variant === "REGALIA" ? <>
      <span className="royal-regalia-bezel" aria-hidden="true"/>
      {!compact ? <span className="royal-regalia-radiance royal-motion" aria-hidden="true"/> : null}
      {stars.slice(0, compact ? 2 : 4).map(glint => <span className={"royal-regalia-glint royal-regalia-glint-" + glint + " royal-motion"} key={glint} aria-hidden="true"/>)}
    </> : null}

    {variant === "LEGACY" ? <div className="royal-legacy-plaque">
      <span className="royal-legacy-sweep royal-motion" aria-hidden="true"/>
      <span className="royal-title-line" aria-hidden="true"/>
      {!compact ? <span className="royal-title-dust royal-motion" aria-hidden="true"/> : null}
      {stars.map(corner => <span className={"royal-title-corner royal-title-corner-" + corner} key={corner} aria-hidden="true"/>)}
      <RoyalCore key={item.id} item={item} compact={compact} priority={priority} legacy/>
      <div className="royal-legacy-copy"><small>{club?.shortName} · MYTHIC</small><strong>{item.name}</strong><span>DI SẢN TRUYỀN NHÂN</span></div>
      <i className="royal-title-diamond royal-motion" aria-hidden="true"/>
    </div> : <RoyalCore key={item.id} item={item} compact={compact} priority={priority}/>}

    {variant !== "REGALIA" ? stars.slice(0, compact ? 2 : 4).map(star => <span key={star} className={"royal-star royal-star-" + star + " royal-motion"} aria-hidden="true"/>) : null}
    {variant !== "LEGACY" ? <span className="royal-signature"><b>{club?.shortName}</b><small>{definition.label}</small></span> : null}
  </div>;
}
