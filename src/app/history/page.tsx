import { OpeningHistory } from "@/components/history/OpeningHistory";
export const metadata = { title: "Lịch sử" };
export default function HistoryPage() {
  return <div className="content-page page-wrap"><div className="page-heading"><div className="section-kicker">YOUR REWARD JOURNEY</div><h1>Từng lần <span>thử vận may.</span></h1><p>Kết quả mở rương, vòng quay và đổi đồ; gồm cả bản sao được giữ lại và những lần đổi không thành công.</p></div><OpeningHistory/></div>;
}
