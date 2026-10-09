import type { Metadata } from "next";
import { LuckyOrbit } from "@/components/orbit/LuckyOrbit";
export const metadata: Metadata = { title: "Lucky Orbit" };
export default function OrbitPage() { return <LuckyOrbit/>; }
