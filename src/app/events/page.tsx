import type { Metadata } from "next";
import { EventHall } from "@/components/economy/EventHall";
export const metadata: Metadata = { title: "Sự kiện XCoin" };
export default function EventsPage() { return <EventHall/>; }
