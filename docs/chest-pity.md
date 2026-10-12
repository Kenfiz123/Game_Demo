# Pity rương 200

## Luật

`state.chestPity` đếm các lượt rương liên tiếp chưa có Mythic, từ 0 đến 199. Sau 199 lượt không ra Mythic, lượt hợp lệ kế tiếp bảo đảm một Mythic ngẫu nhiên trong toàn bộ pool Mythic. Mythic tự nhiên hoặc từ bảo hiểm đều reset ngay về 0. Tỷ lệ cơ bản không tăng dần; bảo hiểm thắng cả cấu hình Mythic 0%.

Chỉ tính rương. Orbit, trade-up, forge, nhận sự kiện, trang bị và mua bán không thay đổi pity. Không đủ EX hoặc lệnh bị từ chối không tăng bộ đếm. Retry cùng Idempotency-Key không tính thêm lượt. Reset demo bắt đầu lại từ 0.

## Lưu trữ và giao diện

- Counter cập nhật trong cùng transaction SQLite với trừ EX, cấp bản sao, lịch sử và receipt idempotency. Lỗi ghi rollback toàn bộ.
- Bộ đếm theo player: đăng ký giữ nguyên, đăng nhập tải của tài khoản đó, đăng xuất tạo khách mới. Không lưu bộ đếm ở localStorage.
- Không đổi schema SQLite 3 hoặc version state 2. Save thiếu field được suy ra từ lịch sử mới nhất đến Mythic rương gần nhất, bỏ qua Orbit; record đời cũ không có game được coi là rương. Lịch sử cũ quá 199 chặn ở 199 để bảo hiểm lượt tiếp theo. Đọc không sửa SQL/revision; mutation tiếp theo lưu counter.
- Field có mặt nhưng sai kiểu/phạm vi bị server từ chối; không xóa kho để khắc phục. Adapter trình duyệt đời cũ vẫn đọc forgiving, nhưng import chủ động được kiểm tra nghiêm ngặt.
- Thanh pity chụp giá trị trước khi gửi request và giữ qua network pending, charging, rolling, settling. Chỉ sau reveal mới hiển thị counter backend mới, tránh lộ Mythic qua reset sớm. Giá trị giữ tạm gắn playerId; trước hydration không hiển thị bảo hiểm chưa xác nhận.
- Thanh progress native có nhãn và trạng thái live, không thêm timer, RAF hoặc animation vòng lặp. Bảng tỷ lệ và trang Tỷ lệ ghi rõ đây là tỷ lệ cơ bản trước pity.

## Kiểm chứng · 12/10/2026

- **371/371 tests**, ESLint, TypeScript và production build đều đạt. Bao gồm 200 lượt liên tiếp thực sự ở engine và SQLite với Mythic cơ bản 0%; lượt 200 Mythic, lượt 201 bắt đầu từ 1.
- Test reload ở 199, retry trước/sau bảo hiểm, hai kết nối SQLite cùng counter, rollback cấp đồ/reset/receipt, dữ liệu cũ đọc không ghi và lưu qua đăng ký/đăng nhập.
- Browser QA production riêng cổng 3003, `data/pity-qa-20261012.sqlite`, cookie `xperience_pity_qa`: seed demo 198, Common→199, Mythic bảo hiểm→0; preset Mythic tự nhiên ở42→0. Giữ phản hồi API 1,3 giây; MutationObserver xác nhận không đổi số sớm ở pending/animation, kể cả Mở tiếp từ màn kết quả cũ.
- Dừng và chạy process production mới cùng DB/cookie, reload giữ pity0, EX49.800, hai bản sao và lịch sử Mythic/Common. Viewport320/390px không tràn ngang; thanh pity không có animation đang chạy. Console không lỗi; còn cảnh báo preload CSS của Next và SQLite experimental của Node.
- Backup DB thật trước nâng cấp: `data/backups/pre-pity-20261012.sqlite`. Fingerprint cả11bảng trước/sau khởi động bản mới giống nhau. QA không sử dụng database hoặc cookie người dùng.

Ảnh QA bị Git bỏ qua: `output/playwright/pity/desktop-198.png`, `mythic-result-reset.png`, `mobile390.png`. Đây là kiểm tra chức năng/layout, không phải benchmark FPS/Lighthouse/heap.
