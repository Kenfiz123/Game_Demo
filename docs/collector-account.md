# Nhà sưu tầm · tài khoản, phòng trưng bày và dấu ấn

Bốn tính năng dùng chung backend SQLite local, không thay đổi 949 ID catalog, tỷ lệ hay luật tiêu hao vật phẩm. Người chơi vẫn có thể thử bằng phiên khách; đăng ký là cách giữ quyền truy cập khi cookie thay đổi hoặc dùng trình duyệt khác kết nối cùng máy chủ.

## Các trang

| Đường dẫn | Nội dung |
| --- | --- |
| `/account` | Đăng ký, đăng nhập, đổi mật khẩu và đăng xuất |
| `/profile` | Chỉnh tên/lời giới thiệu, chọn tối đa ba Mythic đang sở hữu để trưng bày |
| `/profile/<username>` | Hồ sơ chia sẻ, chỉ tồn tại khi chủ tài khoản đã bật công khai và lưu |
| `/collection` | Sổ 73 CLB: những mẫu từng khám phá, những mẫu còn trong kho và bộ đã hoàn chỉnh |
| `/inventory` | Chọn từng bản sao và mở **Dấu ấn bản sao** để xem serial, nguồn gốc, hành trình |

## Tài khoản local

- Tên đăng nhập: **3–24 ký tự ASCII**, chỉ chữ cái, số hoặc `_`; không phân biệt hoa/thường. Tên hiển thị: **2–40 ký tự**, hỗ trợ tiếng Việt, không chứa ký tự điều khiển/định dạng ẩn.
- Mật khẩu: **12–128 ký tự**, không tự cắt hoặc bỏ khoảng trắng. Đăng ký và đổi mật khẩu đều cần nhập lại để xác nhận. Nút hiện/ẩn, nhãn thật và `autocomplete` phù hợp hỗ trợ bàn phím và trình quản lý mật khẩu.
- **Đăng ký giữ nguyên phiên hiện tại:** player ID, EX, XCoin, các bản sao, serial, lịch sử, tỷ lệ, trang bị và tiến độ khám phá. Không bắt đầu lại kho.
- **Đăng nhập chuyển sang tài khoản đã có, không gộp kho khách.** Giao diện yêu cầu xác nhận điều này. Cookie khách cũ bị thu hồi; kho khách vẫn còn trong DB nhưng không còn truy cập từ phiên đó. Muốn giữ kho khách, hãy đăng ký cho kho đó trước.
- **Đăng xuất tạo một phiên khách mới**, không xóa tài khoản hay bộ sưu tập của tài khoản. Có bước xác nhận trước khi rời tài khoản.
- **Đổi mật khẩu cần mật khẩu hiện tại**, thu hồi mọi phiên đăng nhập của tài khoản, rồi cấp cookie mới cho trình duyệt đang đổi. Các trình duyệt khác cần đăng nhập lại.
- Không có Google/FPT OAuth, email xác minh, gửi email lấy lại mật khẩu, MFA hay công cụ khôi phục tài khoản. Hãy dùng mật khẩu riêng cho bản demo và lưu trong trình quản lý mật khẩu của bạn.

Tài khoản nằm trên **máy chủ local này**, không phải dịch vụ tài khoản trực tuyến. Một trình duyệt/máy khác phải kết nối cùng server và cùng DB mới đăng nhập lại được. Tự chạy một bản khác với DB mới không mang tài khoản theo. HTTP local chưa mã hóa đường truyền; cần HTTPS và thiết kế triển khai riêng trước khi đưa lên Internet.

### Xác thực và giới hạn

Backend dùng `node:crypto.scrypt` bất đồng bộ với `N=32768, r=8, p=3`, salt ngẫu nhiên 16 byte, khóa 64 byte và `maxmem=64 MiB`; so sánh bằng `timingSafeEqual`. Cấu hình scrypt này nằm trong các lựa chọn tối thiểu được [OWASP liệt kê](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt); cách dùng salt/tham số theo [tài liệu Node.js](https://nodejs.org/download/release/v22.20.0/docs/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Đây không phải chứng nhận bảo mật production.

Mật khẩu không được lưu thô trong DB, URL, localStorage hay state dùng chung của ứng dụng. Cookie host-only có `HttpOnly`, `SameSite=Strict`, `Path=/`, hạn 30 ngày và `Secure` khi truy cập HTTPS; DB chỉ giữ hash token. Cookie đổi sau đăng ký, đăng nhập, đăng xuất và đổi mật khẩu. JSON không chứa token, salt hoặc hash mật khẩu.

Sai mật khẩu và tài khoản không tồn tại cùng nhận lỗi đăng nhập chung. Backend giới hạn 5 lần thử thông tin đăng nhập/tên tài khoản trong 15 phút; thành công xóa bộ đếm. Auth còn giới hạn 30 yêu cầu không phải logout/phút và 2 yêu cầu đang xử lý trong một process; số tác vụ scrypt đồng thời cũng bị giới hạn. Đây là các giới hạn local, chưa phải quota phân tán hay chống abuse hoàn chỉnh.

Mọi auth POST kiểm tra same-origin, body JSON tối đa 4 KiB và DTO đúng trường. Client gửi `X-Xperience-Player` để phát hiện cookie đã chuyển sang player khác. Auth **không tự retry** khi mạng/503 không rõ kết quả: cookie có thể đã được đổi trên server. Provider tải lại snapshot để hòa giải; không tạo lại tài khoản hoặc lượt chơi bằng phỏng đoán.

## Phòng trưng bày Mythic

Tại `/profile`, chọn tối đa **ba mẫu Mythic khác nhau đang thực sự sở hữu**, sửa tên hiển thị và lời giới thiệu tối đa 180 ký tự rồi **Lưu hồ sơ**. Xem trước không cấp vật phẩm hoặc thay đổi trang bị. Chọn một món ở hàng phía dưới để đưa lên sân khấu; mỗi lần chỉ có **một artwork chính được phép chạy animation**, các ảnh nhỏ đứng yên. Có nút tạm dừng và vẫn dùng cơ chế dừng ngoài viewport/tab ẩn/giảm chuyển động của Mythic hiện tại.

Hồ sơ mặc định **riêng tư**. Chỉ tài khoản đã đăng ký mới có thể bật công khai; sau khi lưu mới có nút sao chép liên kết và xem `/profile/<username>`. Bỏ chọn và lưu sẽ ẩn lại; hồ sơ riêng tư và tên không tồn tại đều trả 404 cho người xem công khai.

DTO công khai chỉ gồm tên đăng nhập, tên hiển thị, lời giới thiệu, ngày tham gia, tối đa ba Mythic nổi bật, trang bị hợp lệ và danh sách mẫu từng khám phá. **Không gửi EX, XCoin, danh sách bản sao trong kho, serial, player UUID, lịch sử giao dịch, cookie hay credential.** Trang công khai hiển thị tiến độ và dấu mốc bộ hoàn chỉnh, không phải số bản sao hiện có.

Nếu đã bán, ký gửi hoặc dùng hết bản cuối cùng của món nổi bật, món đó được gỡ khỏi trưng bày; chưa mất bản cuối thì có thể tiếp tục trưng bày. Tiến độ từng khám phá không bị giảm vì việc này.

## Dấu ấn từng bản sao

Một ID catalog mô tả **mẫu vật phẩm**. Mỗi lần nhận mẫu đó tạo một **bản sao riêng** có UUID và serial `XP-…`, kể cả mở trùng. Kho vẫn gộp thẻ theo mẫu với số lượng ×N; bộ chọn bản sao trên thẻ cho phép xem dấu ấn của từng bản cụ thể.

Hộ chiếu bản sao có nguồn nhận (`CHEST`, `ORBIT`, `TRADE_UP`, `FORGE`, `LEGACY`, `IMPORT`), thời điểm nhận gốc nếu biết, thời điểm ghi nhận, thời điểm vào kho hiện tại, tên người nhận đầu tiên nếu đã đăng ký khi nhận và số lần chuyển chủ. Tên trong dấu vết là tên tại thời điểm sự kiện, không phải xác minh danh tính ngoài đời.

- Mở rương/vòng quay, đổi đồ hoặc luyện thành công tạo serial mới. Thua không tạo bản thưởng.
- Đưa lên chợ chuyển đúng bản vào ký gửi; thu hồi trả lại **cùng serial**. Mua bán chuyển bản đó sang người mua, giữ serial/nguồn gốc, cập nhật ngày vào kho và tăng số lần chuyển chủ.
- API đăng bán có thể nhận `copyId` để chọn chính xác bản đang sở hữu. Nếu không chỉ định, lấy bản hợp lệ có ngày vào kho cũ nhất; cùng ngày thì dùng thứ tự ghi nhận ổn định.
- Đổi đồ/luyện dùng catalog ID và tiêu thụ các bản đang trong kho **cũ nhất trước**, không lấy bản đang ký gửi và không dùng bản của player khác. Thành công/thất bại đều ghi nhận tiêu thụ theo luật game.
- Lưu dấu các sự kiện tạo, ký gửi, thu hồi, chuyển chủ và tiêu thụ. Bản đã tiêu thụ không còn mở được hộ chiếu từ kho; dấu vết nội bộ không bị biến thành một bản sao mới.

`GET /api/items/<copy-id>` chỉ cho chủ hiện tại xem bản còn hợp lệ, kể cả bản của họ đang ký gửi. Công khai hồ sơ **không công khai hộ chiếu**. Modal dùng `<dialog>` native cho Escape, giữ focus và trả focus về nút mở; tải dữ liệu được hủy khi đóng/đổi bản. Serial là dấu vết trong hệ thống local, **không phải NFT, token blockchain hay chứng nhận sở hữu ngoài game**.

## Sổ bộ sưu tập CLB

`/collection` theo dõi **mẫu từng khám phá trong suốt hành trình** bằng tập ID duy nhất, tách biệt với multiset bản sao hiện tại. Mở trùng không tăng tiến độ mẫu; bán hoặc dùng đồ đổi/luyện không xóa dấu mốc đã khám phá. Nhận qua chợ cũng ghi nhận mẫu cho người mua. ID catalog đã nghỉ/không xác định không được tính thành tiến độ CLB hiện tại.

Mỗi CLB có 13 mẫu: 5 bậc thấp và 8 Mythic. Sổ cho biết số mẫu từng khám phá, số mẫu còn sở hữu, tổng bản sao và số Mythic từng khám phá. Có tìm kiếm không dấu, lọc nhóm/campus/hoàn chỉnh, **12 CLB mỗi trang** và mở chi tiết từng bộ; artwork trong sổ là preview tĩnh, không đồng loạt chạy hiệu ứng.

Đủ 13/13 mẫu ghi nhận huy hiệu hiển thị **“Bộ hoàn chỉnh”**. Đây là dấu mốc trong sổ, không mint thêm một vật phẩm, không cấp EX/XCoin và không tăng tỷ lệ. Không chứng nhận thành tích hay tư cách thành viên CLB. Reset demo tiêu hủy các bản hiện có nhưng vẫn giữ nhật ký khám phá trọn đời; không dùng reset để xóa lịch sử hoặc nhận thưởng ngày nhiều lần.

## Migration và dữ liệu cũ

SQLite lên **schema version 3** bằng migration bổ sung, giữ state v2, EX, XCoin, bản sao, lịch sử, tỷ lệ và trang bị đã có. Thêm `accounts`, `account_attempts`, `collector_profiles`, `item_copies`, `item_trail`, `collector_discoveries`. Không cần xóa file DB hay chạy seed lại.

Mỗi bản trong kho cũ và mỗi tin ký gửi đang hoạt động được gắn serial riêng. Các bản có trước hệ thống serial mang nguồn `LEGACY`; bản nhập từ localStorage mang `IMPORT`. **Không suy đoán ngày mở hay người nhận ban đầu** từ lịch sử không đủ liên kết: `mintedAt=null`, người nhận ban đầu chưa xác định; `recordedAt` là lúc hệ thống ghi nhận serial. Những bản cũ đang ký gửi không được thêm lần thứ hai vào kho.

Khám phá ban đầu được xây từ các mẫu còn nhận diện trong dữ liệu sở hữu/ký gửi được migrate. Không tuyên bố tái dựng hoàn hảo những món đã bán/tiêu thụ trước khi hệ thống lưu dấu tồn tại. localStorage cũ và backup v1 không bị ghi/xóa; nhập vẫn cần xác nhận và chỉ dành cho phiên mới đủ điều kiện.

Sao lưu trước khi nâng cấp theo [hướng dẫn backend local](backend-local.md#sao-lưu--phục-hồi-local). Với tài khoản đã đăng ký, khôi phục **đúng DB** cho phép đăng nhập lại bằng credential; khách chưa đăng ký vẫn cần cookie còn hợp lệ. Không có luồng quên mật khẩu qua email hoặc backup tự động.

## API bổ sung

| Route/lệnh | Quyền và dữ liệu |
| --- | --- |
| `POST /api/auth` | `register`, `login`, `logout`, `password`; body credential đúng DTO, trả snapshot và cookie mới |
| `GET /api/profiles/<username>` | Không cần đăng nhập; chỉ DTO hồ sơ đã chủ động công khai |
| `GET /api/items/<copy-id>` | Cookie chủ bản sao; không chọn player bằng URL/header |
| `profile-update` qua `/api/commands` | Tên, bio, `isPublic`, tối đa ba `featuredItemIds` Mythic đang sở hữu |
| `market-list` qua `/api/commands` | Thêm `copyId` tùy chọn; server xác minh bản đó thuộc người bán và đúng mẫu |

Snapshot bổ sung `account` (hoặc `null`) và `collector` (profile, bản sao đang có, mẫu từng khám phá). Auth không dùng idempotency retry của game; những command thay đổi kho/hồ sơ vẫn giữ khóa và transaction hiện tại.

## Kiểm thử và cách thử an toàn

Các hồi quy nằm ở `tests/account-ui.test.ts`, `tests/accountHttp.test.ts`, `tests/collectorClient.test.ts` và các bộ store/collector liên quan. HTTP dùng DB trong bộ nhớ riêng; không sửa DB đang chơi. Để thử trong trình duyệt, dùng DB/cookie/build dir QA riêng theo [backend-local.md](backend-local.md#cấu-hình), không reset hoặc đổi tỷ lệ trên phiên người dùng.

Luồng kiểm tra: nhận vài món/coin bằng phiên QA → đăng ký → đối chiếu kho/ví/serial → lưu ba Mythic và công khai → mở liên kết bằng trình duyệt khác → xác nhận không thấy ví/serial → đăng xuất và đăng nhập lại → đổi mật khẩu để kiểm tra phiên khác bị thu hồi → bán/thu hồi một bản sao và đối chiếu serial → kiểm tra sổ vẫn nhớ mẫu sau khi bản cuối rời kho. Tổng số kiểm thử và QA runtime được ghi sau lần xác minh cuối.

### Kết quả xác minh · 11/10/2026

- **343/343 kiểm thử** đạt; lint, TypeScript và production build đạt. Bao gồm bảo toàn migration, rollback, serial qua chợ, quyền xem hộ chiếu, throttle, thu hồi session, DTO lỗi và race đăng nhập chậm sau đăng xuất.
- QA riêng: đăng ký giữ **14 bản / 13 mẫu, 54.321 EX, 20 XCoin**; đổi mật khẩu, đăng xuất rồi đăng nhập bằng trình duyệt khác khôi phục đúng kho/ví, ba món nổi bật và serial. Mật khẩu cũ bị từ chối, reload và restart sang production process vẫn giữ dữ liệu.
- Hồ sơ công khai chỉ trả đúng bảy trường cho phép. Sổ CLB hiển thị **13/13, một bộ hoàn chỉnh**, mở chi tiết có 13 preview tĩnh và không có animation hàng loạt. Chọn bản sao thứ hai mở đúng serial; Escape đóng modal và trả focus về nút mở.
- Đã kiểm tra 320px / 390px / desktop: không tràn ngang. Chỉnh modal để CSS nạp cùng trang kho, căn giữa và không tự đóng khi React Strict Mode chạy lại effect. Production QA không có lỗi console; còn cảnh báo preload CSS của Next và SQLite experimental. Chưa đo FPS/Lighthouse/heap.
- Trước khi cập nhật bản local cổng 3002, đã tạo backup SQLite nhất quán tại `data/backups/pre-collector-20261011.sqlite`. Sau migration v2→v3, SHA-256 của toàn bộ năm bảng cũ (players, sessions, operations, player_economies, market_listings) **không đổi**; số bản đang có/ký gửi khớp kho/tin cũ. Không reset kho, không đổi cookie người dùng.

Ảnh và script QA nằm ở `output/playwright/collector/` (Git bỏ qua); tài khoản thử chỉ nằm trong DB/cookie QA riêng. Bản kiểm thử được dừng sau xác minh; bản local người dùng tiếp tục chạy cổng 3002.
