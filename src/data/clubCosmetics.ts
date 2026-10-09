import { CLUBS } from "./clubs";
import { getMythicImage, MYTHIC_VARIANTS } from "./mythicCatalog";
import { getMythicHeritage } from "./mythicHeritage";
export { MYTHIC_VARIANTS } from "./mythicCatalog";
import type { CosmeticItem, Rarity } from "@/types/gamification";
// Preserve the original logo/avatar/title IDs for existing collections.
export const CLUB_REWARD_TIERS = [
  { suffix: "logo", rarity: "COMMON", label: "Logo" },
  { suffix: "badge", rarity: "UNCOMMON", label: "Huy hiệu" },
  { suffix: "avatar", rarity: "RARE", label: "Avatar" },
  { suffix: "title", rarity: "EPIC", label: "Danh hiệu" },
  { suffix: "frame", rarity: "LEGENDARY", label: "Khung hoàng kim" },
  { suffix: "mythic", rarity: "MYTHIC", label: "Dấu ấn vạn hoa" },
] as const satisfies readonly { suffix: string; rarity: Rarity; label: string }[];
export const CLUB_COSMETICS: readonly CosmeticItem[] = CLUBS.flatMap((club): CosmeticItem[] => [
  { id: "club-" + club.id + "-logo", name: "Logo " + club.shortName, type: "LOGO", rarity: "COMMON", clubId: club.id, image: club.image,
    description: "Biểu trưng concept dành cho " + club.name + " · " + club.campus + "." },
  { id: "club-" + club.id + "-badge", name: "Huy hiệu " + club.shortName, type: "BADGE", rarity: "UNCOMMON", clubId: club.id, image: club.image,
    description: "Huy hiệu nhận diện " + club.shortName + " trên nền khiên, với sắc màu riêng của cộng đồng." },
  { id: "club-" + club.id + "-avatar", name: "Avatar " + club.shortName, type: "AVATAR", rarity: "RARE", clubId: club.id, image: club.image,
    description: "Avatar " + club.shortName + " với viền nhận diện riêng, lấy cảm hứng từ nhóm " + club.group.toLocaleLowerCase("vi") + "." },
  { id: "club-" + club.id + "-title", name: club.title, type: "TITLE", rarity: "EPIC", clubId: club.id, image: club.image,
    description: "Danh hiệu cosmetic của " + club.name + ". Thiết kế cho game, không phải chứng nhận thành tích hay tư cách thành viên." },
  { id: "club-" + club.id + "-frame", name: "Hoàng Kim · " + club.shortName, type: "FRAME", rarity: "LEGENDARY", clubId: club.id, image: club.image,
    description: "Khung avatar hoàng kim với biểu trưng " + club.shortName + ", viền kép và điểm nhấn đá quý. Một dấu ấn Legendary của CLB." },
  ...MYTHIC_VARIANTS.map((variant): CosmeticItem => {
    const heritage = variant.variant === "LEGACY" ? getMythicHeritage(club) : null;
    return {
      id: "club-" + club.id + "-" + variant.suffix,
      name: heritage ? heritage.title : variant.label + " · " + club.shortName,
      type: variant.type, rarity: "MYTHIC", clubId: club.id, image: getMythicImage(club), mythicVariant: variant.variant,
      ...(heritage ? { heritage: heritage.mentor } : {}),
      description: variant.description + " Bộ Mythic của " + club.name + ". " +
        (heritage ? (heritage.isHistoricalPerson
          ? "Lấy cảm hứng mang tính biểu tượng từ " + heritage.mentor + "; không phải xác nhận được truyền dạy, liên kết hay bảo trợ. "
          : "Danh hiệu sáng tạo với hình tượng người thầy hư cấu: " + heritage.mentor + ". ") : "") +
        "Cosmetic concept trong game, không chứng nhận thành tích hoặc tư cách thành viên.",
    };
  }),
]);

const mythicsByClub = new Map<string, CosmeticItem[]>();
for (const item of CLUB_COSMETICS) {
  if (item.rarity !== "MYTHIC" || !item.clubId) continue;
  const pool = mythicsByClub.get(item.clubId) ?? [];
  pool.push(item);
  mythicsByClub.set(item.clubId, pool);
}
export const getClubMythics = (clubId: string): readonly CosmeticItem[] => mythicsByClub.get(clubId) ?? [];
