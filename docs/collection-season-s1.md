# Mùa sưu tầm S1

Trang `/seasons/s1` có 146 avatar: 73 CLB × hai bậc Huyền thoại và Thần thoại. Đây là bộ mùa riêng, mở bằng điểm nhiệm vụ S1. Người chơi chọn đúng CLB và bậc muốn nhận; bộ mùa không nằm trong pool rương, Orbit hay kết quả đổi đồ / Lò Thần Thoại.

## Nhiệm vụ và đổi avatar

| Nhiệm vụ trong ngày | Điểm S1 |
| --- | ---: |
| Ghé Xperience | 1 |
| Mở 3 rương | 2 |
| Mở 10 rương | 3 |
| Thực hiện một lượt đổi đồ, bất kể kết quả | 2 |

Mỗi nhiệm vụ nhận một lần mỗi ngày, tối đa 8 điểm. Ngày mới bắt đầu lúc 00:00 theo múi giờ Việt Nam. Điểm đã kiếm và các avatar đã đổi giữ nguyên khi sang ngày mới. S1 chưa cấu hình ngày kết thúc.

- **Huyền thoại · Hoàng Kim:** 4 điểm S1.
- **Thần thoại · Tinh Tú:** 12 điểm S1.

Mỗi avatar được đổi một lần trong mùa trên mỗi người chơi. Phần thưởng tạo bản sao thật, có serial và nguồn `SEASON`; cả hai bậc đều trang bị được ở ô AVATAR. Chuyển nhượng hoặc tiêu thụ bản sao không hoàn điểm và không mở lại lượt đổi. Công cụ reset demo vẫn xóa kho theo hành vi hiện có; tiến trình S1 không reset để tránh nhận lại điểm và phần thưởng.

Catalog có tìm kiếm không dấu, bộ lọc cơ sở / nhóm CLB và phân trang. Hộp xác nhận hiển thị giá, kiểm tra điểm và lượt đổi, hỗ trợ Escape và trả focus về nút mở. Trạng thái điểm và sở hữu được lấy từ snapshot server.

## Dữ liệu và giao dịch

`src/data/seasonCatalog.ts` định nghĩa avatar, nhiệm vụ và giá. `SeasonStore` lưu ledger riêng trong `player_seasons`. SQLite schema 5 mở rộng nguồn bản sao sang `SEASON`, giữ player state, serial, khóa bản sao, escrow, provenance và operation receipts khi nâng từ schema 4.

Hai command `claim-season-mission` và `redeem-season-avatar` dùng cùng giao dịch atomic và idempotency của backend. Server kiểm tra tiến độ thật, ngày nhiệm vụ, điểm và lượt đổi; client không được gửi giá hoặc phần thưởng. Lỗi mint bản sao sẽ rollback cả điểm và lượt đổi. Ledger kiểm tra quan hệ `earnedPoints - points = tổng giá các avatar đã đổi` và từ chối dữ liệu hỏng.

## Artwork

Mỗi avatar được tạo bằng một lượt **ImageGen tích hợp** riêng, có chủ thể theo CLB. Huyền thoại dùng huy chương vàng và men màu; Thần thoại dùng pha lê opal / sapphire với vòng quỹ đạo. Không dùng sheet cắt, recolor hoặc crest cũ làm avatar mùa.

- Brief và prompt chính xác: `design/season-s1-prompts.json`.
- PNG gốc: `design/source/seasons/s1/{legendary,mythic}/<club-id>.png`.
- WebP: `public/assets/seasons/s1/{legendary,mythic}/<club-id>.webp`.
- Xuất lại từ nguồn đã lưu: `npm run assets:season-s1`.

Lệnh xuất kiểm tra đủ 146 nguồn, ID / đường dẫn, alpha và pixel nguồn trùng. WebP có kích thước 512 × 512, khoảng đệm trong suốt 24px mỗi cạnh, giữ toàn bộ chủ thể bằng `fit: contain`, tối đa 140 KiB mỗi ảnh. Lệnh không gọi lại ImageGen. `--available` chỉ dành cho xem trước trong lúc tạo bộ nguồn.

## Kiểm chứng

`tests/season.test.ts` kiểm tra nhiệm vụ, ngày mới, idempotency, đổi cả hai bậc, quyền trang bị, persist, rollback, migration và chống dữ liệu giả. `tests/season-assets.test.ts` kiểm tra từng PNG / WebP, pixel không trùng, alpha, khoảng đệm và dung lượng. Kiểm tra trình duyệt bao gồm nhận điểm, xác nhận / hủy, đổi avatar, trang bị, tải lại, tìm kiếm không dấu và bố cục 1400 / 390 / 320px.

Kết quả ngày 13/10/2026: **425/425 test đạt**, ESLint, TypeScript và production build đạt. Trình duyệt đã tải thành công đủ **146 ảnh trên chín trang catalog**, không có lỗi JavaScript; bố cục 320 / 390 / 1400px không tràn ngang. Luồng nhiệm vụ → đổi avatar → trang bị → tải lại giữ đúng điểm, quyền sở hữu và nguồn `SEASON`. Báo cáo QA local nằm trong `output/playwright/season-report.json`.

Đã giữ đủ **146 PNG gốc** (362.408.066 bytes) và **146 WebP** (12.177.718 bytes, giảm 96,64%). Mỗi WebP 55.602–118.592 bytes, 512 × 512 có alpha; fingerprint pixel của cả 146 nguồn và 146 bản web đều riêng biệt. Đã xem trực tiếp bảy contact sheet chứa đủ 73 cặp avatar.
