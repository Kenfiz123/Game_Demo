"use client";

import Link from "next/link";
import { CalendarDays, Coins, Flame, Store } from "lucide-react";
import styles from "./economy.module.css";

const destinations = [
  { href: "/events", label: "Sự kiện", Icon: CalendarDays },
  { href: "/market", label: "Chợ người chơi", Icon: Store },
  { href: "/forge", label: "Luyện Mythic", Icon: Flame },
] as const;

export function EconomyNav({ current }: { current: string }) {
  return <nav className={styles.nav} aria-label="Sự kiện và giao dịch XCoin">
    {destinations.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={current === href ? "page" : undefined}><Icon size={17}/>{label}</Link>)}
  </nav>;
}

export function CoinSeal({ small = false }: { small?: boolean }) {
  return <span className={small ? styles.smallCoin : styles.coinSeal} aria-hidden="true"><span/><b>✦</b><i/></span>;
}

export function WalletBalance({ balance, ready }: { balance: number; ready: boolean }) {
  return <div className={styles.wallet}><Coins size={20} aria-hidden="true"/><div><span>XCoin của bạn</span><strong>{ready ? balance.toLocaleString("vi") : "—"}<small>XC</small></strong></div></div>;
}

export function EconomyNotice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p className={error ? styles.error : styles.notice} role={error ? "alert" : "status"}>{children}</p>;
}

export function economyError(reason?: string): string {
  const messages: Record<string, string> = {
    BUSY: "Một lượt chơi khác đang xử lý. Hãy đợi hoàn tất rồi thử lại.",
    NOT_READY: "Đang kết nối kho và ví. Hãy thử lại khi kết nối hoàn tất.",
    STORAGE_UNAVAILABLE: "Chưa xác nhận được giao dịch. Kết nối lại và kiểm tra ví, kho hoặc lịch sử trước khi thử lại; thao tác vừa gửi có thể đã được lưu.",
    EVENT_NOT_READY: "Nhiệm vụ chưa hoàn thành. Làm đủ yêu cầu rồi nhận thưởng.",
    EVENT_ALREADY_CLAIMED: "Bạn đã nhận phần thưởng này hôm nay. Hãy quay lại vào ngày tiếp theo.",
    ALREADY_CLAIMED: "Bạn đã nhận phần thưởng này hôm nay.",
    INSUFFICIENT_COINS: "Chưa đủ XCoin. Nhận thêm từ sự kiện hoặc giảm lượng coin sử dụng.",
    INSUFFICIENT_ITEMS: "Kho đã thay đổi. Một số bản sao không còn sẵn; hãy chọn lại.",
    INVALID_SELECTION: "Chọn đúng 5 bản sao Legendary còn trong kho.",
    INVALID_COINS: "Phải dùng từ 10 đến 250 XCoin, theo bội số của 10 và không vượt số dư. Tỷ lệ luyện từ 1% đến tối đa 25%.",
    INVALID_PRICE: "Giá bán phải là số nguyên từ 1 đến 1.000.000 XCoin.",
    ITEM_NOT_OWNED: "Vật phẩm này không còn trong kho. Hãy chọn món khác.",
    LISTING_UNAVAILABLE: "Tin này đã được mua hoặc được người bán thu hồi. Làm mới chợ để xem tin còn bán.",
    LISTING_NOT_FOUND: "Tin này không còn bán. Làm mới chợ để xem tin mới.",
    CANNOT_BUY_OWN: "Không thể mua tin bán của chính bạn.",
    SELF_PURCHASE: "Không thể mua tin bán của chính bạn.",
    OWN_LISTING: "Không thể mua tin bán của chính bạn.",
    NOT_SELLER: "Bạn chỉ có thể thu hồi tin bán do mình đăng.",
    NOT_OWNER: "Bạn chỉ có thể thu hồi tin bán do mình đăng.",
    COIN_LIMIT: "Ví người nhận đã đạt giới hạn XCoin. Giao dịch chưa thực hiện và nguyên liệu vẫn được giữ.",
    INVALID_EVENT: "Nhiệm vụ không còn hợp lệ. Cập nhật trang Sự kiện rồi thử lại.",
    LISTING_LIMIT: "Bạn đã có 20 tin đang bán. Thu hồi hoặc bán xong một tin trước khi đăng thêm.",
    UNSUPPORTED_RARITY: "Lò Mythic chỉ nhận đúng 5 vật phẩm Legendary.",
  };
  return messages[reason ?? ""] ?? "Giao dịch chưa được thực hiện. Làm mới dữ liệu và thử lại.";
}

export function countInventory(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
