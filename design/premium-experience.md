# Premium experience · 10/10/2026

Nâng cấp giao diện hiện có thành không gian trưng bày vật phẩm: midnight navy, champagne, serif tiếng Việt và các đường viền kim loại tiết chế. Tái sử dụng artwork ImageGen đã có; không tạo ảnh hoặc thay nhận diện CLB trong lần này.

## Trước / sau

| Trước | Sau |
| --- | --- |
| Heading và thông báo pha tiếng Anh, phân cấp tương đối phẳng | Tiêu đề serif, copy Việt, thông tin CLB / tổng vật phẩm lấy từ catalog |
| Rương nổi liên tục kể cả ngoài viewport | Một artwork nổi nhẹ, dùng observer chung, pause mặc định |
| Màn thưởng chưa tạo cảm giác trưng bày | Gallery corners, hierarchy vật phẩm / CLB / rarity, trạng thái lưu kho rõ |
| Kho chủ yếu lọc theo loại, độ hiếm và CLB | Tìm không dấu, sắp xếp rarity / tên / số lượng, lọc đang trang bị, thống kê bản sao dư |
| Gỡ món trong bộ lọc đang trang bị làm focus rơi xuống body | Focus về checkbox còn tồn tại, thông báo gỡ nằm ở live status bền vững |
| Rương chiếm nhiều chiều cao trên laptop / điện thoại | Bố cục compact theo breakpoint; giữ nút mở 49px và thanh điều hướng 7 mục |

Các skill redesign-existing-projects và emil-design-eng định hướng phân cấp, sự tiết chế và phản hồi thao tác; vercel-react-best-practices và optimize-web-animations định hướng memoized filtering, observer dùng chung, cleanup và kiểm chứng chuyển động. Không dùng một thư viện animation mới cho những hiệu ứng CSS đơn giản.

## Phạm vi triển khai

- `experience-premium.css`: shell, typography, sidebar, odds, button states và responsive.
- `chest-premium.css`: artwork float 6,4 giây; reveal thông thường 280ms; gallery layout. Hover / press ngắn, không đặt lớp particle hoặc animation nền toàn trang.
- `inventory-premium.css`: hồ sơ, collection controls, cards và loading skeleton tĩnh.
- Header: breadcrumb đúng trang, EX theo locale Việt, menu Escape đóng và trả focus; listener được cleanup.
- Kho: cache search text theo ID, AND các từ khóa đã chuẩn hóa, sort trên mảng mới; không sửa số lượng hoặc trang bị khi lọc. Phân trang vẫn 24 món.
- Focus recovery: Chromium phát blur lúc nút bị gỡ vẫn còn `isConnected=true`. Chỉ xóa intent khi focus thật sự đi sang phần tử khác hoặc pointer bấm ngoài card; listener passive capture có cleanup. Pending giữ nút focusable với `aria-disabled` / `aria-busy`, khóa `inFlight` chặn thao tác lặp. Không kéo focus khỏi control khác hoặc tab nền.
- Giới hạn quét class của Tailwind vào `src` bằng `source("../")`, theo [tài liệu Tailwind về base path](https://tailwindcss.com/docs/detecting-classes-in-source-files#setting-your-base-path). Khắc phục vòng recompile / chunk tải không trọn vẹn quan sát được trong phiên dev custom-build khi vùng quét còn bao gồm thư mục dự án. Sau thay đổi, log chỉ còn request / thay đổi mã chủ động.

## Bảo toàn cơ chế

Không đổi RNG, giá, thời lượng / tốc độ reel, odds mặc định, lưu trữ, IDs, số lượng bản sao, luật đổi đồ hoặc quyền sở hữu. Mythic giữ crest riêng từng CLB và lớp animation gắn với đúng món. Hiệu ứng hồ sơ vẫn opacity 1 trong normal flow, tách khỏi avatar; không tự trang bị avatar.

Ba bước rương chỉ phản ánh phase, không dùng phần trăm giả hoặc màu báo trước kết quả. Kiểm tra runtime lúc rolling: `reelDuration=4.48s`, `reveal=false`, `winnerMarkers=0`, bước “Khám phá” đang active. Khi xong mới đổi sang “Sở hữu” và hiển thị vật phẩm đã lưu.

## Kiểm chứng runtime

Browser ở origin test riêng `localhost:3002`, không thay kho / EX đã lưu ở 3000 hoặc 3001. Dùng UI preset để thử Mythic rồi trả tỷ lệ về 55 / 25 / 12 / 6 / 1,8 / 0,2. Có ba lượt mở test (300 EX), ba vật phẩm được giữ trong kho; không phải vật phẩm cấp vào phiên người dùng cũ.

| Đo CSS animation cùng viewport 1280 × 720 | Trước | Sau |
| --- | ---: | ---: |
| Animation đang chạy ngoài viewport khi ở cuối trang | 1 (chest-float) | 0 |
| Animation đang chạy ở cuối trang | 13 | 12 (Mythic nhìn thấy) |
| Animation rương khi về đầu trang | running | running |
| Canvas | 0 | 0 |

Đếm bằng computed style trên element và `::before` / `::after`, không phải FPS benchmark. Ảnh / DOM sau cùng ở đầu trang có 526 DOM nodes, 1 animation chạy và 0 animation ngoài màn hình; baseline trước thay đổi 508 nodes. Không suy diễn DOM nhỏ/lớn thành cải thiện tốc độ.

Kiểm tra giao diện / tương tác:

- Desktop 1280 × 720: nút mở nhìn thấy trong khung ban đầu, odds bên phải.
- Mobile 390 × 844: nút mở có top ≈713 / bottom ≈762; thanh điều hướng bắt đầu y=779. 320 × 780 cuộn để tới nút, không tràn ngang.
- Rương / kho: tại 390px, document scrollWidth=375; tại 320px, scrollWidth=305 (phần còn lại là scrollbar), đều không vượt viewport.
- Menu mở → Escape: `aria-expanded=false`, focus trả đúng “Mở điều hướng”.
- Tìm `hoa phuong guitar` khớp “Hỏa Phượng · Guitar”; tìm chuỗi không khớp hiện empty state; đổi sort và reset hoạt động.
- Isolated Edge: sở hữu / trang bị “Sao Băng · AI Club” → chỉ đang trang bị → Enter gỡ: card biến mất, focus về checkbox, status “Đã gỡ trang bị. Vật phẩm vẫn ở trong kho.” còn tồn tại; 1 bản / 1 mẫu sở hữu không đổi.
- Isolated Edge reduced-motion: `matchMedia` true, chest `animationName=none`, `transform=none`.
- Hồ sơ Hỏa Phượng: effect opacity=1, position=relative; motion-active=true khi toàn artwork nhìn thấy, không giả lập thành avatar.

163/163 tests, standard ESLint, TypeScript và diff-check đạt. Production build `.next-review` exit 0, 12/12 trang static; chest First Load JS 134 kB, inventory 130 kB, shared 103 kB. Build không đổi tsconfig. Đã dừng server dev trước build và chạy bản production tại origin test 3002.

Smoke-test production trong tab mới: rương và kho hydrate bình thường, console không warn/error. Lặp lại luồng gỡ Hỏa Phượng bằng Enter khi lọc đang trang bị: focus về INPUT checkbox, filtered cards=0, status gỡ vẫn có; tổng kho vẫn 3 bản / 3 mẫu và 49.700 EX. Để lại tab rương làm bản xem thử, đóng tab kiểm tra cũ và reset viewport override.

Không tuyên bố FPS, heap, Lighthouse hoặc độ bền phiên dài từ các kiểm tra này. Đã bắt và xử lý lỗi dev watcher / stale chunk trong quá trình thay đổi; không coi lỗi transient đó là bằng chứng build production thất bại.

## Ảnh thật

- `premium-experience-desktop.png`: rương mới.
- `premium-experience-mobile390.png`, `premium-experience-mobile320.png`: bố cục nhỏ.
- `premium-experience-mythic.png`: nhận Mythic.
- `premium-experience-profile.png`: hiệu ứng trưng bày trên hồ sơ.
- `premium-experience-inventory390.png`: kho mobile.
- `premium-experience-in-progress.png` là snapshot giữa lúc thay markup/CSS, **không dùng làm ảnh before**.

Các ảnh chụp từ ứng dụng thật; không phải mockup hoặc một animation render giả.
