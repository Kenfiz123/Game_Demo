import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { COSMETICS } from "@/data/cosmetics";
import { CosmeticCard } from "@/components/inventory/CosmeticCard";
import { ClubPreview } from "./ClubPreview";
const featured = ["club-fcode-logo", "club-photography-hn-badge", "club-melody-hn-avatar", "club-igo-hn-title", "club-fbc-hcm-frame", "club-fvc-dn-mythic"];
export function RewardCatalog() {
  return <><ClubPreview/><section className="reward-catalog"><div className="section-header"><div><div className="section-kicker">DÀNH CHO HỒ SƠ CỦA BẠN</div><h2>Những dấu ấn đáng sở hữu.</h2></div>
    <Link href="/inventory">Kho đồ của tôi <ArrowUpRight size={16}/></Link></div>
    <div className="catalog-grid">{featured.map((id) => <CosmeticCard key={id} item={COSMETICS.find((item) => item.id === id)!}/>)}</div>
    <p className="catalog-note">Vật phẩm trang trí trong bản demo. EX không thể mua, rút hoặc quy đổi thành tiền.</p>
  </section></>;
}
