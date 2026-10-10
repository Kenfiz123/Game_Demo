import { InventoryGrid } from "@/components/inventory/InventoryGrid";
export const metadata = { title: "Kho đồ" };
export default function InventoryPage() {
  return <div className="content-page page-wrap"><div className="page-heading"><div className="section-kicker">BỘ SƯU TẬP CÁ NHÂN</div><h1>Kho đồ <span>của bạn.</span></h1><p>Trang bị dấu ấn riêng. Giữ lại từng bản sao, hoặc chọn 5 món cùng bậc để thử đổi đồ.</p></div><InventoryGrid/></div>;
}
