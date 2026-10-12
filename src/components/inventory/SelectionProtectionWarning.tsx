"use client";
import { ShieldAlert } from "lucide-react";
import { getCosmeticById } from "@/data/cosmetics";

export function SelectionProtectionWarning({ lastCopyIds, lastUnlockedCopyIds, equippedItemIds, accepted, disabled, onAccept }: {
  lastCopyIds: readonly string[]; lastUnlockedCopyIds: readonly string[]; equippedItemIds: readonly string[]; accepted: boolean; disabled: boolean; onAccept: (accepted: boolean) => void;
}) {
  if (!lastCopyIds.length && !lastUnlockedCopyIds.length && !equippedItemIds.length) return null;
  const names = (ids: readonly string[]) => ids.map(id => getCosmeticById(id)?.name ?? "Vật phẩm đã lưu").join(", ");
  return <div className="selection-protection-warning" role="group" aria-label="Cảnh báo vật phẩm cần giữ">
    <strong><ShieldAlert size={17} aria-hidden="true"/> Kiểm tra vật phẩm quý của bạn</strong>
    {lastCopyIds.length > 0 ? <p>Bạn đang dùng hết các bản đang có của: {names(lastCopyIds)}. Mẫu này sẽ không còn trong kho sau lượt đổi, dù kết quả thế nào.</p> : null}
    {lastUnlockedCopyIds.length > 0 ? <p>Bạn đang dùng hết các bản chưa khóa của: {names(lastUnlockedCopyIds)}. Những bản đã khóa vẫn được giữ nguyên, nhưng sẽ không còn bản sẵn dùng làm nguyên liệu.</p> : null}
    {equippedItemIds.length > 0 ? <p>Đang chọn vật phẩm được trang bị: {names(equippedItemIds)}. Nếu dùng hết bản sao, vật phẩm sẽ được gỡ khỏi hồ sơ.</p> : null}
    <label><input type="checkbox" checked={accepted} disabled={disabled} onChange={event => onAccept(event.target.checked)}/><span>Tôi vẫn muốn tiêu hao những bản sao này.</span></label>
  </div>;
}
