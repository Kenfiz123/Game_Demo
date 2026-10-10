"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Check, LockKeyhole, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { CHEST_RARITIES, getRarityConfig } from "@/data/chestConfig";
import { cosmeticsByRarity } from "@/data/cosmetics";
import { createDefaultSettings, TRADE_UP_PATHS, validateArcadeSettings, validateChestOdds, validateTradeUpOdds } from "@/data/economyConfig";
import { useXperience } from "@/hooks/useXperience";
import type { ArcadeSettings, Rarity, TradeInputRarity } from "@/types/gamification";

interface OddsDraft {
  chestOdds: Record<Rarity, string>;
  tradeUpOdds: Record<TradeInputRarity, string>;
}
interface Notice { kind: "success" | "error" | "draft"; text: string; }
const percentage = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });
const itemPercentage = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 });
const chestRows = CHEST_RARITIES.map(config => ({ ...config, poolSize: cosmeticsByRarity(config.rarity).length }));
const probability = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
const isValidField = (value: string) => Number.isFinite(probability(value)) && probability(value) >= 0 && probability(value) <= 100;
const toDraft = (settings: ArcadeSettings): OddsDraft => ({
  chestOdds: Object.fromEntries(CHEST_RARITIES.map(({ rarity }) => [rarity, String(settings.chestOdds[rarity])])) as Record<Rarity, string>,
  tradeUpOdds: Object.fromEntries(TRADE_UP_PATHS.map(({ inputRarity }) => [inputRarity, String(settings.tradeUpOdds[inputRarity])])) as Record<TradeInputRarity, string>,
});
const toSettings = (draft: OddsDraft): ArcadeSettings => ({
  chestOdds: Object.fromEntries(CHEST_RARITIES.map(({ rarity }) => [rarity, probability(draft.chestOdds[rarity])])) as Record<Rarity, number>,
  tradeUpOdds: Object.fromEntries(TRADE_UP_PATHS.map(({ inputRarity }) => [inputRarity, probability(draft.tradeUpOdds[inputRarity])])) as Record<TradeInputRarity, number>,
});

function OddsEditor() {
  const { state, isPlaying, updateSettings, demoToolsEnabled } = useXperience();
  // This component mounts after server hydration; saved settings initialize the draft.
  const [draft, setDraft] = useState(() => toDraft(state.settings));
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);
  const saveInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const parsed = toSettings(draft);
  const chestValid = validateChestOdds(parsed.chestOdds);
  const tradeValid = validateTradeUpOdds(parsed.tradeUpOdds);
  const valid = validateArcadeSettings(parsed);
  const chestFieldsValid = CHEST_RARITIES.every(({ rarity }) => isValidField(draft.chestOdds[rarity]));
  const total = CHEST_RARITIES.reduce((sum, { rarity }) => sum + parsed.chestOdds[rarity], 0);
  const dirty = CHEST_RARITIES.some(({ rarity }) => parsed.chestOdds[rarity] !== state.settings.chestOdds[rarity]) ||
    TRADE_UP_PATHS.some(({ inputRarity }) => parsed.tradeUpOdds[inputRarity] !== state.settings.tradeUpOdds[inputRarity]);

  const editChest = (rarity: Rarity, value: string) => {
    setDraft(previous => ({ ...previous, chestOdds: { ...previous.chestOdds, [rarity]: value } }));
    setNotice(null);
  };
  const editTrade = (rarity: TradeInputRarity, value: string) => {
    setDraft(previous => ({ ...previous, tradeUpOdds: { ...previous.tradeUpOdds, [rarity]: value } }));
    setNotice(null);
  };
  const presetChest = (rarity: Rarity) => {
    setDraft(previous => ({ ...previous, chestOdds: Object.fromEntries(CHEST_RARITIES.map(config => [config.rarity, config.rarity === rarity ? "100" : "0"])) as Record<Rarity, string> }));
    setNotice({ kind: "draft", text: `Bản nháp rương 100% ${getRarityConfig(rarity).label}. Chỉ áp dụng sau khi bấm Lưu tỷ lệ.` });
  };
  const presetTrade = (chance: number) => {
    setDraft(previous => ({ ...previous, tradeUpOdds: Object.fromEntries(TRADE_UP_PATHS.map(path => [path.inputRarity, String(chance)])) as Record<TradeInputRarity, string> }));
    setNotice({ kind: "draft", text: `Bản nháp đổi đồ ${chance}% cho cả 4 bậc. Chỉ áp dụng sau khi bấm Lưu tỷ lệ.` });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveInFlight.current) return;
    if (!valid) { setNotice({ kind: "error", text: "Điền đủ tỷ lệ từ 0 đến 100%; tổng 6 độ hiếm của rương phải bằng 100%." }); return; }
    if (isPlaying) { setNotice({ kind: "error", text: "Chờ game đang chạy kết thúc rồi lưu tỷ lệ." }); return; }
    saveInFlight.current = true;
    setPending(true);
    setNotice(null);
    try {
      const saved = await updateSettings(parsed);
      if (mounted.current) setNotice(saved ? { kind: "success", text: "Đã lưu tỷ lệ trên server. Các lượt chơi tiếp theo sẽ dùng cấu hình này." } : { kind: "error", text: "Chưa lưu được. Kiểm tra kết nối backend hoặc chờ lượt chơi hiện tại kết thúc rồi thử lại." });
    } catch {
      if (mounted.current) setNotice({ kind: "error", text: "Chưa lưu được tỷ lệ. Kiểm tra kết nối backend rồi thử lại." });
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return <form className="odds-editor" onSubmit={submit} noValidate aria-busy={pending}>
    <fieldset className="odds-controls" disabled={pending || !demoToolsEnabled}><legend className="sr-only">Cấu hình tỷ lệ mở rương và đổi đồ</legend>
    <div className="odds-local-note"><LockKeyhole size={17}/><p>{demoToolsEnabled ? "Bảng test local: tỷ lệ được lưu riêng cho phiên ẩn danh trên server, không ảnh hưởng các phiên khác. Không áp dụng cho lượt chơi đã bắt đầu." : "Công cụ chỉnh tỷ lệ demo đã được tắt trên server. Tỷ lệ đang hiển thị là cấu hình của phiên này."}</p></div>
    <div className="odds-layout">
      <section className="odds-section panel" aria-labelledby="chest-odds-heading">
        <div className="odds-section-heading"><div><h2 id="chest-odds-heading">Tỷ lệ mở rương</h2><p>Chọn độ hiếm trước, rồi chọn ngẫu nhiên một vật phẩm trong bậc đó.</p></div><SlidersHorizontal size={20}/></div>
        <div className="odds-active-distribution" aria-label="Phân bố độ hiếm đang áp dụng">{chestRows.map(row => <span key={row.rarity} title={`${row.label}: ${percentage.format(state.settings.chestOdds[row.rarity])}%`} style={{ width: state.settings.chestOdds[row.rarity] + "%", backgroundColor: row.color }}/>)}</div>
        <div className="odds-table-head"><span>Độ hiếm / số vật phẩm</span><span>Bản nháp</span><span>Đang áp dụng</span></div>
        <div className="odds-rows">{chestRows.map(row => <div className="odds-row" key={row.rarity} style={{ "--odds-rarity": row.color } as CSSProperties}>
          <label className="odds-rarity-label" htmlFor={"chest-odds-" + row.rarity}><i/><span>{row.label}<small>{row.poolSize} vật phẩm ngẫu nhiên</small></span></label>
          <div className="odds-number"><input id={"chest-odds-" + row.rarity} name={"chest-" + row.rarity} type="number" inputMode="decimal" min="0" max="100" step="0.0001" required value={draft.chestOdds[row.rarity]} onChange={event => editChest(row.rarity, event.target.value)} aria-invalid={!isValidField(draft.chestOdds[row.rarity])} aria-describedby="chest-total-status"/><span aria-hidden="true">%</span></div>
          <div className="odds-saved-rate"><strong>{percentage.format(state.settings.chestOdds[row.rarity])}%</strong><small>{row.poolSize ? itemPercentage.format(state.settings.chestOdds[row.rarity] / row.poolSize) : "0"}% / vật phẩm</small></div>
        </div>)}</div>
        <div id="chest-total-status" className={"odds-total " + (chestValid ? "is-valid" : "is-invalid")} role="status" aria-live="polite"><span>Tổng bản nháp</span><strong>{Number.isFinite(total) ? percentage.format(total) + "%" : "Chưa đủ tỷ lệ"}</strong><small>{chestValid ? "Đủ 100% — có thể áp dụng" : chestFieldsValid ? "Điều chỉnh tổng về đúng 100%" : "Mỗi ô cần một số từ 0 đến 100"}</small></div>
        <div className="odds-test-presets"><span>Test nhanh · chỉ tạo bản nháp</span><div><button type="button" className="secondary-button" onClick={() => presetChest("COMMON")}>100% Common</button><button type="button" className="secondary-button" onClick={() => presetChest("MYTHIC")}>100% Mythic</button></div></div>
        <p className="odds-section-note">Mythic chỉ mở bằng rương, luôn đi qua ô bí mật trong hoạt ảnh. Vòng quay không có Mythic và không dùng bảng tỷ lệ này.</p>
      </section>
      <section className="odds-section panel" aria-labelledby="trade-odds-heading">
        <div className="odds-section-heading"><div><h2 id="trade-odds-heading">Tỷ lệ đổi đồ</h2><p>Mỗi hợp đồng dùng 5 đồ cùng bậc. Thành công nhận 1 đồ ngẫu nhiên của bậc kế tiếp; thất bại mất cả 5.</p></div></div>
        <div className="odds-rows odds-trade-rows">{TRADE_UP_PATHS.map(path => <div className="odds-trade-row" key={path.inputRarity}>
          <label htmlFor={"trade-odds-" + path.inputRarity}>5 {getRarityConfig(path.inputRarity).label}<strong>1 {getRarityConfig(path.targetRarity).label}</strong><small>Đang áp dụng {percentage.format(state.settings.tradeUpOdds[path.inputRarity])}%</small></label>
          <div className="odds-number"><input id={"trade-odds-" + path.inputRarity} name={"trade-" + path.inputRarity} type="number" inputMode="decimal" min="0" max="100" step="0.0001" required value={draft.tradeUpOdds[path.inputRarity]} onChange={event => editTrade(path.inputRarity, event.target.value)} aria-invalid={!isValidField(draft.tradeUpOdds[path.inputRarity])} aria-describedby="trade-validation-status"/><span aria-hidden="true">%</span></div>
        </div>)}</div>
        <p id="trade-validation-status" className={"odds-section-note" + (!tradeValid ? " odds-field-error" : "")}>{tradeValid ? "Mỗi bậc có xác suất riêng, không cần cộng thành 100%. Đổi đồ dừng ở Legendary; không thể đổi Legendary lên Mythic." : "Điền đủ 4 tỷ lệ; mỗi tỷ lệ là một số từ 0 đến 100%."}</p>
        <div className="odds-test-presets"><span>Test kết quả · chỉ tạo bản nháp</span><div><button type="button" className="secondary-button" onClick={() => presetTrade(100)}>Tất cả 100%</button><button type="button" className="secondary-button" onClick={() => presetTrade(0)}>Tất cả 0%</button></div></div>
      </section>
    </div>
    <div className="odds-save-bar panel">
      <div className="odds-save-status"><span className={dirty ? "has-draft" : ""}>{dirty ? "Có thay đổi chưa lưu" : "Bản nháp khớp tỷ lệ đang áp dụng"}</span><p>{isPlaying ? "Game đang chạy — chờ kết thúc để lưu." : "Chỉnh ô hoặc chọn preset không tự thay đổi tỷ lệ đang chơi."}</p></div>
      <div className="odds-save-actions"><button type="button" className="text-button" onClick={() => { setDraft(toDraft(createDefaultSettings())); setNotice({ kind: "draft", text: "Đã đưa tỷ lệ gốc vào bản nháp. Bấm Lưu tỷ lệ để áp dụng." }); }}><RotateCcw size={14}/> Tỷ lệ gốc</button><button type="button" className="secondary-button" disabled={!dirty} onClick={() => { setDraft(toDraft(state.settings)); setNotice({ kind: "draft", text: "Đã bỏ thay đổi, dùng lại tỷ lệ đang áp dụng." }); }}>Bỏ thay đổi</button><button type="submit" className="primary-button" disabled={!valid || !dirty || isPlaying || pending}><Save size={15}/> {pending ? "Đang lưu…" : "Lưu tỷ lệ"}</button></div>
    </div>
    </fieldset>
    {notice && <p className={"odds-notice notice-" + notice.kind} role={notice.kind === "error" ? "alert" : "status"}>{notice.kind === "success" ? <Check size={16}/> : null}{notice.text}</p>}
    {pending && <p className="odds-notice" role="status">Đang lưu tỷ lệ trên server…</p>}
    <p className="odds-footer-note">Đồ mở trùng vẫn thêm bản sao vào kho. <Link href="/chest">Mở rương</Link> hoặc <Link href="/trade-up">thử đổi đồ</Link> sau khi lưu.</p>
  </form>;
}

export function OddsSettings() {
  const { hydrated } = useXperience();
  return hydrated ? <OddsEditor/> : <div className="empty-state panel" role="status"><p>Đang tải tỷ lệ đã lưu trên server…</p></div>;
}
