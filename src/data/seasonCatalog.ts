import { CLUBS } from "./clubs";
import type { CosmeticItem } from "@/types/gamification";
import type { SeasonMissionId, SeasonProgress } from "@/types/season";
import { economyDay } from "./eventEconomy";

export const SEASON_ID = "S1" as const;
export const SEASON_COSTS = { LEGENDARY: 4, MYTHIC: 12 } as const;
export const SEASON_MISSIONS = [
  { id: "visit", name: "Gặp nhau ở mùa đầu", description: "Ghé Xperience hôm nay.", metric: "visit", target: 1, points: 1, href: "/seasons/s1" },
  { id: "three-chests", name: "Ba dấu ấn mới", description: "Mở 3 rương trong ngày.", metric: "chests", target: 3, points: 2, href: "/chest" },
  { id: "ten-chests", name: "Hành trình khám phá", description: "Mở 10 rương trong ngày.", metric: "chests", target: 10, points: 3, href: "/chest" },
  { id: "trade", name: "Tiếp nối bộ sưu tập", description: "Thực hiện 1 lượt đổi đồ trong ngày, bất kể kết quả.", metric: "trades", target: 1, points: 2, href: "/trade-up" },
] as const satisfies readonly { id: SeasonMissionId; name: string; description: string; metric: "visit" | "chests" | "trades"; target: number; points: number; href: string }[];

export const SEASON_AVATARS: readonly CosmeticItem[] = CLUBS.flatMap(club => (["LEGENDARY", "MYTHIC"] as const).map(rarity => ({
  id: `season-s1-${club.id}-${rarity.toLowerCase()}-avatar`,
  name: `${rarity === "LEGENDARY" ? "Hoàng Kim" : "Tinh Tú"} S1 · ${club.shortName}`,
  description: `Avatar ${rarity === "LEGENDARY" ? "Huyền thoại hoàng kim" : "Thần thoại tinh thể"} mùa S1 của ${club.name}. Hoàn thành nhiệm vụ mùa và chọn CLB để mở khóa. Artwork concept trong game.`,
  rarity, type: "AVATAR", clubId: club.id, seasonId: SEASON_ID,
  image: `/assets/seasons/s1/${rarity.toLowerCase()}/${club.id}.webp`,
})));
const byId = new Map(SEASON_AVATARS.map(item => [item.id, item]));
export const getSeasonAvatar = (id: string) => byId.get(id);
export const emptySeason = (now = Date.now()): SeasonProgress => ({ seasonId: SEASON_ID, day: economyDay(now), points: 0, earnedPoints: 0, claimedMissionIds: [], redeemedItemIds: [] });
