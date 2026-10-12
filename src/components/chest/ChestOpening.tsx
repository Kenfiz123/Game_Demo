"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, LockKeyhole, Sparkles, Volume2, VolumeX } from "lucide-react";
import { ChestVisual } from "./ChestVisual";
import { RewardReveal } from "./RewardReveal";
import { RewardReel } from "./RewardReel";
import { ChestPity, visibleChestPity, type CapturedChestPity } from "./ChestPity";
import { useRewardGame } from "@/hooks/useRewardGame";
import { useChestAudio } from "@/hooks/useChestAudio";
import { useXperience } from "@/hooks/useXperience";
import { getChestPity } from "@/lib/chestPity";
import { ArcadeHeading } from "@/components/arcade/ArcadeHeading";
import { GameAside } from "@/components/arcade/GameAside";
import { RewardCatalog } from "@/components/arcade/RewardCatalog";
import { COSMETICS } from "@/data/cosmetics";
import audioStyles from "./ChestAudioControls.module.css";
export function ChestOpening() {
  const game = useRewardGame("chest");
  const { state, hydrated, playerId } = useXperience();
  const audio = useChestAudio(game.phase, game.opening?.id, game.opening?.reward.item.rarity);
  const [capturedPity, setCapturedPity] = useState<CapturedChestPity | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const openChest = () => {
    if (game.disabled || inFlight.current) return;
    inFlight.current = true;
    // Capture before even awaiting the network: the provider saves the result
    // while the previous idle/result screen can still be on screen.
    setCapturedPity({ playerId, count: getChestPity(state), pending: true });
    setRequestError(null);
    audio.unlock();
    void game.start().catch(() => {
      if (mounted.current) setRequestError("Chưa thể xác nhận lượt mở. Hãy kết nối lại và kiểm tra lịch sử trước khi chơi tiếp.");
    }).finally(() => {
      inFlight.current = false;
      if (mounted.current) setCapturedPity(current => current ? { ...current, pending: false } : current);
    });
  };
  const pityCount = visibleChestPity(getChestPity(state), capturedPity, game.phase, playerId);
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
      <div className={audioStyles.controls} aria-label="Âm thanh mở rương">
        <button type="button" className={audioStyles.toggle} aria-pressed={audio.enabled} onClick={audio.toggle} title={audio.enabled ? "Tắt âm thanh mở rương" : "Bật âm thanh mở rương"}>
          {audio.enabled ? <Volume2 size={15} aria-hidden="true"/> : <VolumeX size={15} aria-hidden="true"/>}<span>Âm thanh {audio.enabled ? "bật" : "tắt"}</span>
        </button>
        <label className={audioStyles.volume}><span>Âm lượng</span><input className={audioStyles.range} type="range" min="0" max="100" step="5" value={Math.round(audio.volume * 100)} aria-label="Âm lượng mở rương" onChange={(event) => audio.setVolume(Number(event.target.value) / 100)}/></label>
        {!audio.available && <span className={audioStyles.hint} role="status">Trình duyệt chưa cho phép âm thanh.</span>}
      </div>
      <ol className="chest-journey" aria-label="Tiến trình mở rương">
        {["Niêm phong", "Khám phá", "Sở hữu"].map((label, index) => <li key={label} aria-current={currentStep === index ? "step" : undefined} className={index < currentStep ? "is-complete" : undefined}>
          <span aria-hidden="true">0{index + 1}</span><span>{label}</span>
        </li>)}
      </ol>
      <ChestPity count={pityCount} hydrated={hydrated}/>
      {game.phase !== "result" && <div className="game-intro"><span className="chest-intro-eyebrow">XPERIENCE · DẤU ẤN CLB</span><h2 id="chest-title">Mỗi lần mở,<br/><em>một khám phá.</em></h2><p>Logo, avatar và danh hiệu mang bản sắc CLB — từ Common đến Mythic.</p></div>}
      <div className={"game-stage phase-" + game.phase} aria-busy={game.disabled}>
        {game.phase === "result" && game.opening ?
          <RewardReveal reward={game.opening.reward} cost={game.cost} onOpenAgain={openChest} onInventory={() => router.push("/inventory")} onClose={game.close}/> :
          <>{rolling && game.opening ? <RewardReel key={game.opening.id} reward={game.opening.reward} settled={game.phase === "settling"} onLanded={game.onLanded}/> : <ChestVisual charging={game.phase === "charging"}/>}
            <div className="game-controls"><div className="cost-label"><span className="ex-symbol">EX</span><strong>{game.cost}</strong><span>/ rương</span></div>
              <button className="primary-button play-button" onClick={openChest} disabled={game.disabled}>
                {game.disabled ? <><LockKeyhole size={16}/>{actionLabel}</> : <><Sparkles size={17}/> Mở rương bí ẩn <ArrowRight size={17}/></>}
              </button><span className="control-note">{controlNote}</span></div></>}
      </div>
      {(game.error || requestError) && <div className="notice" role="alert"><AlertCircle size={16}/>{game.error || requestError}</div>}
      <div className="panel-bottomline"><span><i/> {COSMETICS.length} VẬT PHẨM SƯU TẦM</span><span>6 ĐỘ HIẾM · 1 VẬT PHẨM MỖI RƯƠNG</span></div>
    </section><GameAside game="chest"/></div><RewardCatalog/></div>;
}
