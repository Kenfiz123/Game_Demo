import { InventoryGrid } from "@/components/inventory/InventoryGrid";
export const metadata = { title: "Kho đồ" };
export default function InventoryPage() {
  return <div className="content-page page-wrap"><div className="page-heading"><div className="section-kicker">YOUR XPERIENCE IDENTITY</div><h1>Kho đồ <span>của bạn.</span></h1><p>Mỗi bản sao đều có giá trị. Giữ trong kho, chọn đủ 5 đồ cùng bậc và thử đổi lên bậc cao hơn.</p></div><InventoryGrid/></div>;
}
