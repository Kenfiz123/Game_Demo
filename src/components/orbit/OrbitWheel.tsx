"use client";
import type { CSSProperties } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { MOTION, ORBIT_SECTORS, orbitLandingRotation } from "@/data/arcadeConfig";
import { getRarityConfig } from "@/data/chestConfig";
const point = (angle: number, radius: number) => {
  const radians = angle * Math.PI / 180;
  return [200 + radius * Math.sin(radians), 200 - radius * Math.cos(radians)];
};
export function OrbitWheel({ spinning, settled, sectorIndex = 0, onLanded }: {
  spinning: boolean; settled: boolean; sectorIndex?: number; onLanded: () => void;
}) {
  return <div className={"orbit-machine" + (settled ? " is-settled" : "")} role="img" aria-label="Lucky Orbit wheel. Eight equal sectors, each with a 12.5 percent chance.">
    <div className="orbit-outer-ring"/><ChevronDown className="orbit-pointer" size={28} aria-hidden="true"/>
    <div className={"orbit-rotor" + (spinning ? " is-spinning" : "")} style={{
      "--orbit-turn": orbitLandingRotation(sectorIndex) + "deg", "--spin-duration": MOTION.orbit + "ms",
    } as CSSProperties} onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && event.animationName === "orbit-spin") onLanded();
    }}>
      <svg viewBox="0 0 400 400" aria-hidden="true">
        <circle cx="200" cy="200" r="184" fill="#0e1723"/>
        {ORBIT_SECTORS.map((rarity, index) => {
          const a = index * 45; const b = a + 45;
          const start = point(a, 180); const end = point(b, 180); const label = point(a + 22.5, 132);
          const color = getRarityConfig(rarity).color;
          return <g key={index}>
            <path d={`M 200 200 L ${start[0]} ${start[1]} A 180 180 0 0 1 ${end[0]} ${end[1]} Z`} fill={color} fillOpacity=".12" stroke="#0b131e" strokeWidth="3"/>
            <path d={`M ${start[0]} ${start[1]} A 180 180 0 0 1 ${end[0]} ${end[1]}`} fill="none" stroke={color} strokeOpacity=".6" strokeWidth="3"/>
            <g transform={`translate(${label[0]},${label[1]}) rotate(${a + 22.5})`}>
              <path d="M0 -26 L7 -18 L0 -10 L-7 -18 Z" fill={color} fillOpacity=".85"/>
              <text textAnchor="middle" y="4" fill={color} fontSize="9" fontWeight="700" letterSpacing="1">{rarity}</text>
            </g>
          </g>;
        })}
        <circle cx="200" cy="200" r="77" fill="#0a111b" stroke="#3a3d42" strokeWidth="2"/>
      </svg>
    </div>
    <div className="orbit-hub" aria-hidden="true"><Sparkles size={25}/><strong>X</strong><span>PERIENCE</span></div>
    <div className="orbit-dot dot-one"/><div className="orbit-dot dot-two"/><div className="orbit-dot dot-three"/><div className="orbit-dot dot-four"/>
  </div>;
}
