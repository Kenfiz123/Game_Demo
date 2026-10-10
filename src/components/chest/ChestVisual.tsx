"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import { observeVisibleMotion } from "@/lib/visibleMotion";
export function ChestVisual({ charging }: { charging: boolean }) {
  const object = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = object.current;
    if (element) return observeVisibleMotion(element);
  }, []);
  return <div className={"chest-stage" + (charging ? " is-charging" : "")} aria-hidden="true">
    <div className="stage-platform"/><div className="stage-orbit"/><div className="chest-halo"/>
    <div ref={object} className="chest-object" data-motion-active="false"><Image className="chest-art" src="/assets/chest-premium.webp" alt="" width={900} height={600} sizes="(max-width: 600px) 340px, 500px" priority draggable={false}/></div>
    <span className="stage-coordinate coordinate-left">XP / 001</span><span className="stage-coordinate coordinate-right">NIÊM PHONG · FPTU</span>
  </div>;
}
