import { CHEST_PITY_LIMIT } from "@/lib/chestPity";
import type { GamePhase } from "@/types/gamification";

export interface CapturedChestPity { playerId: string | null; count: number; pending: boolean; }

/** A freshly saved roll must not reveal its rarity through a reset or increment. */
export function visibleChestPity(serverCount: number, captured: CapturedChestPity | null, phase: GamePhase, playerId: string | null): number {
  const concealed = captured?.pending || phase === "charging" || phase === "rolling" || phase === "settling";
  return captured && captured.playerId === playerId && concealed ? captured.count : serverCount;
}

export function ChestPity({ count, hydrated }: { count: number; hydrated: boolean }) {
  const remaining = CHEST_PITY_LIMIT - count;
  const guaranteed = hydrated && remaining === 1;
  const status = !hydrated ? "Đang tải bảo chứng đã lưu…" : guaranteed ? "Rương tiếp theo chắc chắn nhận Mythic." : `Còn tối đa ${remaining} rương để chắc chắn nhận Mythic.`;
  return <section className={"chest-pity" + (guaranteed ? " is-guaranteed" : "")} aria-label="Bảo chứng Mythic">
    <div className="chest-pity-heading"><span>Pity · Bảo chứng Mythic</span><strong>{hydrated ? count : "—"}<small> / {CHEST_PITY_LIMIT}</small></strong></div>
    <progress className="chest-pity-progress" value={hydrated ? count : 0} max={CHEST_PITY_LIMIT} aria-label="Số rương liên tiếp chưa nhận Mythic" aria-valuetext={hydrated ? `${count} trên ${CHEST_PITY_LIMIT}. ${status}` : "Chưa tải dữ liệu bảo chứng"}/>
    <p className="chest-pity-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    <p className="chest-pity-rule">Sau {CHEST_PITY_LIMIT - 1} rương liên tiếp chưa có Mythic, rương thứ {CHEST_PITY_LIMIT} bảo đảm Mythic. Trúng sớm sẽ đếm lại từ 0; chỉ tính mở rương.</p>
  </section>;
}
