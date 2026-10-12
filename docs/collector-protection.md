# Bảo vệ kho, wishlist và chợ nâng cao

## Khóa từng bản sao

Trong `/inventory`, chọn đúng bản sao/serial ngay trên thẻ vật phẩm rồi dùng **Khóa bản này** hoặc **Mở khóa bản này**. Nút **Dấu ấn bản sao** xem nguồn gốc và lịch sử. Khóa gắn với **bản sao**, không phải toàn bộ mẫu: có thể giữ một bản quý và vẫn dùng các bản trùng khác. Vật phẩm đã khóa vẫn trang bị và trưng bày được.

Backend từ chối dùng bản đã khóa để đăng bán, đổi 5 món hoặc luyện Mythic. Kiểm tra trước khi quay kết quả/trừ nguyên liệu/coin, kể cả khi gọi API trực tiếp hoặc kho vừa bị khóa ở tab khác. Lệnh bán không chỉ định serial chọn bản chưa khóa; lệnh bán chỉ định serial không tự đổi sang bản khác. Đồ đang ký gửi không thể khóa cho tới khi thu hồi. Retry cùng mã thao tác không khóa/mở khóa hoặc tiêu hao thêm lần nữa.

**Chọn nhanh 5 món** chỉ dùng bản dư chưa khóa, giữ lại ít nhất một bản của mỗi mẫu và bỏ qua mẫu đang trang bị. Tự chọn nguyên liệu vẫn được dùng bản cuối hoặc đồ đang trang bị, nhưng giao diện yêu cầu xác nhận cảnh báo rõ. Hợp đồng hợp lệ vẫn tiêu hao đúng luật hiện tại, kể cả khi luyện thất bại.

Khóa được lưu cùng player, giữ qua tải lại/đăng nhập. Công cụ **Reset demo** vẫn xóa kho kể cả đồ khóa sau xác nhận; khóa không phải sao lưu chống reset.

## Wishlist nối sổ với chợ

Đánh dấu món muốn săn trong kho hoặc các ô vật phẩm của `/collection`, kể cả món chưa khám phá. Danh sách tối đa 200 mẫu, lưu trên server theo player; các lần cập nhật từng món không ghi đè cả danh sách ở tab khác. Wishlist là riêng tư, không xuất hiện trên hồ sơ công khai.

Từ sổ chọn tìm món trên chợ để mở `/market?itemId=<ID>`. Chợ có bộ lọc chỉ món trong wishlist và thông báo số tin của người chơi khác đang rao món mong muốn. Wishlist không thay đổi tỷ lệ rương, pity, phần thưởng hay giá bán.

## Chợ nâng cao

- Tìm tên/CLB không dấu, lọc độ hiếm, CLB, khoảng giá nguyên XCoin, một món cụ thể hoặc wishlist.
- Sắp xếp mới nhất, giá tăng hoặc giá giảm. Bộ lọc áp dụng trên **toàn bộ tin đang bán trước phân trang**, không chỉ 40 tin đã tải. Khi đổi bộ lọc, trang/cursor cũ được hủy; phản hồi cũ không ghi đè bộ lọc hoặc phiên mới.
- Đăng bán chọn đúng serial chưa khóa; cảnh báo khi bán bản cuối hoặc mẫu đang trang bị. Xem lại rồi xác nhận trước khi ký gửi/mua. Thu hồi giữ nguyên serial.
- Lịch sử riêng tư tối đa 50 giao dịch mua/bán hoàn tất gần nhất, ghi đúng giá và thời điểm. Không coi đăng bán/thu hồi là giao dịch thành công, không công khai người mua hoặc ví.
- Khi xem một món cụ thể, giá tham khảo lấy từ giao dịch đã hoàn tất của chính món đó: số lượt bán, thấp/cao nhất, trung bình và giá gần nhất. Chưa có giao dịch thì không dựng giá mẫu.
- Chợ cập nhật khi mở trang, làm mới hoặc quay lại tab. Không có polling liên tục, email/push hoặc cam kết thông báo khi ứng dụng đã đóng.

## API và migration

`POST /api/commands` thêm:

```json
{ "type": "copy-lock", "copyId": "<UUID>", "locked": true }
```

```json
{ "type": "wishlist-update", "itemId": "<catalog ID>", "wished": true }
```

Giữ cookie, `X-Xperience-Player`, `Idempotency-Key`, kiểm tra same-origin và whitelist DTO như các lệnh khác. Snapshot collector thêm `copies[].locked` và `wishlistItemIds`. Lệnh bị chặn bởi đồ khóa trả `success: false, reason: "ITEM_LOCKED"`, không tạo một lượt quay thất bại.

`GET /api/market` nhận `cursor`, `query`, `rarity`, `clubId`, `itemId`, `minPrice`, `maxPrice`, `sort`, `wishlistOnly`. Query tối đa 80 ký tự, giá nguyên 0–1.000.000, sort là `newest|price-asc|price-desc`, wishlistOnly là `true|false`. Trường lạ/trùng/sai kiểu hoặc min > max bị từ chối. Phản hồi bổ sung `history`, `priceSummary` (null nếu chưa có dữ liệu) và `wishlistMatches`; tin của mình vẫn có mục riêng, không mất khi lọc chợ.

SQLite tự lên **schema 4**: thêm cột `item_copies.locked` mặc định 0 và bảng `collector_wishlist`. Không thay state v2, ID/serial, EX/XCoin, lịch sử, trang bị, tài khoản hoặc pity. Wishlist cũ bắt đầu rỗng, mọi bản sao cũ bắt đầu chưa khóa. Sao lưu file DB trước khi nâng cấp; không dùng lại server cũ với DB schema mới.
