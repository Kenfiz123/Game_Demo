"use client";
import Image from "next/image";
import { useEffect, useId, useRef } from "react";
import { getClubById } from "@/data/clubs";
import { getMythicVariant } from "@/data/mythicCatalog";
import { observeVisibleMotion } from "@/lib/visibleMotion";
import type { CosmeticItem } from "@/types/gamification";

export const MYTHIC_HALO = "/assets/mythic-prism-halo.webp";
const stars = [0, 1, 2, 3] as const;
const trails = [0, 1, 2] as const;
const embers = [0, 1, 2, 3, 4, 5] as const;
type ArtProps = { item: CosmeticItem; compact?: boolean; priority?: boolean; animated?: boolean };

/** Animate the wrapper, keeping the soft SVG ribbon on one compositor layer. */
function AuroraRibbon({ index }: { index: number }) {
  const gradientId = useId();
  const curve = "M24 228C-2 146 43 42 128 36S276 114 277 38";
  return <span className={"royal-aurora royal-aurora-" + index + " royal-motion"}>
    <svg viewBox="0 0 300 300" fill="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id={gradientId} x1="28" y1="228" x2="243" y2="33" gradientUnits="userSpaceOnUse">
        <stop stopColor="currentColor" stopOpacity="0"/>
        <stop offset=".3" stopColor="currentColor" stopOpacity=".9"/>
        <stop offset=".7" stopColor="#fff5d7" stopOpacity=".8"/>
        <stop offset="1" stopColor="currentColor" stopOpacity="0"/>
      </linearGradient></defs>
      <g stroke={"url(#" + gradientId + ")"} strokeLinecap="round">
        <path d={curve} strokeWidth="30" opacity=".08"/>
        <path d={curve} strokeWidth="12" opacity=".18"/>
        <path d={curve} strokeWidth="1.5" opacity=".85"/>
      </g>
    </svg>
  </span>;
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
  useEffect(() => {
    if (!shell.current || !animated) return;
    return observeVisibleMotion(shell.current);
  }, [animated]);

  return <div ref={shell}
    className={"mythic-art royal-mythic variant-" + variant.toLowerCase() + (compact ? " royal-compact" : "")}
    data-item-id={item.id} data-mythic-variant={variant} data-mythic-fx="2"
    data-motion-active="false" data-motion-enabled={animated}>
    <div className="royal-aura" aria-hidden="true"/>
    {!compact ? <span className="royal-atmosphere royal-motion" aria-hidden="true"/> : null}
    {variant !== "LEGACY" ? <span className="royal-horizon" aria-hidden="true"/> : null}

    {variant === "PRISM" ? <>
      {["back", "front"].map(layer => <div className={"royal-prism royal-prism-" + layer + " royal-motion"} key={layer}>
        <Image src={MYTHIC_HALO} alt="" width={640} height={640} sizes={compact ? "110px" : "280px"} priority={priority}/>
      </div>)}
      {stars.slice(0, compact ? 2 : 4).map(shard => <span aria-hidden="true" className={"royal-shard royal-shard-" + shard + " royal-motion"} key={shard}/>)}
    </> : null}

    {variant === "SOVEREIGN" ? <>
      <span className="royal-seal-rays royal-motion" aria-hidden="true"/>
      <span className="royal-seal-ring" aria-hidden="true"/>
      <span className="royal-seal-sweep royal-motion" aria-hidden="true"/>
      {[0, 1].map(sigil => <span className={"royal-sigil royal-sigil-" + sigil} aria-hidden="true" key={sigil}/>)}
    </> : null}

    {variant === "AURORA" ? <div className="royal-aurora-field" aria-hidden="true">
      {trails.slice(0, compact ? 2 : 3).map(ribbon => <AuroraRibbon index={ribbon} key={ribbon}/>)}
    </div> : null}

    {variant === "CELESTIAL" ? <>
      <span className="royal-nebula royal-motion" aria-hidden="true"/>
      {trails.slice(0, compact ? 2 : 3).map(orbit => <div className={"royal-orbit-plane royal-orbit-plane-" + orbit} key={orbit} aria-hidden="true">
        <span className={"royal-orbit royal-orbit-" + orbit + " royal-motion"}><i className="royal-planet"/><b className="royal-satellite"/></span>
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
      {trails.map(trail => <span className={"royal-comet royal-comet-" + trail + " royal-motion"} key={trail} aria-hidden="true"><i/></span>)}
    </> : null}

    {variant === "REGALIA" ? <>
      <span className="royal-regalia-ring" aria-hidden="true"/>
      <svg className="royal-regalia-ornament" viewBox="0 0 240 240" fill="none" aria-hidden="true" focusable="false">
        <path d="M54 17H91M149 17H186L223 54V91M223 149V186L186 223H149M91 223H54L17 186V149M17 91V54L54 17"/>
        <path d="M72 30H56L30 56V72M168 30H184L210 56V72M210 168V184L184 210H168M72 210H56L30 184V168"/>
      </svg>
      <span className="royal-regalia-facet royal-motion" aria-hidden="true"/>
      {stars.map(gem => <span className={"royal-gem royal-gem-" + gem + " royal-motion"} key={gem} aria-hidden="true"/>)}
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
