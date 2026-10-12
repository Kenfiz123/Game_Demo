import type { Metadata } from "next";
import { SeasonCollection } from "@/components/seasons/SeasonCollection";
export const metadata: Metadata = { title: "Mùa sưu tầm S1" };
export default function SeasonOnePage() { return <SeasonCollection/>; }
