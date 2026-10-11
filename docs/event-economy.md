# XCoin · Sự kiện, chợ và luyện Mythic

XCoin là coin ảo của demo, không nạp/rút hoặc quy đổi tiền. Dữ liệu và RNG do backend SQLite quyết định. Cấu hình luật nằm ở `src/data/eventEconomy.ts`.

## Sự kiện `/events`

Mỗi ngày Việt Nam (00:00 Asia/Ho_Chi_Minh), nhận một lần cho mỗi nhiệm vụ:

| Nhiệm vụ | XCoin |
| --- | ---: |
| Điểm danh | 20 |
| Mở 3 rương | 35 |
| Mở 10 rương | 80 |
| Đổi đồ thường 1 lượt, thành công hoặc thất bại | 25 |

Tổng tối đa 160 XCoin/ngày. Bộ đếm tăng từ giao dịch hợp lệ ở server; xem trước, vòng quay, nhập save và mua đồ không tính là mở rương. Số dư giữ qua ngày; tiến độ và quyền nhận thưởng làm mới. Nút Cập nhật / quay lại tab tải lại trạng thái. Nhấn lặp hoặc retry cùng mã không cấp thưởng thêm.

## Chợ `/market`

Mỗi tin là đúng một bản sao. Giá nguyên 1–1.000.000 XCoin, tối đa 20 tin đang bán/người. Đăng tin đưa bản sao vào ký gửi, không còn dùng để trang bị/đổi đồ; nếu vẫn còn bản sao khác thì trang bị giữ nguyên. Thu hồi chỉ người bán thực hiện được và hoàn đúng một bản sao. Mua tự trừ coin người mua, cộng người bán và chuyển vật phẩm trong một transaction. Không tự mua tin của mình; tin đã bán không thể mua lại. Không thu phí giao dịch. Vật phẩm trùng vẫn giữ thêm bản sao.

Để thử hai player local: mở bằng **hai trình duyệt hoặc hai profile riêng**, ví dụ Chrome và Edge/ẩn danh. Hai tab cùng cookie là cùng player. Cả hai phải vào cùng server/database. Người bán dùng Làm mới hoặc quay lại tab để cập nhật ví sau khi có người mua. Chưa có tài khoản, chat, đấu giá hay hoàn trả giao dịch.

## Lò Thần Thoại `/forge`

- Đúng 5 bản sao **Legendary** (được trộn CLB, chọn nhiều bản sao cùng ID).
- Bắt buộc dùng XCoin: tối thiểu 10 XCoin = 1%; mỗi 10 XCoin tăng 1 điểm phần trăm; tối đa 250 XCoin = 25%.
- Không dùng coin thì tỷ lệ 0% và không thể bắt đầu luyện. Server từ chối số coin ngoài 10–250 hoặc không phải bội số của 10; không trừ nguyên liệu cho yêu cầu không hợp lệ. Không có mức đảm bảo thành công.
- **Tiêu hao cả 5 món và coin đã chọn, dù thành công hay thất bại.** UI yêu cầu xác nhận trước khi gửi.
- Thành công: chọn ngẫu nhiên đều một trong toàn bộ Mythic catalog, lưu bản sao trùng như bình thường. Không phụ thuộc CLB đầu vào. Không hoàn EX hoặc coin khi thua.
- Lưu 100 lượt luyện gần nhất trong `snapshot.economy.forgeHistory`; kết quả đã lưu trước animation. Không khởi tạo RNG ở frontend.
- Lượt mới lưu `ruleVersion: 2`. Lịch sử trước thay đổi giữ nguyên số coin, tỷ lệ và kết quả theo luật cũ, có nhãn “Luật cũ”; không tính lại tỷ lệ hoặc xóa dữ liệu cũ khi tải ví.

## Âm thanh rương

Web Audio tổng hợp nguyên bản: nạp năng lượng, tiếng lướt thẻ giảm tốc theo reel, tiếng dừng và âm thưởng. Chỉ khởi tạo sau tương tác; không tự phát khi tải trang. Tiếng kéo thẻ không tiết lộ độ hiếm trước reveal. Có bật/tắt và âm lượng lưu riêng ở trình duyệt. Rời trang, ẩn tab hoặc tắt âm sẽ dọn tiếng đang phát; không phát bù hàng loạt khi quay lại.

Kết quả Mythic từ rương phát toàn bộ `public/audio/the-rare-unlock.mp3`, bản sao nguyên vẹn của `The_Rare_Unlock.mp3` do người dùng cung cấp. Một phần tử audio dùng lại qua các lượt mở, phát từ đầu và lặp native vô hạn nếu người chơi chưa thao tác tiếp. Click/chạm, nhấn phím hoặc cuộn ở màn kết quả Mythic sẽ ngắt và đưa bài về đầu; chỉ di chuột không ngắt. Mở tiếp, đóng kết quả, chuyển trang, ẩn tab hoặc tắt âm cũng dừng nhạc; không tự phát lại khi quay lại tab. Dùng chung âm lượng và bật/tắt của rương. Phần tử media được mở quyền âm thầm ở âm lượng 0 trong click mở rương; chỉ phát có tiếng sau khi kết quả Mythic xuất hiện, không báo trước trên reel. Không giải mã toàn bài thành PCM bằng JavaScript, không tạo timer lặp hoặc nhạc tổng hợp thay thế; cleanup gỡ nguồn media khi rời màn hình.

## Dữ liệu và giới hạn

Schema SQLite v2 tự thêm `player_economies` và `market_listings`, giữ nguyên kho/EX/phiên từ v1; không xóa DB để nâng cấp. Coin không được nhập từ save cũ. Mỗi giao dịch có khóa idempotency theo player. Đặt lại demo xóa ví/kho của chính phiên và hủy tin còn mở; không hoàn tác giao dịch đã bán cho player khác. Quyền thưởng đã nhận hôm nay vẫn giữ, không thể reset để nhận lại.

Đây vẫn là **demo local**, không phải kinh tế production chống gian lận: công cụ cộng EX, chỉnh tỷ lệ và nhập kho cũ có thể tạo vật phẩm thử. Tắt bằng `XPERIENCE_DEMO_TOOLS=false` nếu không cần. Ngay cả khi tắt tool, người tạo nhiều phiên ẩn danh vẫn có thể nhận nhiều lượt điểm danh; trước khi public cần đăng nhập, chống nhiều tài khoản/phiên, quyền quản trị, kiểm soát nguồn vật phẩm, quota và backup. Giữ file SQLite ở ổ bền vững, không commit DB/token.

## Kiểm chứng bản sự kiện ban đầu · 11/10/2026

- 262/262 test đạt; ESLint, TypeScript và production build đạt. Bao gồm hai tiến trình Node cùng mua một tin: đúng một người nhận đồ, coin/đồ không nhân đôi. Test lỗi sau ghi xác nhận rollback cả người mua, người bán, ký gửi và idempotency key.
- QA browser riêng: nhập 6 Legendary + 5 Common bằng luồng nhập demo có xác nhận; nhận điểm danh 20 XC, bán 1 Legendary giá 10 XC cho phiên khác. Người mua còn 10 XC/1 món, người bán 30 XC/10 món.
- Kiểm chứng trước thay đổi luật: người bán luyện 5 Legendary + 10 XC ở tỷ lệ cũ 6%; kết quả thực tế thất bại, còn 20 XC/5 Common. Mở 3 rương và nhận nhiệm vụ +35 XC → 55 XC, 49.700 EX, 8 bản sao. Restart sang production với cùng DB/cookie vẫn giữ ví, tiến độ và lịch sử luyện. Không ép RNG trong browser; nhánh thắng được kiểm thử bằng RNG tiêm chỉ ở server test.
- Audio runtime tạo đúng một AudioContext sau click; bật phát cue theo phase, tắt không tạo thêm oscillator qua hai lượt mở. Tùy chọn tắt giữ sau reload. Cleanup khi chuyển trang được kiểm thử ở engine.
- Ba trang mới ở 1366×900, 390×844, 320×844 không tràn ngang; không có animation idle hoặc animation khi reduced-motion. Browser production không có lỗi console; có cảnh báo preload CSS của Next không dùng ngay. Chưa đo Lighthouse/FPS/heap.
- Database mặc định migrate schema 1→2: SHA-256 của toàn bộ player ID/state/revision/legacy-imported trước và sau giống nhau. Bản backup trước migration lưu local trong `data/backups/pre-xcoin-20261011/`, không đưa vào Git.

Ảnh QA: `output/playwright/economy/` (bị Git bỏ qua). Test bằng DB `data/economy-qa.sqlite` và cookie riêng, không tiêu hao kho người dùng.

## Cập nhật luật luyện và nhạc Mythic · 11/10/2026

- 276/276 kiểm thử đạt; lint, TypeScript và production build đạt. Có kiểm thử HTTP/engine từ chối coin 0, ngoài giới hạn hoặc sai bước mà không tiêu hao; biên 1%/25%; reload lịch sử cũ 5%/6%/80% giữ nguyên; phiên bản luật không xác định bị từ chối.
- Browser QA riêng: nhập 10 Legendary, chọn 5 món ở ví 0 coin thì nút luyện bị khóa; gọi API với 0 coin trả 400 và toàn bộ snapshot không đổi. Nhận điểm danh 20 coin, luyện 5 món + 10 coin ở tỷ lệ mới 1%; kết quả thật thất bại, còn 5 món/10 coin. Restart sang production giữ đúng lịch sử `ruleVersion: 2` và số dư.
- Dùng preset rương 100% Mythic **chỉ trong phiên QA** để thử âm thanh, không đổi tỷ lệ người dùng. Web Audio tạo 1 context sau click, 120 nguồn nhạc Mythic chỉ lên lịch ở `phase-result`, gồm 12 nhịp kick; không có nhạc báo trước. Tổng đoạn nhạc khoảng 5,9 giây, không lặp và có khoảng an toàn biên độ. Tắt âm rồi mở Mythic tiếp không tạo thêm nguồn âm; context suspended. Chuyển sang lò luyện đóng context.
- Giao diện lò luyện được xem ở 1366×900 và 320×844; mobile không tràn ngang. Ảnh: `output/playwright/paid-forge-desktop.png`, `paid-forge-mobile.png`. Reload production của phiên QA không có lỗi console. Dev có cảnh báo preload CSS của Next và một lỗi 400 dự kiến từ yêu cầu kiểm thử 0 coin.
- Demo chính tiếp tục ở cổng 3002 với database/cookie ban đầu; QA dùng cổng 3003, database/cookie riêng. Không tiêu hao kho, coin hoặc thay đổi tỷ lệ của phiên người dùng.

## Nâng cấp nhạc festival Mythic · 11/10/2026

- 278/278 kiểm thử đạt; lint, TypeScript và production build đạt. Thêm kiểm thử nhiều lượt nhạc liên tiếp, tái dùng noise buffer, dọn compressor/filter và hủy toàn bộ nguồn tương lai khi mở tiếp hoặc tắt âm. Âm thanh các độ hiếm khác giữ nguyên.
- Native Web Audio trong Edge: không tạo context trước click. Một lượt mở tạo đúng 263 nguồn tổng cộng; toàn bộ 213 nguồn nhạc và 53 nguồn percussion chỉ được lên lịch ở `phase-result`. Kết thúc không còn nguồn sống. Đang phát rồi tắt âm: context suspended, nguồn tương lai bị hủy; mở tiếp khi tắt không tạo nguồn mới. Chuyển trang đóng context; console không có lỗi.
- Render bằng `OfflineAudioContext` 44,1 kHz ở âm lượng 100%: peak đo được 0,572, không có mẫu clipping/NaN; phần drop RMS khoảng 0,089 so với intro 0,0087. Đuôi âm khoảng 7,94 giây và hoàn toàn im sau giây thứ 8. Mức mặc định 35%: peak khoảng 0,196, không clipping. Đây là đo tín hiệu, không phải đánh giá nghe trực tiếp; noise được tổng hợp nên giá trị từng lượt dao động nhẹ.
- QA dùng profile/browser và database riêng, không đổi tỷ lệ hoặc tiêu hao vật phẩm người dùng. Bản production mới chạy tại cổng 3002 với database/cookie cũ; `/chest` và health check trả thành công. Script QA nằm trong `output/playwright/` bị Git bỏ qua.

## Nhạc rock–funk và cao trào Mythic · 11/10/2026

- Thay bản EDM bằng rock–funk 124 BPM, khoảng 8 giây: guitar dây gảy qua overdrive/cabinet, bass đảo phách, snare backbeat và tom fill. Power chord mở màn và đoạn nâng guitar ở ô nhịp thứ ba tạo tương phản; kết E major. Mức âm lượng người dùng và cue các độ hiếm khác giữ nguyên.
- 279/279 kiểm thử đạt; thêm kiểm thử tổng hợp buffer trước khi lấy clock, guitar/trống đồng bộ, power chord mở màn/cao trào, tự giải phóng amp/cabinet và tái dùng buffer/curve qua nhiều lần mở. Nhạc dùng 215 nguồn hữu hạn, 11 buffer mono (~3,1 MB ở 48 kHz), 1 WaveShaper, 1 compressor. Chuẩn bị PCM trước khi đặt origin +30 ms giúp lượt đầu không vào guitar muộn như bản nháp.
- Browser Edge với phiên QA riêng: không tạo AudioContext trước click; 265 nguồn cả lượt mở, trong đó toàn bộ 215 nguồn nhạc chỉ được lên lịch ở `phase-result`. Kết thúc không còn nguồn sống, amp được ngắt kết nối. Buffer không được tạo ở phase trước kết quả.
- Render native `OfflineAudioContext` ở 44,1 kHz: âm lượng 100% có peak khoảng 0,614, không mẫu clipping/NaN; RMS đoạn groove khoảng 0,076. Âm lượng mặc định 35% có peak khoảng 0,212. Đuôi âm tối đa khoảng 8,03 giây, im hoàn toàn sau giây 8,5. Đây là đo tín hiệu, chưa phải đánh giá nghe trực tiếp; percussion noise khiến giá trị từng lượt dao động nhẹ.
- Tắt âm khi đang phát hủy toàn bộ nguồn, context suspended; mở tiếp lúc tắt không tạo nguồn mới, chuyển trang đóng context. Console QA không có lỗi. Lint, TypeScript và production build đạt; bản mới tại cổng 3002 trả health/chest thành công với database/cookie cũ. QA không dùng hoặc thay đổi kho/tỷ lệ của phiên người dùng.

## Toàn bộ bài The Rare Unlock, lặp theo màn kết quả · 11/10/2026

- Thay nhạc tổng hợp Mythic bằng MP3 người dùng cung cấp, không cắt hoặc chuyển mã: 4.368.992 byte, SHA-256 `799F654B5583A0AA21D2C48F8AC0238D673EE32A3DF8B06139020FA086679739` khớp file gốc. Metadata native Edge đo thời lượng 181,786 giây (khoảng 3 phút 02 giây).
- 285/285 kiểm thử đạt, gồm 20 kiểm thử audio; ESLint, TypeScript và production build đạt. Bao gồm primer chậm, play promise bị hủy, kết quả mới thay thế kết quả cũ, lỗi quyền phát, tái dùng một player và dọn media/context. Âm lượng 0 được xử lý như chủ động tắt, không hiện nhầm lỗi quyền trình duyệt.
- Browser QA riêng: không tạo AudioContext/media trước click. Lượt mở đầu có primer ở âm lượng 0 (bị hủy khi vào charging); phát có tiếng chỉ ở `phase-result`. MP3 giải mã/phát thành công, `loop=true`. Seek sát cuối bài để kiểm chứng lặp native: tự trở về đầu và tiếp tục phát mà không nhấn nút hoặc gọi play lại. Di chuột vẫn phát; cuộn, nhấn Tab và click đều dừng, âm lượng 0 và thời gian về đầu.
- Nhiều lượt mở tái dùng đúng một AudioContext và một media element; mở tiếp dừng bài cũ trước lượt mới, không phát chồng. Tắt âm đang phát dừng bài và suspend context; lượt Mythic sau khi tắt không thêm play hoặc oscillator. Chuyển sang kho gỡ src và đóng context. Tùy chọn tắt giữ sau reload; bật ở âm lượng 0 rồi reload/mở Mythic không tạo context/media và không hiện lỗi quyền phát. Console không có lỗi.
- HTTP phục vụ `audio/mpeg`, đủ dung lượng và hỗ trợ `206 Partial Content` cho range request. QA dùng profile, cookie và DB riêng; không đổi tỷ lệ hoặc tiêu hao tài sản của phiên người dùng. Script nằm trong `output/playwright/mp3-*.js` (Git bỏ qua).
- Production mới chạy tại cổng 3002 với database/cookie cũ; health và `/chest` trả 200, file nhạc đủ 4.368.992 byte và range request trả 206. Server/browser QA riêng đã đóng; cấu hình TypeScript được giữ như trước QA.
