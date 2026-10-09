import Image from "next/image";
export function ChestVisual({ charging }: { charging: boolean }) {
  return <div className={"chest-stage" + (charging ? " is-charging" : "")} aria-hidden="true">
    <div className="stage-platform"/><div className="stage-orbit"/><div className="chest-halo"/>
    <div className="chest-object"><Image className="chest-art" src="/assets/chest-premium.webp" alt="" width={900} height={600} sizes="(max-width: 600px) 340px, 500px" priority draggable={false}/></div>
    <span className="stage-coordinate coordinate-left">XP / 001</span><span className="stage-coordinate coordinate-right">ORIGIN SERIES</span>
  </div>;
}
