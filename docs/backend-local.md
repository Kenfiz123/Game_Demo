# Backend local · FPTU Xperience

## Chạy

Node.js **22.13+**, khuyến nghị dùng bản đã kiểm tra **22.20.0**. `npm install`, `npm run dev`; API và giao diện dùng chung một server Next.js. Không cần Docker, tài khoản cloud hay database server riêng. SQLite tự tạo file khi API được gọi lần đầu.

```powershell
npm install
npm run dev
```

Mở `http://localhost:3000/chest`. Build production: `npm run build`, rồi `npm start`. Không build vào một thư mục `.next-*` trong lúc server đang dùng thư mục đó.

Nguồn kỹ thuật: [Node 22.20 – node:sqlite / DatabaseSync](https://nodejs.org/download/release/v22.20.0/docs/api/sqlite.html), [Node 22.13 bỏ yêu cầu bật flag SQLite](https://nodejs.org/en/blog/release/v22.13.0). Module SQLite đồng bộ của Node 22 đang trong quá trình phát triển và có cảnh báo experimental; đây là lựa chọn gọn cho demo local, không phải cam kết lưu lượng production.

## Dữ liệu và phiên

- Mỗi phiên ẩn danh có player UUID riêng. Cookie HttpOnly / SameSite=Strict / Path=/ giữ token ngẫu nhiên trong 30 ngày; dùng Secure khi truy cập HTTPS. DB chỉ giữ hash token, không giữ token thô. Không gửi token trong JSON, URL hoặc localStorage.
- Lưu state v2: EX, danh sách **từng bản sao** vật phẩm, lịch sử mở rương/vòng quay, lịch sử đổi đồ (kể cả thất bại), tỷ lệ và 5 ô trang bị. ID catalog / artwork không đổi.
- SQLite schema version 2 có players, sessions, operations, player_economies và market_listings. Tự migrate v1 và giữ nguyên state v2, bổ sung ví XCoin riêng. Revision tăng khi thực sự thay đổi dữ liệu; mua bán tăng revision cả người mua lẫn người bán.
- Server tạo kết quả, kiểm tra quyền sở hữu và trừ EX/đồ trong cùng transaction `BEGIN IMMEDIATE`. WAL / busy timeout hỗ trợ các kết nối local. Không giữ transaction trong suốt animation.
- Idempotency-Key theo player: cùng mã + cùng lệnh trả lại kết quả cũ với snapshot hiện tại; mã cũ + lệnh khác bị từ chối. Không được tự retry một lượt chơi mới bằng mã mới khi chưa biết lượt cũ đã lưu chưa.
- Frontend chỉ giữ snapshot tạm trong bộ nhớ. Các tab nhận thông báo cần tải lại; refresh khi tab hiện lại / có focus. Không có polling mỗi frame. Lỗi API khóa thao tác; nút Kết nối lại tải trạng thái mới nhất.
- Chưa có đăng nhập. Cùng trình duyệt/cookie đọc lại được sau refresh và restart server; xóa cookie, hết hạn, trình duyệt khác hoặc máy khác tạo player mới. Dữ liệu player cũ vẫn nằm trong DB nhưng chưa có luồng tự phục hồi.

## Cấu hình

Các giá trị mặc định trong `.env.example` đều tùy chọn. Có thể đặt ở `.env.local` hoặc biến môi trường PowerShell trước khi chạy; restart server sau khi đổi.

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `XPERIENCE_DB_PATH` | `data/xperience.sqlite` | File SQLite; đường dẫn tương đối tính từ workspace |
| `XPERIENCE_SESSION_COOKIE` | `xperience_session_v1` | Tên cookie riêng cho app/demo |
| `XPERIENCE_DEMO_TOOLS` | `true` | `false` tắt cộng EX, reset, nhập dữ liệu và chỉnh tỷ lệ |

Không dùng tiền tố `NEXT_PUBLIC_` cho cấu hình server. Không đặt database trong `public`. `data/`, SQLite/WAL/SHM và `.env.local` đã được Git bỏ qua.

Ví dụ chạy QA riêng, không tác động kho đang dùng:

```powershell
$env:XPERIENCE_BUILD_DIR = '.next-backend-qa'
$env:XPERIENCE_DB_PATH = 'data/backend-qa.sqlite'
$env:XPERIENCE_SESSION_COOKIE = 'xperience_backend_qa'
npm run dev -- -p 3003
```

Cookie **không phân biệt cổng**. Nếu chạy hai bản trên localhost, luôn đổi cả DB lẫn tên cookie khi muốn cách ly dữ liệu. Đừng xóa database để giải quyết lỗi kết nối.

## Nhập bản lưu cũ

Ứng dụng chỉ phát hiện dữ liệu ở khóa localStorage `fptu-xperience-demo-state`; **không tự upload, xóa hoặc ghi đè**. Với player mới chưa có mutation, thông báo cho phép **Nhập bản demo cũ → Xác nhận nhập**. Server kiểm tra bản JSON v1/v2, số dư, định dạng lịch sử/tỷ lệ và quyền trang bị rồi lưu atomic. Bản v2 giữ đồ trùng; ID đã nghỉ vẫn được lưu như bản archive. Bản v1 theo ngữ nghĩa collection cũ không tự tạo lại các đồ từng được hoàn EX.

Chỉ nhập một lần, trước mutation đầu tiên. Reset không mở lại quyền nhập. Bản lưu trình duyệt và backup v1 vẫn nguyên vẹn. Nếu JSON lỗi hoặc quá giới hạn request, server từ chối và giữ nguyên cả hai bên. Không nhập dữ liệu không tin cậy: đây là tiện ích chuyển demo, **không phải endpoint nạp kho production**.

## API

Tất cả response có `Cache-Control: private, no-store`. Mọi POST chỉ nhận JSON giới hạn 1 MiB và Origin khớp chính xác origin của URL request; cross-site bị từ chối. Không mở CORS. Lỗi chỉ trả code/message, không trả đường dẫn DB, SQL hay token.

| Route | Chức năng |
| --- | --- |
| `POST /api/session` body `{}` | Tạo/khôi phục phiên ẩn danh, trả snapshot; đặt cookie nếu mới |
| `GET /api/state` | Snapshot của cookie hợp lệ; thiếu/hết phiên trả 401 |
| `GET /api/market?cursor=<UUID>` | Tin đang bán phân trang 40 tin và tối đa 20 tin riêng; cần cookie, cursor tùy chọn |
| `POST /api/commands` | Lệnh đã xác thực phiên, có `Idempotency-Key` UUID và `X-Xperience-Player` UUID |
| `GET /api/health` | Kiểm tra storage, chỉ trả trạng thái và loại storage |

Các command: `play` (`game: chest|orbit`), `trade-up` (`itemIds`: đúng 5 ID), `equip` (`itemId`), `unequip` (`slot`), `settings` (`settings`), `grant-test-ex`, `reset-demo`, `import-legacy` (`raw`), `claim-event` (`eventId`), `forge-mythic` (`itemIds`, `coins`), `market-list` (`itemId`, `price`), `market-buy` / `market-cancel` (`listingId`). Không có API PUT state/số dư tùy ý. Các tool demo bị kiểm tra cả ở server, không chỉ ẩn nút UI. [Luật XCoin](event-economy.md).

Snapshot: player `{id, createdAt}`, state, economy (coinBalance, day, progress, claimedEventIds, forgeHistory), revision, `demoToolsEnabled`, `canImportLegacy`. Command trả `{snapshot,result}`. Cookie quyết định player; header public player UUID chỉ giúp phát hiện phiên bị thay đổi, không dùng để truy cập player khác.

Origin được đối chiếu với Host thực của request (hỗ trợ localhost / 127.0.0.1), không tin `X-Forwarded-Host` hoặc port forwarded. Bản này dành cho truy cập local trực tiếp; chưa cấu hình trusted reverse proxy / TLS termination. Nếu đưa qua proxy cần xác định rõ origin/protocol tin cậy trước khi triển khai.

## Sao lưu / phục hồi local

1. Dừng **mọi server** đang dùng cùng file DB (Ctrl+C) trước khi copy.
2. Copy cả thư mục `data` sang một thư mục backup riêng. Nếu còn file `-wal` / `-shm`, giữ chúng cùng file `.sqlite`; không copy chỉ file chính khi DB đang chạy.
3. Khởi động lại với đường dẫn DB cũ. Để phục hồi, dừng server, giữ một bản sao hiện tại rồi thay bằng bộ backup đã kiểm tra; không ghi đè DB đang mở.

Backup DB không thay thế cookie trình duyệt: token phiên không được xuất ra. Chưa có backup tự động hoặc công cụ khôi phục tài khoản. Dữ liệu demo và lịch sử/idempotency tăng dần, chưa có retention/archiving tự động.

## Phạm vi an toàn

Backend này dành cho local demo, chưa triển khai Internet. Mặc định công cụ test bật và phiên mới được 50.000 EX. Dù kết quả thường được tính ở server, người dùng demo vẫn có thể cộng EX/chỉnh tỷ lệ hoặc nhập bản save của họ. Chưa có tài khoản, phân quyền quản trị, xác minh hoạt động kiếm EX, quota/rate limit phân tán hoặc thu hồi phiên qua UI. Không mô tả bản này là chống gian lận/production-ready. Muốn public cần thiết kế những phần đó, HTTPS, backup/retention và ổ đĩa bền vững.

## Kiểm chứng · 10/10/2026

- **216/216 tests** đạt, gồm 19 kiểm thử store, 18 HTTP, 13 client, 3 UI backend và 163 hồi quy game/artwork/animation. `npm run lint`, `npm run typecheck`, production build đều đạt; có 4 API dynamic, 12 bước prerender hoàn tất.
- SQLite: hai tiến trình Node độc lập ghi cùng file, 21 lượt mở duy nhất không mất thưởng/trừ lặp; lỗi SQL cưỡng bức sau cập nhật rollback cả EX/kho/lịch sử/revision/key. Dữ liệu JSON hỏng không bị ghi đè bằng mặc định. Save lớn hơn giới hạn nhập và trang bị đã archive vẫn đọc/lưu an toàn.
- Trình duyệt QA riêng trên cổng 3003, DB và tên cookie riêng: mở 2 rương → 49.800 EX/2 món; cộng test ở tab khác → 59.800 EX/2 món. Offline chặn thao tác và hiện Kết nối lại; online khôi phục đúng số dư/kho, không giả vờ chưa tiêu EX nếu response không rõ.
- Dừng dev server rồi khởi động **production process mới** với cùng DB/cookie: reload vẫn 59.800 EX và đúng 2 món; mở tiếp thành công → 59.700 EX/3 món. Không dựa vào bộ nhớ provider để chứng minh lưu trữ.
- Browser mới khác: local save giả lập 12.345 EX, 5 Common + 2 Mythic chưa được upload trước xác nhận. Nhập rõ ràng rồi trang bị Aurora avatar, reload giữ 2/5 slot (avatar + danh hiệu). Đổi 5 Common ở preset test 100% ra một Uncommon ngẫu nhiên “Huy hiệu No Shy”; kho 7→3 bản, EX vẫn 12.345. Reload giữ lịch sử −5/+1 và localStorage gốc nguyên vẹn.
- 390 × 844 và 1366 × 768 không tràn ngang; nút mở nằm trên bottom nav trên mobile (bottom768px / nav779px). Không thêm RAF, canvas hoặc animation nền cho trạng thái kết nối. React/Next integration giữ snapshot nhẹ, xác thực từng API và không đưa token vào state client; animation mở rương không đổi.
- Console không có lỗi ngoài các lỗi mạng được cố ý tạo khi offline/stop server. Production có cảnh báo preload CSS của Next; Node có cảnh báo SQLite experimental. Chưa đo FPS/Lighthouse/heap và chưa kiểm thử hosting/reverse proxy.

Ảnh runtime (file QA bị Git bỏ qua): `output/playwright/backend-local/backend-mobile390.png`, `backend-desktop.png`, `backend-production-restart.png`, `import-equipped-reload.png`, `import-trade-result.png`, `import-trade-history-reload.png`. Dữ liệu QA ở `data/backend-qa-20261010.sqlite` tách biệt database mặc định `data/xperience.sqlite`.
