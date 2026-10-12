import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { XperienceProvider } from "@/components/providers/XperienceProvider";
import "./globals.css";
import "./clubs.css";
import "./mythic.css";
import "./mythic-ceremony.css";
import "./inventory-upgrade.css";
import "./mythic-royal.css";
import "./trade-up.css";
import "./odds-settings.css";
import "./experience-premium.css";
import "./chest-premium.css";
import "./inventory-premium.css";
import "./backend-status.css";
import "./economy-shell.css";
import "@/components/inventory/itemProtection.css";
export const metadata: Metadata = {
  title: { default: "Reward Arcade · FPTU Xperience", template: "%s · FPTU Xperience" },
  description: "Khám phá 73 CLB, mở rương, nhận XCoin từ sự kiện, giao dịch với người chơi và luyện Mythic từ 5 Legendary.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><a className="skip-link" href="#main-content">Đến nội dung chính</a><XperienceProvider><AppShell>{children}</AppShell></XperienceProvider></body></html>;
}
