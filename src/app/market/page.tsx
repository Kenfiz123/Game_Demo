import type { Metadata } from "next";
import { PlayerMarket } from "@/components/economy/PlayerMarket";
export const metadata: Metadata = { title: "Chợ người chơi" };
export default function MarketPage() { return <PlayerMarket/>; }
