import type { Club } from "./clubs";
import type { EquipSlot, MythicVariant } from "@/types/gamification";

export const MYTHIC_VARIANTS = [
  { variant: "PRISM", suffix: "mythic", type: "EFFECT", label: "Vạn Hoa", description: "Lăng kính đa sắc xoay đối chiều, những tia sao phản chiếu qua huy hiệu vương giả." },
  { variant: "SOVEREIGN", suffix: "mythic-logo", type: "LOGO", label: "Quân Vương", description: "Vương miện ruby, nguyệt quế vàng chạm nổi và những tia sáng lướt trên bảo vật đăng quang. Huy hiệu CLB nằm giữa tâm ngọc, vững vàng như một ấn tín hoàng gia." },
  { variant: "AURORA", suffix: "mythic-avatar-aurora", type: "AVATAR", label: "Cực Quang", description: "Dải cực quang ngọc lục bảo ôm lấy avatar, giao thoa cùng opal và những đường vàng tinh xảo. Nếp sáng chuyển động chậm như lụa, giữ dấu ấn CLB rõ nét giữa quầng sáng." },
  { variant: "CELESTIAL", suffix: "mythic-avatar-celestial", type: "AVATAR", label: "Thiên Hà", description: "Avatar trong bảo khí thiên văn sapphire: quỹ đạo vàng, trăng lưỡi liềm và sao kim cương giữa chiều sâu tinh vân. Những chòm sao lấp lánh quanh huy hiệu riêng của CLB." },
  { variant: "LEGACY", suffix: "mythic-title", type: "TITLE", label: "Truyền Nhân", description: "Danh hiệu mang tinh thần kế thừa một hình tượng truyền cảm hứng trong lĩnh vực của CLB." },
  { variant: "PHOENIX", suffix: "mythic-phoenix", type: "EFFECT", label: "Hỏa Phượng", description: "Dấu ấn phượng hoàng tái sinh với cánh lửa, tàn sao và sắc vàng đỏ rực rỡ." },
  { variant: "COMET", suffix: "mythic-comet", type: "EFFECT", label: "Sao Băng", description: "Bạch kim và kim cương băng kết thành đuôi sao chéo trời, điểm sáng thiên thạch lướt qua lớp tinh thể xanh bạc. Một bảo vật có dáng chuyển động ngay cả khi đứng yên." },
  { variant: "REGALIA", suffix: "mythic-frame", type: "FRAME", label: "Vương Miện", description: "Vương miện vàng chạm nổi với ruby đỏ thẫm, ngọc trai và những tia kim cương lấp lánh. Ánh kim lướt trên đường chạm khắc; khung ôm quanh avatar mà không che dấu ấn của bạn." },
] as const satisfies readonly { variant: MythicVariant; suffix: string; type: EquipSlot; label: string; description: string }[];

const variantsById = new Map<MythicVariant, (typeof MYTHIC_VARIANTS)[number]>(MYTHIC_VARIANTS.map(variant => [variant.variant, variant]));
export const getMythicVariant = (variant?: MythicVariant) => variantsById.get(variant ?? "PRISM") ?? MYTHIC_VARIANTS[0];

export const MYTHIC_THEMES = ["football", "athletics", "martial", "music", "dance", "visual", "technology", "business", "language", "strategy", "community", "sovereign"] as const;
export type MythicTheme = (typeof MYTHIC_THEMES)[number];
const footballIds = new Set(["football-team-hn", "fptufc-hn", "ffc-hcm"]);
const musicIds = new Set(["melody-hn", "guitar-hn", "ftic-hn", "fti-hcm", "fsharp-hcm"]);
const danceIds = new Set(["hiphop-hn", "yosakoi-hn", "soleil-hn", "fstyle-hcm", "udc-hcm", "dfp-dn", "beatking-hcm"]);
export function getMythicTheme(club: Club): MythicTheme {
  if (footballIds.has(club.id)) return "football";
  if (club.group === "Thể thao & võ thuật") return /^(vovinam|fvc|taekwondo|nunchaku|muaythai)-/.test(club.id) ? "martial" : "athletics";
  if (musicIds.has(club.id)) return "music";
  if (danceIds.has(club.id)) return "dance";
  if (club.group === "Nghệ thuật, âm nhạc & biểu diễn" || club.group === "Truyền thông, thiết kế & sự kiện") return "visual";
  if (club.group === "Công nghệ & kỹ thuật") return "technology";
  if (club.group === "Kinh doanh, tài chính & nghề nghiệp") return "business";
  if (club.group === "Ngôn ngữ & văn hóa quốc tế") return "language";
  if (club.group === "Trò chơi & tư duy") return "strategy";
  if (club.group === "Cộng đồng, tình nguyện & sinh viên") return "community";
  return "sovereign";
}
/** A separately generated royal crest for each club, shared only by that club's eight variants. */
export const getMythicImage = (club: Club) => "/assets/mythic-clubs/" + club.id + ".webp";
