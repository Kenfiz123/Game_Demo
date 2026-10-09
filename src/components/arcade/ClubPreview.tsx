import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CLUBS, getClubById } from "@/data/clubs";
const featured = ["fcode", "photography-hn", "fbc-hcm", "igo-hn", "melody-hn", "fvc-dn"].map(id => getClubById(id)!);
export function ClubPreview() {
  return <section className="club-preview"><div className="section-header"><div><h2>{CLUBS.length} CLB. Tìm dấu ấn của bạn.</h2><p>13 vật phẩm mỗi cộng đồng · 5 bậc nền tảng và 8 bảo vật Mythic vương giả.</p></div><Link href="/clubs">Xem tất cả <ArrowUpRight size={16}/></Link></div>
    <div className="club-preview-row">{featured.map(club => <Link href="/clubs" className="club-preview-item" key={club.id}><Image src={club.image} alt="" width={100} height={100} sizes="100px"/><span>{club.shortName}</span><small>{club.campus}</small></Link>)}</div>
    <p className="club-concept-note">Thiết kế concept cho game · Không phải logo chính thức của CLB.</p>
  </section>;
}
