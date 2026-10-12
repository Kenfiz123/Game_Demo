import type { Metadata } from "next";
import { AccountPanel } from "@/components/account/AccountPanel";

export const metadata: Metadata = { title: "Tài khoản của bạn" };

export default function AccountPage() {
  return <AccountPanel />;
}
