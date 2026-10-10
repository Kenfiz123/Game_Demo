"use client";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { ChestVisual } from "./ChestVisual";
import { RewardReveal } from "./RewardReveal";
import { RewardReel } from "./RewardReel";
import { useRewardGame } from "@/hooks/useRewardGame";
import { ArcadeHeading } from "@/components/arcade/ArcadeHeading";
import { GameAside } from "@/components/arcade/GameAside";
import { RewardCatalog } from "@/components/arcade/RewardCatalog";
import { COSMETICS } from "@/data/cosmetics";
export function ChestOpening() {
  const game = useRewardGame("chest");
  const router = useRouter();
  const rolling = game.phase === "rolling" || game.phase === "settling";
  const currentStep = game.phase === "result" ? 2 : rolling ? 1 : 0;
  const actionLabel = game.phase === "charging" ? "Đang mở niêm phong…" :
    game.phase === "settling" ? "Đang xác nhận vật phẩm…" : rolling ? "Đang khám phá…" : "Đang tải bộ sưu tập…";
  const controlNote = game.phase === "charging" ? "Niêm phong đang mở. Vật phẩm vẫn được giữ bí mật." :
    rolling ? "Kết quả chỉ được công bố sau khi dải vật phẩm dừng lại." :
      game.canAfford ? "Mỗi rương nhận 1 vật phẩm. Bản trùng vẫn được giữ trong kho." :
        `Bạn cần ${game.cost} EX để mở rương. Tham gia hoạt động để nhận thêm EX.`;
  return <div className="page-wrap arcade-page chest-experience"><ArcadeHeading game="chest"/>
    <div className="game-layout"><section ref={game.panelRef} className="game-panel chest-panel" aria-label="Rương bí ẩn">
      <div className="panel-topline"><span><LockKeyhole size={13}/> BỘ SƯU TẬP FPTU</span><span>01 / RƯƠNG BÍ ẨN</span></div>
      <ol className="chest-journey" aria-label="Tiến trình mở rương">
        {["Niêm phong", "Khám phá", "Sở hữu"].map((label, index) => <li key={label} aria-current={currentStep === index ? "step" : undefined} className={index < currentStep ? "is-complete" : undefined}>
          <span aria-hidden="true">0{index + 1}</span><span>{label}</span>
        </li>)}
      </ol>
      {game.phase !== "result" && <div className="game-intro"><span className="chest-intro-eyebrow">XPERIENCE · DẤU ẤN CLB</span><h2 id="chest-title">Mỗi lần mở,<br/><em>một khám phá.</em></h2><p>Logo, avatar và danh hiệu mang bản sắc CLB — từ Common đến Mythic.</p></div>}
      <div className={"game-stage phase-" + game.phase} aria-busy={game.disabled}>
        {game.phase === "result" && game.opening ?
          <RewardReveal reward={game.opening.reward} cost={game.cost} onOpenAgain={game.start} onInventory={() => router.push("/inventory")} onClose={game.close}/> :
          <>{rolling && game.opening ? <RewardReel key={game.opening.id} reward={game.opening.reward} settled={game.phase === "settling"} onLanded={game.onLanded}/> : <ChestVisual charging={game.phase === "charging"}/>}
            <div className="game-controls"><div className="cost-label"><span className="ex-symbol">EX</span><strong>{game.cost}</strong><span>/ rương</span></div>
              <button className="primary-button play-button" onClick={game.start} disabled={game.disabled}>
                {game.disabled ? <><LockKeyhole size={16}/>{actionLabel}</> : <><Sparkles size={17}/> Mở rương bí ẩn <ArrowRight size={17}/></>}
              </button><span className="control-note">{controlNote}</span></div></>}
      </div>
      {game.error && <div className="notice" role="alert"><AlertCircle size={16}/>{game.error}</div>}
      <div className="panel-bottomline"><span><i/> {COSMETICS.length} VẬT PHẨM SƯU TẦM</span><span>6 ĐỘ HIẾM · 1 VẬT PHẨM MỖI RƯƠNG</span></div>
    </section><GameAside game="chest"/></div><RewardCatalog/></div>;
}
