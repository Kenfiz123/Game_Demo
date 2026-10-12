"use client";
import { useEffect, useRef, useState } from "react";
import { X, Fingerprint } from "lucide-react";
import { readItemPassport } from "@/lib/backendClient";
import { getCosmeticById } from "@/data/cosmetics";
import type { ItemOrigin, ItemPassport, ItemTrailEntry } from "@/types/collector";
import "./collector.css";

const originLabels: Record<ItemOrigin, string> = { CHEST: "Rương bí ẩn", ORBIT: "Lucky Orbit", TRADE_UP: "Đổi đồ", FORGE: "Lò Thần Thoại", LEGACY: "Dữ liệu trước khi có serial", IMPORT: "Nhập kho cũ", SEASON: "Mùa sưu tầm S1" };
const trailLabels: Record<ItemTrailEntry["kind"], string> = { MINT: "Ghi nhận bản gốc", TRANSFER: "Chuyển chủ sở hữu", LIST: "Đưa lên chợ", RETURN: "Trở về kho", CONSUME: "Đã dùng làm nguyên liệu" };
const date = (value: string | null) => value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : "Không có thời điểm gốc";

export function ItemPassportContent({ passport }: { passport: ItemPassport }) {
  const item = getCosmeticById(passport.copy.itemId);
  const oldCopy = passport.copy.origin === "LEGACY" || passport.copy.origin === "IMPORT";
  return <><p className="collector-passport-name">{item?.name ?? "Vật phẩm đã lưu"}</p><code className="collector-serial">{passport.copy.serial}</code><dl className="collector-passport-facts"><div><dt>Nguồn gốc</dt><dd>{originLabels[passport.copy.origin]}</dd></div><div><dt>Ngày nhận bản gốc</dt><dd>{date(passport.copy.mintedAt)}</dd></div><div><dt>Được ghi nhận từ</dt><dd>{date(passport.copy.recordedAt)}</dd></div><div><dt>{oldCopy && passport.copy.transferCount === 0 ? "Mốc đồng bộ kho hiện tại" : "Ngày vào kho hiện tại"}</dt><dd>{date(passport.copy.acquiredAt)}</dd></div><div><dt>Người nhận đầu tiên</dt><dd>{passport.copy.originalOwnerName || (oldCopy ? "Chưa được ghi nhận" : "Người chơi ẩn danh")}</dd></div><div><dt>Số lần chuyển chủ</dt><dd>{passport.copy.transferCount}</dd></div></dl>{oldCopy ? <p className="collector-note">Serial được gắn khi đồng bộ kho cũ. Không suy đoán ngày mở hoặc người nhận ban đầu nếu chưa được ghi nhận.</p> : null}<h3>Hành trình của bản này</h3>{passport.trail.length ? <ol className="collector-passport-trail">{passport.trail.map((entry, index) => <li key={`${entry.kind}-${entry.timestamp}-${index}`}><strong>{entry.kind === "MINT" && passport.copy.origin === "IMPORT" ? "Ghi nhận kho được nhập" : trailLabels[entry.kind]}</strong><time dateTime={entry.timestamp}>{date(entry.timestamp)}</time>{entry.ownerName ? <span>{entry.ownerName}</span> : null}</li>)}</ol> : <p className="collector-note">Chưa có nhật ký cho bản sao trước mốc đồng bộ.</p>}<p className="collector-note">Mỗi bản sao có serial riêng. Đây là dấu vết trong hệ thống local, không phải NFT hay chứng nhận quyền sở hữu ngoài game.</p></>;
}

/** Mount only while open. Native modal owns Escape, focus trapping and the inert backdrop. */
export function ItemPassportDialog({ copyId, onClose }: { copyId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [passport, setPassport] = useState<ItemPassport | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => { node?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    readItemPassport(copyId, controller.signal).then(value => { if (!controller.signal.aborted) setPassport(value); }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không thể tải dấu ấn vật phẩm.");
    });
    return () => controller.abort();
  }, [copyId, attempt]);
  // Cleanup closes the native element too (including React Strict Mode replay).
  // Only user actions dismiss parent state; an asynchronous native close event
  // from that cleanup must not dismiss the next mounted/reopened dialog.
  return <dialog className="collector-passport-dialog" ref={dialog} aria-labelledby="item-passport-heading" onCancel={event => { event.preventDefault(); closeRef.current(); }}><header><h2 id="item-passport-heading"><Fingerprint size={22}/>Dấu ấn vật phẩm</h2><button type="button" autoFocus aria-label="Đóng dấu ấn vật phẩm" onClick={onClose}><X size={20}/></button></header>{passport ? <ItemPassportContent passport={passport}/> : error ? <div role="alert"><p>{error}</p><button className="secondary-button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Thử lại</button></div> : <p role="status">Đang tải serial và lịch sử bản sao…</p>}</dialog>;
}
