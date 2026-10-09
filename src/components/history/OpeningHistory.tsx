"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Gem, History as HistoryIcon } from "lucide-react";
import { getCosmeticById } from "@/data/cosmetics";
import { GAME_CONFIG } from "@/data/arcadeConfig";
import { RarityBadge } from "@/components/chest/RarityBadge";
import { useXperience } from "@/hooks/useXperience";
import type { CosmeticItem, OpeningHistoryRecord, TradeUpHistoryRecord } from "@/types/gamification";

type ActivityEntry = { kind: "opening"; record: OpeningHistoryRecord } | { kind: "trade"; record: TradeUpHistoryRecord };
const PAGE_SIZE = 30;
const timeFormatter = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long", year: "numeric" });
const chanceFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const labelForDate = (timestamp: string) => {
  const date = new Date(timestamp); const today = new Date(); const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hôm nay";
  if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";
  return dateFormatter.format(date);
};

function HistoryArtwork({ item }: { item: CosmeticItem | undefined }) {
  return <div className="history-icon history-club-art" aria-hidden="true">{item?.image ? <Image src={item.image} alt="" width={52} height={52} sizes="52px"/> : null}</div>;
}

function OpeningRecord({ record }: { record: OpeningHistoryRecord }) {
  const item = getCosmeticById(record.itemId);
  if (!item) return null;
  return <article className="history-record">
    <HistoryArtwork item={item}/>
    <div className="history-main">
      <RarityBadge rarity={item.rarity}/><h3>{item.name}</h3>
      <time dateTime={record.timestamp}>{timeFormatter.format(new Date(record.timestamp))}</time>
      <span className="history-source">{GAME_CONFIG[record.game ?? "chest"].name}</span>
      {record.isDuplicate && <p className="history-duplicate-note">{record.compensation > 0 ? "Bản trùng cũ · đã hoàn EX theo cơ chế trước đây" : "Bản sao đã cất vào kho"}</p>}
    </div>
    <div className="history-cost"><span><Gem size={13}/> −{record.cost.toLocaleString("vi-VN")} EX</span>
      {record.isDuplicate && record.compensation > 0 && <small>+{record.compensation.toLocaleString("vi-VN")} EX · lịch sử cũ</small>}
      {(!record.isDuplicate || record.compensation === 0) && <small>+1 bản vào kho</small>}
    </div>
  </article>;
}

function TradeRecord({ record }: { record: TradeUpHistoryRecord }) {
  const item = record.rewardItemId ? getCosmeticById(record.rewardItemId) : undefined;
  const inputItem = record.inputItemIds.map(getCosmeticById).find(Boolean);
  return <article className={"history-record history-trade-record" + (record.won ? " trade-won" : " trade-lost")}>
    <HistoryArtwork item={record.won ? item : inputItem}/>
    <div className="history-main">
      <span className="history-trade-label">{record.won ? "ĐỔI ĐỒ · THÀNH CÔNG" : "ĐỔI ĐỒ · THẤT BẠI"}</span>
      <h3>{record.won ? item?.name ?? record.rewardItemName : "Không nhận được vật phẩm"}</h3>
      <time dateTime={record.timestamp}>{timeFormatter.format(new Date(record.timestamp))}</time>
      <span className="history-source">{chanceFormatter.format(record.chance)}% cơ hội thành công</span>
      <p className="history-trade-detail">Đã dùng {record.inputItemIds.length} {record.inputRarity} → {record.targetRarity}{record.isDuplicate ? " · Bản sao đã cất vào kho" : ""}</p>
    </div>
    <div className="history-cost"><span>−{record.inputItemIds.length} bản</span>
      {record.won ? <small>+1 {record.targetRarity}</small> : <small>Đồ đã dùng không hoàn lại</small>}
    </div>
  </article>;
}

export function OpeningHistory() {
  const { state, hydrated } = useXperience();
  const [page, setPage] = useState(0);
  const entries = useMemo(() => {
    const activity: ActivityEntry[] = [];
    for (const record of state.history) {
      if (getCosmeticById(record.itemId)) activity.push({ kind: "opening", record });
    }
    for (const record of state.tradeHistory) {
      if (record.won ? record.rewardItemId && getCosmeticById(record.rewardItemId) : record.inputItemIds.some(id => getCosmeticById(id))) {
        activity.push({ kind: "trade", record });
      }
    }
    return activity.sort((left, right) => Date.parse(right.record.timestamp) - Date.parse(left.record.timestamp));
  }, [state.history, state.tradeHistory]);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const groups = useMemo(() => entries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
    .reduce<Record<string, ActivityEntry[]>>((all, entry) => {
      const label = labelForDate(entry.record.timestamp); (all[label] ??= []).push(entry); return all;
    }, {}), [entries, currentPage]);

  if (!hydrated) return <div className="empty-state panel"><p>Đang tải lịch sử…</p></div>;
  if (!entries.length) return <div className="empty-state panel"><HistoryIcon size={28}/><h2>Hành trình bắt đầu từ đây</h2><p>Mở rương, vòng quay và mỗi lần đổi đồ thành công hoặc thất bại đều được ghi lại ở đây.</p><Link href="/chest" className="primary-button">Mở rương</Link></div>;
  return <><section className="history-list">{Object.entries(groups).map(([label, records]) =>
    <div className="history-day" key={label}><h2><CalendarClock size={16}/>{label}</h2><div className="history-records panel">{records.map(entry =>
      entry.kind === "opening" ? <OpeningRecord record={entry.record} key={"opening-" + entry.record.id}/> : <TradeRecord record={entry.record} key={"trade-" + entry.record.id}/>)}</div></div>)}</section>
    <div className="history-paging"><span role="status">{entries.length.toLocaleString("vi-VN")} hoạt động · Trang {currentPage + 1} / {totalPages}</span>
      {totalPages > 1 && <div><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trang trước</button><button className="secondary-button" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>Trang sau</button></div>}
    </div></>;
}
