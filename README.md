# FPTU Xperience · Reward Arcade

Prototype Next.js / React với rương, vòng quay, đổi đồ, luyện Mythic, sự kiện XCoin, chợ người chơi và tài khoản nhà sưu tầm local. Giao diện midnight titanium / champagne gold, artwork gốc được tạo bằng ImageGen.

## Chạy dự án

Yêu cầu **Node.js 22.13+** (đã kiểm tra trên 22.20). Backend API chạy cùng Next.js, SQLite tự tạo ở `data/xperience.sqlite`; không cần cài database riêng. `node:sqlite` trên Node 22 còn có cảnh báo experimental. Giữ nguyên thư mục `data` khi cập nhật code.

```powershell
npm install
npm run dev
```

Mở `http://localhost:3000`. Trang đầu chuyển đến `/chest`.

### Sự kiện XCoin và chợ người chơi

`/events`: tối đa 160 XCoin/ngày từ điểm danh, mở rương và đổi đồ. `/market`: đăng bán, mua hoặc thu hồi từng bản sao bằng XCoin. `/forge`: 5 Legendary → 1 Mythic ngẫu nhiên, bắt buộc dùng 10–250 XCoin, tỷ lệ 1–25% (mỗi 10 coin = 1 điểm %). Cả đồ và coin đều mất nếu luyện thất bại. Rương có âm thanh ngắn và phát toàn bộ `The_Rare_Unlock.mp3` khi hiện Mythic: lặp tới khi người chơi thao tác tiếp, có nút bật/tắt và âm lượng. XCoin không có giá trị tiền thật. [Luật và cách thử hai người chơi](docs/event-economy.md).

### Nhà sưu tầm · hồ sơ, dấu ấn và sổ CLB

`/profile`: chọn tối đa ba Mythic đang sở hữu, một sân khấu chuyển động chính và hồ sơ chia sẻ opt-in tại `/profile/<username>`. `/inventory`: mỗi bản sao có serial riêng, xem nguồn nhận và lịch sử chuyển chủ; mua bán giữ nguyên serial. `/collection`: sổ 73 CLB, tiến độ mẫu từng khám phá giữ lại sau bán/đổi đồ, 12 CLB/trang và dấu mốc **Bộ hoàn chỉnh** không tăng tỷ lệ hay cấp coin. Không công khai EX/XCoin, serial hoặc lịch sử giao dịch. [Hướng dẫn đầy đủ](docs/collector-account.md).

### Backend local · phiên khách và tài khoản

EX, toàn bộ bản sao vật phẩm, 5 ô trang bị, lịch sử rương/vòng quay/đổi đồ, tỷ lệ và dấu ấn được lưu trên server. Cookie HttpOnly giữ phiên trên trình duyệt (30 ngày). `/account` hỗ trợ tên đăng nhập ASCII 3–24 ký tự + mật khẩu 12–128 ký tự: **đăng ký giữ nguyên kho/EX/XCoin hiện tại**, đăng nhập tài khoản có sẵn **không gộp kho khách**, đăng xuất tạo khách mới, đổi mật khẩu thu hồi các phiên khác. Tài khoản cho phép quay lại từ trình duyệt khác kết nối **cùng máy chủ local/DB**, không phải đồng bộ cloud. Không có khôi phục mật khẩu qua email.

SQLite tự migrate bổ sung lên schema 3, không xóa kho cũ. Bản cũ được gắn serial nhưng không bịa ngày nhận/người nhận đầu tiên. Xóa cookie / hết hạn sẽ tạo phiên khách mới, **không xóa dữ liệu cũ trong database**; tài khoản đã đăng ký có thể đăng nhập lại, khách chưa đăng ký chưa có cách tự phục hồi nếu mất cookie.

Dữ liệu localStorage đời trước **không bị xóa hoặc tự gửi lên server**. Với phiên mới chưa thao tác, chọn **Nhập bản demo cũ → Xác nhận nhập** nếu thấy thông báo. Bản gốc vẫn nằm trong trình duyệt. Sau thao tác đầu tiên, nhập bị khóa để tránh ghi đè kho mới.

`.env.example` chứa cấu hình tùy chọn. Mặc định không cần tạo `.env.local`. Chi tiết API, dữ liệu, sao lưu và giới hạn: [backend-local.md](docs/backend-local.md).

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

Để kiểm tra bản production song song với dev mà không dùng chung thư mục build:

```powershell
$env:XPERIENCE_BUILD_DIR = '.next-review'
npm run build
npm run start -- -p 3100
```

## Rương và vòng quay

| | Mystery Chest | Lucky Orbit |
| --- | --- | --- |
| Đường dẫn | /chest | /orbit |
| Chi phí | 100 EX | 150 EX |
| Cơ chế | Reel ngang, giảm tốc rồi reveal | 8 ô bằng nhau, vòng quay giảm tốc rồi reveal |
| Common | 55% | 37.5% (3 ô) |
| Uncommon | 25% | 25% (2 ô) |
| Rare | 12% | 12.5% (1 ô) |
| Epic | 6% | 12.5% (1 ô) |
| Legendary | 1.8% | 12.5% (1 ô) |
| Mythic | 0.2% | Không có |

Tỷ lệ trong bảng là tỷ lệ cơ bản, trước bảo hiểm pity. RNG dùng `crypto.getRandomValues`. Trong mỗi rarity, các cosmetic có xác suất bằng nhau. Orbit không có lợi thế từ timing / tốc độ click. EX chỉ là điểm demo, không mua bán, nạp hoặc rút tiền.

- **Pity rương 200:** sau 199 rương liên tiếp không ra Mythic, rương thứ 200 chắc chắn ra một Mythic ngẫu nhiên, kể cả khi tỷ lệ Mythic tùy chỉnh bằng 0%. Ra Mythic từ rương ở bất kỳ lượt nào đều reset pity ngay về 0. Không có soft pity tăng tỷ lệ dần.
- Bộ đếm lưu theo player trên backend, giữ khi tải lại/đăng nhập; Orbit, đổi đồ, luyện Mythic và mua bán không tăng hoặc reset pity rương. Thiếu EX, lượt bị từ chối và retry cùng mã không tăng thêm. Reset demo xóa cả pity.
- Save cũ thiếu bộ đếm được khôi phục từ lịch sử mở rương hiện có kể từ Mythic gần nhất, bỏ qua Orbit, tối đa 199 để bảo đảm lượt tiếp theo. UI chỉ đổi bộ đếm sau reveal, không tiết lộ kết quả khi reel còn chạy.

[Chi tiết pity, tương thích dữ liệu và kiểm chứng](docs/chest-pity.md).

- Demo mới khởi đầu với **50.000 EX** và collection trống. Số dư đã lưu được giữ nguyên.
- Nút **+10.000 EX test** ở trang game và `/clubs` cho phép thử nhiều lượt mà không xóa collection / activity; vô hiệu hóa trong lúc chơi.
- Vật phẩm trùng **thêm một bản sao vào kho**, không hoàn EX. Kho hiển thị số lượng ×N, tổng bản sao và số mẫu khác nhau riêng biệt.
- Mọi Mythic trên reel đều hiện cùng **Mythic Vault** ẩn danh. Artwork, tên và loại cosmetic Mythic chỉ xuất hiện ở màn reveal.
- Thẻ trang trí có thể xuất hiện Vault ngay cả khi kết quả không phải Mythic.
- Không có class / highlight dành riêng cho thẻ thắng trong lúc đang kéo.
- Reel chạy 4.48 giây; Orbit chạy 5.2 giây, cộng bước chuẩn bị và reveal. Màn kết quả được kích hoạt từ `animationend`, không từ một bộ đếm riêng dễ lệch với CSS.
- `prefers-reduced-motion` rút gọn chuyển động nhưng vẫn giữ sự kiện hoàn tất.
- Kho và lịch sử dùng chung cho cả ba game. Lịch sử giữ cả hợp đồng đổi thành công/thất bại, tối đa 30 bản ghi / trang.
- Reset demo có bước xác nhận, vô hiệu hóa trong lúc chơi. Trên điện thoại, reset nằm cuối trang.

## Đổi đồ và chỉnh tỷ lệ

`/trade-up`: chọn đúng **5 bản sao cùng bậc**, có thể cùng vật phẩm hoặc khác CLB. Xác nhận trước khi tiêu thụ. Không tốn EX. Tỷ lệ mặc định do người dùng chọn:

| Hợp đồng | Thành công |
| --- | --- |
| 5 Common → 1 Uncommon | 80% |
| 5 Uncommon → 1 Rare | 60% |
| 5 Rare → 1 Epic | 30% |
| 5 Epic → 1 Legendary | 5% |

Thành công nhận ngẫu nhiên đều một trong 73 món ở bậc đích, không giới hạn theo CLB đầu vào; đồ trùng tiếp tục thêm bản sao. Thất bại mất cả 5 món, không nhận thưởng hoặc hoàn EX. Bàn đổi thường nhận Common–Epic; Legendary dùng ở Lò Thần Thoại riêng, Mythic không làm nguyên liệu. Lượt đổi được lưu cùng kho trước hoạt ảnh hợp nhất 1,4 giây. Keyboard và reduced motion hiển thị kết quả ngay.

`/settings`: chỉnh riêng sáu tỷ lệ rương và bốn tỷ lệ đổi đồ. Mỗi ô 0–100%; tổng rương phải 100%. Nhập liệu và preset chỉ tạo bản nháp; chỉ áp dụng sau nút **Lưu tỷ lệ**. Có preset 100% Common/Mythic và đổi đồ 0%/100% để test. Tỷ lệ đã lưu xuất hiện ở rương, bảng đổi đồ và preview CLB; không thay đổi kết quả của lượt đã bắt đầu. Orbit luôn giữ 8 ô bằng nhau.

Tham khảo có chọn lọc cơ chế công khai của CS: [tỷ lệ riêng theo độ hiếm và cơ hội đều trong cùng bậc](https://www.csgo.com.cn/news/gamebroad/20170911/206155.shtml), cùng khái niệm [tiêu thụ đầu vào để nhận bậc cao hơn](https://help.steampowered.com/en/faqs/view/0151-608B-BCAA-D7D5). Luật 5 món có thể mất trắng và XCoin luyện Mythic là **luật riêng FPT**, không mô phỏng nguyên xi CS2. Không dùng asset Valve hoặc giao dịch tiền thật. Nghiên cứu ban đầu ở `design/trade-up-design.md`; luật XCoin hiện tại ở `docs/event-economy.md`.

## Hiệu năng & trải nghiệm

- Artwork PNG được lưu tại `design/source`; WebP phục vụ web tại `public/assets`.
- Rương: 2,340,327 → 141,558 bytes (**94.0% nhỏ hơn**).
- Observatory: 2,171,932 → 96,364 bytes (**95.6% nhỏ hơn**).
- `next/image` phục vụ kích thước responsive; rương chính được ưu tiên, artwork phụ tải lazy.
- Wheel là SVG; toàn bộ vật phẩm đang hoạt động dùng nhận diện CLB bằng ảnh ImageGen tối ưu WebP và chữ thật, không dùng mẫu reward Lucide chung; không thêm thư viện animation nặng.
- Animation chủ yếu dùng transform / opacity, một track cho toàn bộ reel; không animate blur / box-shadow hoặc tạo nhiều particle DOM.
- Provider đặt ở root, giữ state nhất quán khi chuyển trang. EX, collection và activity được ghi cùng một lần trước animation, tránh mất thưởng khi tải lại trang.
- Đặt khóa ngay trước bước async để chặn click liên tiếp; server xử lý đọc → RNG → trừ EX/đồ → lưu trong một transaction SQLite. Idempotency-Key ngăn một yêu cầu gửi lại tiêu đồ hai lần. Số dư và quyền sở hữu được kiểm tra trên dữ liệu mới nhất của server, không lấy từ trình duyệt.
- Đồng bộ các tab bằng thông báo vô hiệu hóa cache và đọc lại API khi quay về tab. Mất kết nối thì khóa thao tác thay đổi kho, không tự chuyển sang localStorage. Dữ liệu localStorage cũ chỉ dùng cho nhập demo có xác nhận.
- Focus vào tên thưởng khi reveal, live status, skip link, focus ring, mobile navigation.
- Nút chơi đưa vùng animation vào tầm nhìn nếu cần; layout gọn hơn trên laptop có chiều cao thấp.
- Không tuyên bố FPS / Lighthouse: chưa chạy đo benchmark trên thiết bị thật.

### Bản nâng cấp hình ảnh và trải nghiệm · 10/10/2026

- Giao diện phòng trưng bày midnight / champagne: typography serif có dấu Việt, phân cấp rõ, điều hướng theo trang và favicon riêng. Giữ nguyên artwork CLB / Mythic đã có.
- Rương có ba bước **Niêm phong → Khám phá → Sở hữu**, màn nhận thưởng mới và trạng thái lưu kho rõ. Giữ nguyên reel **4,48 giây**, không báo trước thẻ thắng.
- Rương nổi nhẹ chỉ khi hiện gần trọn vẹn; dùng chung observer với Mythic, dừng ngoài viewport / tab ẩn / giảm chuyển động. Hover chỉ áp dụng cho chuột; không thêm thư viện, canvas hoặc vòng cập nhật mỗi frame.
- Kho thêm tìm kiếm không dấu theo vật phẩm / CLB / di sản, ba cách sắp xếp, lọc đang trang bị và số bản sao dư. Loading tĩnh, empty state có hành động; gỡ đồ khi đang lọc không làm mất focus bàn phím.
- Thu gọn rương trên laptop và mobile; nút mở 49px, bộ lọc và menu có focus ring. Tại 390 × 844, nút mở nằm trọn trên thanh điều hướng; 320px cuộn bình thường, không tràn ngang.
- Giới hạn Tailwind quét trong `src`, tránh theo dõi build / ảnh QA; ESLint và Git bỏ qua các thư mục build `.next-*`.
- **163/163 tests**, lint, TypeScript và production build (12/12 trang) đạt. Hướng thiết kế, kiểm tra runtime và ảnh thật: [premium-experience.md](design/premium-experience.md).

## Bộ sưu tập CLB

- 73 CLB trong 10 nhóm, lấy từ tài liệu Word người dùng cung cấp; tên, campus và liên kết nguồn lưu ở `src/data/clubs.json`.
- Mỗi CLB đủ **6 bậc, 13 vật phẩm**: logo **Common**, huy hiệu **Uncommon**, avatar **Rare**, danh hiệu **Epic**, khung **Legendary** và **8 Mythic độc lập**. Tổng **949 vật phẩm** gồm 365 món bậc thấp và 584 Mythic. Đã bỏ 19 mẫu campus dùng biểu tượng chung khỏi catalog/rương/kho/lịch sử hiển thị; dữ liệu cũ vẫn được giữ trong bản lưu và backup, không xóa EX hoặc vật phẩm CLB đã sở hữu.
- Tỷ lệ Mythic mặc định **0,2%**, chọn đều trong **584 Mythic**, nên một món cụ thể khoảng **0,000342%/rương**. Có thể thay đổi trong trang Tỷ lệ. Lucky Orbit và đổi đồ thường không cấp Mythic; Lò Thần Thoại và chợ là hai cách nhận thêm.
- Nhận diện bậc thấp giữ một artwork ImageGen gốc cho mỗi CLB; avatar dùng khung tròn. Bộ Mythic mới có **73 crest độc quyền, một thiết kế riêng cho từng CLB**, khác cả artwork bậc thấp lẫn crest của CLB khác về chủ thể và hình dáng; không chỉ đổi màu hoặc tên trên cùng huy hiệu. Cả 8 món Mythic trong một CLB dùng crest riêng đó với 8 kiểu hoàn thiện / chuyển động tương ứng. Tên CLB và danh hiệu là chữ thật để giữ đúng dấu tiếng Việt.
- `/clubs`: tìm kiếm không dấu / không gạch nối, lọc nhóm và campus, xem 5 món bậc thấp cùng 8 lựa chọn Mythic của mỗi CLB và xác suất mở từ rương. Có bản xem trước Mythic cùng nút tạm dừng, không cấp thưởng hoặc đổi RNG. Phân trang 12 CLB để tránh tải toàn bộ ảnh cùng lúc.
- Mỗi Mythic có ID, loại trang bị và lớp hiệu ứng riêng. Trong reel, tất cả vẫn là một Vault niêm phong ẩn danh, không có artwork, tên CLB, loại vật phẩm hoặc ánh sáng báo trước thẻ thắng. Khi dừng mới hiện lễ mở **“Di sản đã thức tỉnh”** với đúng vật phẩm đã lưu vào kho.
- Animation chỉ chạy khi artwork hiện gần trọn vẹn, dừng khi ngoài màn hình, tab ẩn hoặc bật giảm chuyển động. Một IntersectionObserver và một cặp listener dùng chung, giải phóng khi không còn artwork. Không thêm thư viện, canvas, vòng RAF hoặc timer.
- Collection có bộ lọc logo, avatar và từng CLB; phân trang 24 vật phẩm.
- Đây là nhận diện concept trong game, không phải logo chính thức hay chứng nhận tư cách thành viên. Unicamp và Color Team dùng biểu trưng trung tính vì nguồn không mô tả hoạt động rõ.

### Mythic và trang bị lâu dài

| Biến thể | Loại | Dấu ấn |
| --- | --- | --- |
| PRISM · Vạn Hoa | EFFECT | Lăng kính xoay đối chiều và mảnh pha lê, giữ ID cũ `-mythic` |
| SOVEREIGN · Quân Vương | LOGO | Vương miện ruby, nguyệt quế vàng chạm nổi, ánh kim mask theo alpha |
| AURORA · Cực Quang | AVATAR | Dải ngọc lục bảo / opal nổi khối, lụa sáng chuyển động chậm |
| CELESTIAL · Thiên Hà | AVATAR | Bảo khí thiên văn sapphire, trăng và chòm sao trên quỹ đạo vàng |
| LEGACY · Truyền Nhân | TITLE | Bảng danh hiệu chạm khắc, ánh kim quét nhẹ; chữ thật đứng yên |
| PHOENIX · Hỏa Phượng | EFFECT | Áo choàng phượng hoàng ruby / vàng từ artwork riêng và tàn sao |
| COMET · Sao Băng | EFFECT | Đuôi sao bạch kim / kim cương băng, vệt sao chéo lệch nhịp |
| REGALIA · Vương Miện | FRAME | Khung vát chạm khắc, mặt bảo thạch lấp lánh |

Hiệu ứng v3 giữ nguyên 73 crest riêng và 584 ID Mythic. Bốn lớp trang sức được tạo bằng ImageGen tích hợp, ghép quanh crest ổn định; ánh kim được mask theo alpha của đúng ảnh responsive đã tải, không tải thêm ảnh riêng cho lớp mask. Mỗi CLB giữ đủ hai avatar Mythic và một danh hiệu Truyền Nhân; `/clubs` có lối xem nhanh Avatar / Thành tích, không tự cấp đồ hoặc chứng nhận thành tích ngoài đời. Nguồn artwork và QA v3: `design/mythic-finishes-v3.md`; lịch sử v2: `design/mythic-effects-v2.md`.

Bản chuyển động **v4** làm sống động cả bốn kiểu: Quân Vương có kim cương chạy quanh và sóng đăng quang; Cực Quang có hai dải lụa sáng uốn trôi; Thiên Hà có hai mặt phẳng quỹ đạo quay; Sao Băng có các đợt lao chéo lệch nhịp và vệt sáng mở rộng. Khung trang sức đung đưa độc lập, crest CLB và chữ vẫn đứng yên. Chuyển động theo cùng vật phẩm ở preview / reveal / hồ sơ trang bị, kể cả bản nhỏ. Bản đầy đủ có 11–12 motion owner và bản nhỏ có 8, giữ giới hạn chung 16 / 8; sóng đăng quang pseudo-element chỉ có ở bản đầy đủ. Dừng cả pseudo-element khi Pause, ngoài màn hình, tab ẩn hoặc giảm chuyển động. Không thêm thư viện, canvas, vòng RAF hoặc timer. QA và ảnh giao diện thật: `design/mythic-motion-v4.md`.

Danh hiệu và tiêu đề Royal dùng chung font Cambria / Times New Roman / Noto Serif thay cho Georgia thiếu ký tự tiếng Việt trên Windows. Đã sửa lỗi hở chữ trong “Truyền Nhân”, giữ nguyên tên và dữ liệu vật phẩm. Kiểm tra giao diện 320/390px, 139/139 tests, lint, TypeScript và build đạt; nguyên nhân và ảnh kiểm chứng: `design/mythic-title-font-fix.md`.

Kho có **5 ô trang bị: LOGO, AVATAR, TITLE, FRAME, EFFECT**, mỗi ô một vật phẩm. Chỉ Mythic đang sở hữu mới trang bị được; thao tác không tiêu thụ bản sao và không tốn EX. Hai avatar hoặc ba hiệu ứng là các món riêng biệt, chọn món nào thì lưu đúng ID đó. Hồ sơ và header dùng đúng trang bị đã lưu sau chuyển trang / tải lại; hiệu ứng đi cùng vật phẩm khi trang bị, không chỉ lóe lên lúc mở rương.

Đã sửa hình Mythic bị mờ trong hồ sơ: bỏ hai lớp opacity chồng nhau (`.46 × .32`), chuyển món Hiệu ứng sang vùng trưng bày riêng không bị danh hiệu che, có nhãn phân biệt với Avatar và hàng riêng trên mobile. Không tự trang bị avatar hoặc thay đổi kho / EX. **145/145 tests**, lint, TypeScript và build đạt; chi tiết: `design/mythic-profile-clarity-fix.md`.

Danh hiệu bóng đá có **“Truyền Nhân Của Messi”**. Các lĩnh vực khác dùng hình tượng được kiểm chứng bằng nguồn chính thức / lưu trữ khi phù hợp (28 CLB, 19 nhân vật), hoặc người thầy hư cấu theo lĩnh vực khi thông tin CLB chưa đủ rõ (45 CLB). Đây là sự tri ân biểu tượng trong game, không khẳng định người đó là thành viên, người bảo trợ, “giỏi nhất” hoặc chứng thực CLB. Bảng đối chiếu đủ 73 CLB và nguồn: `design/mythic-heritage-sources.md`.

### Artwork và dung lượng

- Pipeline **73 crest Mythic riêng theo CLB**: prompt, chủ thể, tên CLB và đường dẫn nguồn / output của từng ảnh nằm trong `design/mythic-club-prompts.json`. Dùng **ImageGen tích hợp, một lượt gọi riêng cho mỗi asset**, yêu cầu nền alpha thật; không dùng một ảnh sheet rồi cắt, không tái tô màu crest chung và không chuyển sang API / CLI. PNG được giữ ở `design/source/mythic-clubs/<club-id>.png`; WebP phục vụ web ở `public/assets/mythic-clubs/<club-id>.webp`.
- `npm run assets:mythic-clubs` tối ưu các PNG đã lưu thành WebP **512 × 512, có alpha**, giữ nguyên toàn bộ hình dáng bằng `fit: contain`, không cắt ảnh; kiểm tra ID / đường dẫn, nguồn trùng, alpha và giới hạn dưới 140 KiB mỗi asset. Có thể xuất từng nhóm với `npm run assets:mythic-clubs -- --ids volleyball-hn,taekwondo-hn`. Lệnh không gọi ImageGen lại. Đã xuất đủ 73 ảnh: **154.962.875 → 6.149.274 bytes (96,03% nhỏ hơn)**; mỗi WebP **56.928–133.218 bytes**, đều giữ quality 82. Bộ nguồn, WebP và fingerprint pixel đã giải mã đều khác nhau giữa 73 CLB; không dùng lại 73 ảnh bậc thấp hoặc 14 ảnh Royal cũ.
- Bộ Royal đời trước được **giữ nguyên trên đĩa** để bảo toàn nguồn: 12 crest guild theo chủ đề + Vault niêm phong + áo choàng phượng hoàng, ở `design/source/mythic-royal` và `public/assets/mythic`. **12 crest guild cũ không còn là nền nhận diện Mythic của CLB**; Vault và áo choàng vẫn là hai lớp dùng chung chủ động. Số đo lịch sử của đủ 14 ảnh này vẫn là **37.099.545 → 1.469.534 bytes (96,04% nhỏ hơn)**, mỗi WebP 90.368–119.636 bytes; không phải số đo của 73 crest mới. Prompt / provenance giữ ở `design/mythic-royal-prompts.json`. Áo choàng: `design/source/mythic-royal/phoenix-mantle.png` → `public/assets/mythic/phoenix-mantle.webp`, có khoảng trống alpha giữa để ghép crest riêng từng CLB.
- Halo pha lê dùng cho lớp Vạn Hoa: `design/source/mythic-prism-halo.png` → `public/assets/mythic-prism-halo.webp` (640 × 640, alpha), 1.892.350 → 175.470 bytes (**90,7% nhỏ hơn**). Prompt: `design/mythic-art-prompt.json`.
- Bốn lớp hoàn thiện v3: PNG gốc ở `design/source/mythic-finishes/`, WebP ở `public/assets/mythic-finishes/`, đủ prompt và đường dẫn ở `design/mythic-finish-prompts.json`. `npm run assets:mythic-finishes` xuất lại ảnh có alpha 640 × 640 và gutter trong suốt 16px, không cắt chủ thể. Tổng 8.895.895 → 567.148 bytes; mỗi ảnh dưới 200 KB. Không dùng các khung chung này để thay thế crest riêng của từng CLB.
- PNG gốc: `design/source/clubs`; WebP 384 × 384 có alpha: `public/assets/clubs`; prompt từng CLB: `design/club-art-prompts.json`.
- 73 PNG tổng 92,36 MB → 73 WebP tổng 2,44 MB (**97,36% nhỏ hơn**); mỗi ảnh web khoảng 21–46 KB. Dùng ImageGen tích hợp, không chuyển sang API / CLI.

## Cấu trúc chính

- `src/data/arcadeConfig.ts`: giá game, cấu hình 8 ô, thông số chuyển động.
- `src/data/chestConfig.ts`: cấu hình màu, xác suất rương mặc định, số EX ban đầu.
- `src/data/economyConfig.ts`: đường đổi 5 món, 80/60/30/5%, validators và bản nháp mặc định.
- `src/data/cosmetics.ts`: 949 cosmetic CLB, với index tra cứu theo ID / rarity.
- `src/data/clubCosmetics.ts`: tạo 13 cosmetic cho mỗi CLB, giữ các ID cũ ổn định.
- `src/data/mythicCatalog.ts`, `src/data/mythicHeritage.ts`: 8 biến thể, đường dẫn crest Mythic riêng theo ID CLB và hình tượng di sản; 12 chủ đề cũ chỉ giữ làm metadata tương thích / lưu trữ.
- `src/components/ui/MythicArt.tsx`, `MythicVault.tsx`: renderer vật phẩm thực và Vault ẩn danh tách biệt.
- `src/app/mythic.css`, `mythic-royal.css`, `mythic-ceremony.css`: lớp pha lê, 8 kiểu hoàn thiện Mythic và lễ reveal 850 ms bằng transform / opacity.
- `src/app/clubs-royal.css`, `inventory-upgrade.css`: preview CLB và hồ sơ trang bị.
- `src/components/inventory/EquippedProfile.tsx`: 5 ô trang bị và bản xem trước đúng vật phẩm đang dùng.
- `src/lib/visibleMotion.ts`: pause/resume dựa trên viewport, tab visibility và reduced motion.
- `src/lib/demoPoints.ts`: cộng EX test, không thay đổi collection / activity.
- `src/lib/gameEngine.ts`: tính kết quả và giao dịch state, có thể kiểm thử độc lập.
- `src/lib/tradeUpEngine.ts`: xác thực 5 bản sao cùng bậc, tiêu thụ và trả kết quả ngẫu nhiên bậc kế.
- `src/lib/equipmentEngine.ts`: kiểm tra quyền sở hữu / bậc Mythic / ô tương ứng; trang bị và tháo không thay đổi EX hoặc bản sao.
- `src/lib/server`: SQLite, phiên ẩn danh, validation, giao dịch atomic và idempotency.
- `src/app/api`: session, state, commands và health của backend local.
- `src/lib/backendClient.ts`: kết nối API, timeout và retry cùng mã yêu cầu.
- `src/lib/storageTransaction.ts`: adapter Web Lock lịch sử, giữ cho kiểm thử / tương thích bản demo cũ; không còn là nguồn lưu của ứng dụng.
- `src/lib/rewardReel.ts`: reel trang trí và che danh tính Mythic.
- `src/lib/storage.ts`: adapter lưu trữ, migration tương thích và kiểm tra dữ liệu.
- `src/components/providers/XperienceProvider.tsx`, `src/hooks/useXperience.ts`: snapshot server dùng chung, đồng bộ phiên và điều khiển presentation async.
- `src/hooks/useRewardGame.ts`: luồng idle → charging → rolling → settling → result.
- `src/components/orbit`: mini game mới.
- `src/components/trade-up`, `src/components/settings`: workbench và bảng tỷ lệ.
- `tests/arcade.test.ts`, `tests/economy.test.ts`: xác suất, giao dịch, bản sao, giới hạn nâng bậc, backup/migration và lưu trữ.
- `tests/clubs.test.ts`: dữ liệu 73 CLB / 949 vật phẩm, Orbit, EX test, ID cũ và artwork.
- `tests/equipment.test.ts`: 5 ô, quyền sở hữu, persist từng ID biến thể, migration và 584 Mythic đều có thể mở từ rương / không thể đổi đồ.
- `tests/mythic-art.test.ts`, `tests/mythic-assets.test.ts`, `tests/reel.test.ts`: 8 renderer riêng, artwork alpha / nén / mới và che danh tính trước reveal.
- `tests/mythic-effects.test.ts`: kiểm thử v4, bốn material frame khác nhau, alpha / ngân sách asset, phản chiếu đúng ảnh responsive, chuyển động transform thực ở cả bản nhỏ, giới hạn DOM/lớp và cơ chế pause đầy đủ.
- `tests/mythic-club-coverage.test.ts`: đủ avatar và danh hiệu Mythic trong pool rương cho cả 73 CLB, ID độc lập và crest riêng.
- `tests/motion.test.ts`, `tests/storageTransaction.test.ts`: vòng đời hiệu ứng, tài nguyên dùng chung, khóa đồng thời giữa context và lỗi/abort.
- `tests/ui.test.ts`: SSR kho ×N, đồ mẫu đã nghỉ, lịch sử, hydration, 10 ô tỷ lệ và hồ sơ trang bị.
- QA cuối bộ **73 crest riêng (09/10/2026)**: **121/121 kiểm thử đạt**, ESLint, TypeScript và production build đều pass. Kiểm tra trình duyệt xác nhận Taekwondo khác Vovinam, Vovinam Hà Nội khác HCM, bóng chuyền dùng đúng crest mới; hai avatar, danh hiệu, lớp Phoenix/Prism đều giữ nhận diện CLB. Bố cục 320/390px không tràn ngang; tạm dừng / ngoài viewport dừng cả 6 lớp chuyển động Aurora. EX và kho trước/sau không đổi. Chi tiết và ảnh kiểm chứng: `design/mythic-club-identity-fix.md`. Không tuyên bố FPS, heap hoặc Lighthouse.
- QA tiếp theo **hiệu ứng Mythic v2 (09/10/2026)**: **136/136 kiểm thử đạt**, lint / TypeScript / production build pass. Đã xem trực tiếp cả 8 hiệu ứng; tạm dừng và ngoài màn hình đều 0 lớp đang chạy; 320/390px không tràn ngang. EX / kho không đổi. Ảnh thực tế và số đo có giới hạn: `design/mythic-effects-v2.md`.
- QA **chuyển động Mythic v4 (09/10/2026)**: **143/143 kiểm thử đạt**, lint / TypeScript / production build pass. Transform của khung, quỹ đạo và sao băng thay đổi qua thời gian; crest vẫn `transform: none`. Pause / đổi biến thể khi đang Pause / ngoài màn hình đều 0 lớp chạy; resume hoạt động. 320/390px không tràn ngang, console không lỗi, EX / kho không đổi. Công cụ chụp đóng trạng thái animation nên không cung cấp GIF giả lập hay tuyên bố FPS. Chi tiết: `design/mythic-motion-v4.md`.
- Baseline trước nâng cấp chỉ là snapshot đọc: `/inventory` 338 DOM node / 0 canvas; preview bóng đá `/clubs` 681 DOM node, 8 CSS animation hiện trong viewport / 0 animation ngoài viewport đang chạy. Chưa đo FPS, heap hoặc Lighthouse; không coi số DOM là benchmark hiệu năng.
- `design/IMAGE-PROMPTS.md`: prompt ImageGen đầy đủ và hướng dẫn asset.
- `design/mythic-royal-design.md`: hướng thiết kế, motion, preservation và checklist Mythic Royal.

Tái tạo WebP CLB bậc thấp: `npm run assets:clubs`; **73 crest Mythic riêng: `npm run assets:mythic-clubs`** (`scripts/optimize-mythic-clubs.mjs`); halo Mythic: `npm run assets:mythic`; máy đổi đồ: `npm run assets:forge`; bộ 14 Mythic Royal lịch sử / Vault / áo choàng phượng hoàng: `npm run assets:royal` (`scripts/optimize-royal-mythic.mjs`). Các lệnh chỉ tối ưu nguồn PNG đã lưu, không gọi ImageGen lại. Artwork máy 5 ô: `design/source/forge-five-slot.png` → `public/assets/forge-five-slot.webp`, 1000 × 667 có alpha, 2.388.221 → 119.996 bytes (94,98% nhỏ hơn). Prompt chính xác và mode ImageGen tích hợp: `design/forge-art-prompt.json`.

State v2 giữ các ID lặp như một multiset bản sao và lưu thêm `equipped` theo 5 ô. Bản v2 chưa có trang bị được đọc thành hồ sơ trống, không đổi số dư / kho / lịch sử. Việc đổi artwork sang 73 crest riêng **không đổi 949 ID catalog, EX, số bản sao, lịch sử hoặc trang bị**; mỗi CLB vẫn có 5 món bậc thấp + 8 Mythic. ID Mythic cũ `-mythic` tiếp tục là **PRISM**, không chuyển thành một món ngẫu nhiên khác. Adapter localStorage đời trước từng sao lưu v1 tại khóa `fptu-xperience-demo-state-v1-backup` khi ghi lần đầu; backend mới không ghi vào khóa chính hoặc backup này, chỉ đọc khi người dùng chọn nhập. Những đồ trùng đã được hoàn EX trong bản cũ không tự tạo lại bản sao.

## Giới hạn prototype

RNG, số dư EX và cấp đồ hiện được quyết định ở server, lưu trước animation; client không được gửi số dư/kết quả tùy ý. Tuy nhiên **đây vẫn là backend demo local**, không phải hệ thống chống gian lận production: công cụ cộng EX / chỉnh tỷ lệ / reset / nhập localStorage đang bật theo yêu cầu test. Tắt bằng `XPERIENCE_DEMO_TOOLS=false` trước khi cân nhắc mở truy cập công khai. EX vẫn chỉ là điểm trải nghiệm, không có tiền thật.

Cookie không phân biệt cổng: hai bản cùng `localhost` mặc định dùng chung cookie, và dùng chung kho nếu cùng đường dẫn DB. Để test độc lập, đổi **cả** `XPERIENCE_SESSION_COOKIE` và `XPERIENCE_DB_PATH`. localStorage cũ vẫn phân biệt theo origin/cổng. Đã có tài khoản local và rate limit cơ bản, nhưng chưa có quên mật khẩu/email, MFA, quản trị viên, backup tự động, xác minh earn EX hay triển khai Internet. Muốn phát hành cần bổ sung các phần đó, HTTPS, quota phân tán, kiểm soát quyền quản trị và cơ chế audit/retention phù hợp. SQLite local cần ổ đĩa bền vững, không đặt trên hosting filesystem tạm.

Bản audit dependency sau cập nhật: không còn cảnh báo ở thời điểm kiểm tra. PostCSS được override sang bản vá tương thích 8.5.x; không nâng major Next.js trong lần chỉnh này.
