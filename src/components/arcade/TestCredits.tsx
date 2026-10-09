"use client";
import { useEffect, useRef, useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { TEST_EX_GRANT, STARTING_EX_POINTS } from "@/data/chestConfig";
import { useXperience } from "@/hooks/useXperience";
export function TestCredits() {
  const { grantTestEx, hydrated, isPlaying } = useXperience();
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <section className="test-credits" aria-label="EX thử nghiệm">
    <div><FlaskConical size={17}/><span><strong>Chơi thử thoải mái</strong><small>Demo mới có {STARTING_EX_POINTS.toLocaleString("vi-VN")} EX. Cộng điểm không xóa vật phẩm.</small></span></div>
    <button className="secondary-button" disabled={!hydrated || isPlaying} onClick={async () => {
      const ok = await grantTestEx();
      if (!mounted.current) return;
      setMessage(ok ? "Đã cộng " + TEST_EX_GRANT.toLocaleString("vi-VN") + " EX test. Collection vẫn được giữ nguyên." : "Chưa thể cộng EX. Hãy hoàn tất lượt chơi và kiểm tra quyền lưu trữ trình duyệt.");
    }}><Plus size={15}/> {TEST_EX_GRANT.toLocaleString("vi-VN")} EX test</button>
    <p role="status">{message}</p>
  </section>;
}
