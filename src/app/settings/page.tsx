import { OddsSettings } from "@/components/settings/OddsSettings";

export const metadata = { title: "Tỷ lệ & bảng test" };
export default function SettingsPage() {
  return <div className="content-page page-wrap odds-page"><div className="page-heading"><h1>Tỷ lệ & bảng test</h1><p>Điều chỉnh xác suất mở rương và đổi đồ, xem tỷ lệ thực tế trước khi lưu. EX và vật phẩm chỉ dùng trong prototype.</p></div><OddsSettings/></div>;
}
