import type { Metadata } from "next";
import { TradeUpGame } from "@/components/trade-up/TradeUpGame";
export const metadata: Metadata = { title: "Đổi đồ · 5 → 1" };
export default function TradeUpPage() { return <TradeUpGame/>; }
