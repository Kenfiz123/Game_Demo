"use client";

import { useId } from "react";
import Image from "next/image";

// The same engraved frame accompanies each club in the reel, collection and profile.
// Its emblem stays still and legible; the reveal owns the short lighting sequence.
export function LegendaryArt({ image, compact = false, priority = false }: {
  image: string; compact?: boolean; priority?: boolean;
}) {
  const id = useId().replaceAll(":", "");
  const metal = `legendary-metal-${id}`;
  const shade = `legendary-shade-${id}`;
  const jewel = `legendary-jewel-${id}`;
  return <div className="legendary-art" aria-hidden="true">
    <svg className="legendary-goldwork" viewBox="0 0 320 320" fill="none" focusable="false">
      <defs>
        <linearGradient id={metal} x1="55" y1="35" x2="265" y2="290" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff4cb"/><stop offset=".19" stopColor="#e9bf71"/>
          <stop offset=".38" stopColor="#8b541f"/><stop offset=".51" stopColor="#f9dda1"/>
          <stop offset=".7" stopColor="#c38a38"/><stop offset="1" stopColor="#714116"/>
        </linearGradient>
        <linearGradient id={shade} x1="160" y1="65" x2="160" y2="266" gradientUnits="userSpaceOnUse">
          <stop stopColor="#49331c"/><stop offset=".5" stopColor="#201a12"/><stop offset="1" stopColor="#0d1219"/>
        </linearGradient>
        <linearGradient id={jewel} x1="153" y1="0" x2="170" y2="17" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff5d8"/><stop offset=".42" stopColor="#f6c769"/><stop offset="1" stopColor="#92511e"/>
        </linearGradient>
      </defs>
      <g className="legendary-laurels" stroke={`url(#${metal})`} strokeWidth="1.5" strokeLinejoin="round">
        <path d="M131 277C72 258 35 207 46 127M189 277c59-19 96-70 85-150"/>
        {[0, 1, 2, 3, 4, 5].map(index => <g key={index} transform={`rotate(${index * -14} 160 164)`}>
          <path d="M48 166c-16-9-23-21-19-37 16 7 23 19 19 37Z" fill={`url(#${metal})`}/>
          <path d="M49 167c2-18 10-29 25-32-1 17-10 28-25 32Z" fill={`url(#${metal})`}/>
          <path d="m48 163-13-26m16 24 16-20" stroke="#fff1bd" strokeWidth=".65" opacity=".55"/>
        </g>)}
        {[0, 1, 2, 3, 4, 5].map(index => <g key={index} transform={`translate(320 0) scale(-1 1) rotate(${index * -14} 160 164)`}>
          <path d="M48 166c-16-9-23-21-19-37 16 7 23 19 19 37Z" fill={`url(#${metal})`}/>
          <path d="M49 167c2-18 10-29 25-32-1 17-10 28-25 32Z" fill={`url(#${metal})`}/>
          <path d="m48 163-13-26m16 24 16-20" stroke="#fff1bd" strokeWidth=".65" opacity=".55"/>
        </g>)}
      </g>
      <path d="m160 61 73 31 31 72-31 73-73 31-73-31-31-73 31-72Z" fill={`url(#${metal})`} stroke="#f6daa1"/>
      <path d="m160 68 68 29 29 67-29 68-68 29-68-29-29-68 29-67Z" fill={`url(#${shade})`} stroke="#543818" strokeWidth="2"/>
      <path d="m160 75 62 27 27 62-27 62-62 27-62-27-27-62 27-62Z" stroke={`url(#${metal})`} strokeWidth="2"/>
      <circle cx="160" cy="164" r="78" fill="#11161c" stroke={`url(#${metal})`} strokeWidth="4"/>
      <circle cx="160" cy="164" r="71" stroke="#a07538" strokeWidth=".8"/>
      <circle cx="160" cy="164" r="84" stroke="#ead096" strokeWidth=".6" strokeDasharray="1 6"/>
      <g fill={`url(#${metal})`} stroke="#f4d695" strokeLinejoin="round">
        <path d="m130 58-8-28 20 14 18-28 18 28 20-14-8 28Z"/>
        <path d="M131 61h58v8h-58Z"/>
        <path d="m160 247 13 22-13 24-13-24Z"/>
        <path d="m76 153 8 11-8 11-9-11Zm168 0 9 11-9 11-8-11Z"/>
      </g>
      <g fill={`url(#${jewel})`} stroke="#ffe9b6" strokeWidth=".8">
        <path d="m160 32 6 10-6 10-6-10Z"/>
        <path d="m160 256 7 13-7 13-7-13Z"/>
        <path d="m76 158 4 6-4 6-4-6Zm168 0 4 6-4 6-4-6Z"/>
      </g>
      <path d="M113 84c14-7 31-13 47-16m-68 35-15 35m151 54-15 35m-25 15-28 12" stroke="#fff3c7" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="m144 303 16-5 16 5-16 5Z" fill={`url(#${metal})`}/>
    </svg>
    <div className="legendary-emblem"><Image src={image} alt="" width={180} height={180} sizes={compact ? "70px" : "(max-width: 700px) 128px, 160px"} priority={priority}/></div>
    <span className="legendary-reflection"/>
  </div>;
}
