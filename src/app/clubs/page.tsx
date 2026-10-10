import type { Metadata } from "next";
import { ClubCollection } from "@/components/clubs/ClubCollection";
import { CLUBS, CLUB_GROUPS } from "@/data/clubs";
import { CLUB_COSMETICS } from "@/data/clubCosmetics";
import { MYTHIC_VARIANTS } from "@/data/mythicCatalog";
import "../clubs-royal.css";
import "./club-mythic-set.css";
export const metadata: Metadata = {title:"Bộ sưu tập CLB"};
export default function ClubsPage() {
  return <div className="page-wrap content-page clubs-page royal-clubs-page">
    <div className="page-heading royal-collection-heading"><h1>Bảo vật của từng CLB.</h1><p>{CLUBS.length} cộng đồng, {CLUB_GROUPS.length} nhóm hoạt động và {CLUB_COSMETICS.length} vật phẩm. Mỗi CLB có 5 bậc nhận diện từ Common đến Legendary, cùng {MYTHIC_VARIANTS.length} Mythic riêng biệt. Khám phá avatar Mythic với hai lựa chọn Cực Quang / Thiên Hà và thành tích Mythic dưới dạng danh hiệu Truyền Nhân, cùng biểu trưng, khung và hiệu ứng.</p><div className="royal-collection-signature"><span>13 dấu ấn cho mỗi cộng đồng</span><span>{CLUBS.length * MYTHIC_VARIANTS.length} bảo vật Mythic</span></div></div>
    <ClubCollection/>
  </div>;
}
