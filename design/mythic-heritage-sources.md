# Mythic Heritage — mentor naming research

Ngày kiểm chứng: 2026-10-08. Phạm vi: đủ 73 ID trong `src/data/clubs.json`.

## Quy tắc nội dung

- Danh hiệu đề xuất: `Truyền Nhân Của ${mentor}`. Đây là mỹ từ hư cấu trong game, không phải lời xác nhận người chơi/CLB là học trò, thành viên hoặc đối tác của nhân vật.
- Tên người thật chỉ biểu thị nguồn cảm hứng đúng lĩnh vực; không tuyên bố ai là “vĩ đại nhất”, không gắn thứ hạng hiện tại hoặc thành tích chưa kiểm chứng.
- Nguồn chính thức xác nhận lĩnh vực của nhân vật, không xác nhận CLB FPTU ngưỡng mộ hoặc được nhân vật bảo trợ. Việc ghép CLB ↔ mentor là lựa chọn thiết kế suy ra từ tên CLB.
- Không dùng chân dung, chữ ký, logo đội/tổ chức hoặc hình nghệ sĩ từ các nguồn. Dẫn nguồn không đồng nghĩa có quyền sao chép hình ảnh. Hình Mythic nên là biểu tượng nguyên bản của môn/ngành với hiệu ứng ánh sáng.
- Khi tên CLB chưa rõ chuyên môn hoặc không có nguồn phù hợp, dùng “Bậc Thầy…” hư cấu, đúng chủ đề. Không đặt một người nổi tiếng vào toàn bộ nhóm CLB khác ngành.
- Giữ ID vật phẩm hiện có `club-${club.id}-mythic`; đây là thay đổi tên/truyện nền, không tạo liên hệ thực tế.

## Bảng ghép đầy đủ

Mã nguồn ở cột cuối trỏ tới bảng nguồn bên dưới. `fictional` là mentor hư cấu, không cần tiểu sử người thật. Đề xuất mặc định có 28 CLB dùng 19 nhân vật đã kiểm chứng; 45 CLB dùng mentor hư cấu. Faker (S18) là phương án thay thế có điều kiện, không dùng mặc định khi chưa rõ tựa game của CLB.

| Club ID | Mentor đề xuất | Căn cứ |
| --- | --- | --- |
| `street-workout-hn` | Bậc Thầy Xà Đơn | fictional |
| `iskate-hn` | Bậc Thầy Đường Trượt | fictional |
| `vovinam-hn` | Nguyễn Lộc | S05 |
| `football-team-hn` | Messi | S01 |
| `volleyball-hn` | Karch Kiraly | S03 |
| `badminton-hn` | Lin Dan | S04 |
| `gym-hn` | Bậc Thầy Thể Lực | fictional |
| `fptufc-hn` | Messi | S01 |
| `taekwondo-hn` | Bậc Thầy Cước Pháp | fictional |
| `nunchaku-hn` | Bậc Thầy Côn Pháp | fictional |
| `tabletennis-hn` | Ma Long | S06 |
| `muaythai-hn` | Buakaw | S07 |
| `fvc-hcm` | Nguyễn Lộc | S05 |
| `ffc-hcm` | Messi | S01 |
| `fbc-hcm` | Michael Jordan | S02 |
| `fvb-hcm` | Karch Kiraly | S03 |
| `basketball-dn` | Michael Jordan | S02 |
| `fvc-dn` | Nguyễn Lộc | S05 |
| `hebe-hn` | Bậc Thầy Sân Khấu | fictional |
| `melody-hn` | Mozart | S08 |
| `guitar-hn` | Andrés Segovia | S09 |
| `hiphop-hn` | Bậc Thầy Nhịp Đường Phố | fictional |
| `yosakoi-hn` | Bậc Thầy Vũ Điệu Yosakoi | fictional |
| `ftic-hn` | Bậc Thầy Âm Sắc Việt | fictional |
| `cinema-hn` | Akira Kurosawa | S10 |
| `soleil-hn` | Bậc Thầy Vũ Điệu Mặt Trời | fictional |
| `fti-hcm` | Bậc Thầy Âm Sắc Việt | fictional |
| `beatking-hcm` | Bậc Thầy Nhịp Điệu | fictional |
| `fsharp-hcm` | Mozart | S08 |
| `fstyle-hcm` | Bậc Thầy Chuyển Động | fictional |
| `mec-hcm` | Bậc Thầy Giải Trí Đa Phương Tiện | fictional |
| `fac-hcm` | Bậc Thầy Sắc Màu Văn Hóa | fictional |
| `udc-hcm` | Bậc Thầy Vũ Điệu Đồng Đội | fictional |
| `dfp-dn` | Bậc Thầy Bước Nhảy Đam Mê | fictional |
| `nys-dn` | Bậc Thầy Nghệ Thuật Miền Biển | fictional |
| `fcode` | Linus Torvalds | S11 |
| `js-hn` | Ada Lovelace | S12 |
| `ai-hn` | Alan Turing | S13 |
| `fia-hcm` | Whitfield Diffie | S14 |
| `hnf-hcm` | Vint Cerf | S15 |
| `dever-dn` | Linus Torvalds | S11 |
| `design-hn` | Bậc Thầy Thiết Kế | fictional |
| `photography-hn` | Ansel Adams | S16 |
| `fev-hcm` | Bậc Thầy Sự Kiện | fictional |
| `csg-hcm` | Bậc Thầy Truyền Thông | fictional |
| `fum-dn` | Bậc Thầy Đa Phương Tiện | fictional |
| `evo-dn` | Bậc Thầy Tổ Chức | fictional |
| `chinese-hn` | Bậc Thầy Hoa Ngữ | fictional |
| `maymua-hn` | Bậc Thầy Văn Hóa Phù Tang | fictional |
| `english-hn` | Bậc Thầy Anh Ngữ | fictional |
| `dango-hn` | Bậc Thầy Thế Giới Mộng | fictional |
| `jsc-hcm` | Bậc Thầy Nhật Phong | fictional |
| `eflame-dn` | Bậc Thầy Anh Ngữ | fictional |
| `business-hn` | Bậc Thầy Thương Trường | fictional |
| `fsic-hn` | Warren Buffett | S17 |
| `bec-hcm` | Bậc Thầy Tư Duy Kinh Tế | fictional |
| `skillcetera-hcm` | Bậc Thầy Khai Mở Tiềm Năng | fictional |
| `noshy-hn` | Bậc Thầy Tự Tin | fictional |
| `books-hn` | Bậc Thầy Trang Sách | fictional |
| `debate-hn` | Bậc Thầy Lập Luận | fictional |
| `psychology-hn` | Bậc Thầy Thấu Cảm | fictional |
| `fps-hcm` | Bậc Thầy Hùng Biện | fictional |
| `esports-hn` | Bậc Thầy Đấu Trường Số | fictional |
| `go-hn` | Lee Sedol | S19 |
| `chess-hn` | Magnus Carlsen | S20 |
| `fcc-hcm` | Magnus Carlsen | S20 |
| `fbg-hcm` | Bậc Thầy Bàn Cờ Chiến Thuật | fictional |
| `igo-hn` | Bậc Thầy Gieo Điều Tốt | fictional |
| `vochai-hn` | Bậc Thầy Mầm Xanh | fictional |
| `student-union-hn` | Bậc Thầy Kết Nối Cộng Đồng | fictional |
| `sitigroup-hcm` | Bậc Thầy Trao Nắng Ấm | fictional |
| `unicamp-hn` | Bậc Thầy Dấu Ấn Unicamp | fictional; chưa rõ chuyên môn |
| `color-team-hn` | Bậc Thầy Dấu Ấn Color Team | fictional; chưa rõ chuyên môn |

## Nguồn chính thức / cơ quan lưu trữ có thẩm quyền

Chỉ ghi sự kiện tối thiểu đủ xác nhận lĩnh vực. Đây không phải bảng xếp hạng nhân vật.

| Mã | Nhân vật và lĩnh vực đã kiểm chứng | Nguồn |
| --- | --- | --- |
| S01 | Lionel Messi — cầu thủ bóng đá | [Inter Miami CF: hồ sơ cầu thủ](https://www.intermiamicf.com/players/lionel-messi/) |
| S02 | Michael Jordan — bóng rổ NBA | [NBA: hồ sơ lịch sử](https://www.nba.com/news/history-nba-legend-michael-jordan) |
| S03 | Karch Kiraly — bóng chuyền | [USA Volleyball: hồ sơ Karch Kiraly](https://usavolleyball.org/coach/karch-kiraly/) |
| S04 | Lin Dan — cầu lông; BWF ghi nhận Hall of Fame 2023 | [BWF Annual Report 2023](https://annualreport.bwf.sport/2023/) |
| S05 | Nguyễn Lộc — người sáng lập Vovinam | [World Vovinam Federation: Founder Nguyễn Lộc](https://vovinam.world/masters-nguyen-loc-founder-of-vovinam/) |
| S06 | Ma Long — bóng bàn | [ITTF: Ma Long tại Durban](https://www.ittf.com/2023/05/28/legend-ma-long-honoured-in-durban/) |
| S07 | Buakaw — Muay Thai | [IFMA: Buakaw và Muay Thai](https://muaythai.sport/buakaw_the_legend_and_globalambassador_of_muaythai/) |
| S08 | Wolfgang Amadé Mozart — nhà soạn nhạc, tác phẩm được Mozarteum lưu trữ | [Mozarteum Foundation: giới thiệu tổ chức](https://mozarteum.at/en/foundation) |
| S09 | Andrés Segovia — guitar | [Fundación Andrés Segovia: tiểu sử](https://www.segoviamuseo.com/biografia/) |
| S10 | Akira Kurosawa — đạo diễn điện ảnh | [BFI: những phim đầu và cuối của Kurosawa](https://www.bfi.org.uk/features/akira-kurosawas-first-last-films-sanshiro-sugata-madadayo) |
| S11 | Linus Torvalds — Linux và Git | [Linux Foundation: Leadership, mục Linus Torvalds](https://www.linuxfoundation.org/about/leadership) |
| S12 | Ada Lovelace — ghi chú về Analytical Engine và trình tự thao tác toán học | [Computer History Museum: Ada Lovelace](https://www.computerhistory.org/babbage/adalovelace/) |
| S13 | Alan Turing — tiên phong điện toán và AI | [Alan Turing Institute: About us](https://www.turing.ac.uk/about-us) |
| S14 | Whitfield Diffie — mật mã khóa công khai | [ACM: thông cáo Turing Award 2015](https://awards.acm.org/binaries/content/assets/press-releases/turing-award-2015.pdf) |
| S15 | Vint Cerf — đồng thiết kế TCP/IP và kiến trúc Internet | [Internet Society: Vint Cerf](https://www.internetsociety.org/author/cerf/) |
| S16 | Ansel Adams — nhiếp ảnh | [Ansel Adams Gallery: dòng thời gian](https://www.anseladams.com/pages/ansel-adams-timeline) |
| S17 | Warren Buffett — đầu tư cổ phiếu; thư do Buffett ký | [Berkshire Hathaway: thư cổ đông 2024](https://www.berkshirehathaway.com/letters/2024ltr.pdf) |
| S18 | Faker — tuyển thủ League of Legends; Hall of Legends của Riot | [Riot Games: Patch 14.12](https://www.leagueoflegends.com/en-gb/news/game-updates/patch-14-12-notes/) |
| S19 | Lee Sedol — kỳ thủ cờ vây; đối thủ trong trận AlphaGo do DeepMind tổ chức | [Google DeepMind: AlphaGo](https://deepmind.google/research/alphago/) |
| S20 | Magnus Carlsen — đại kiện tướng cờ vua | [FIDE: hồ sơ Magnus Carlsen](https://ratings.fide.com/profile/1503014) |

## Các trường hợp không nên suy diễn

- `iskate-hn`: tên iSkate chưa xác nhận skateboard hay inline/roller skate. Không tự động dùng Tony Hawk (skateboarding).
- `gym-hn`: không đủ dữ liệu xác định bodybuilding, calisthenics hay artistic gymnastics. Không tự gán Arnold Schwarzenegger/Simone Biles.
- `taekwondo-hn`: “Yokichi Choi” không phải tên đã kiểm chứng. [ITF xác nhận Choi Hong Hi sáng lập ITF năm 1966](https://itftkd.sport/history/choi-hong-hi/), nhưng danh sách không xác nhận CLB theo hệ ITF; dùng mentor hư cấu để tránh suy diễn dòng phái.
- `nunchaku-hn`: Bruce Lee là gợi ý văn hóa đại chúng nhưng nghiên cứu này chưa có nguồn chính thức đủ cụ thể cho côn nhị khúc; dùng Bậc Thầy Côn Pháp.
- `hiphop-hn`, `beatking-hcm`: không đủ dữ liệu phân biệt rap, beatbox, breaking hoặc hip-hop dance. Mentor nhịp điệu trung tính phù hợp hơn người đại diện của một nhánh.
- `js-hn` là Kỹ sư phần mềm Nhật Bản, không phải CLB JavaScript. Ada Lovelace là cảm hứng điện toán rộng, không phải đại diện ngôn ngữ hay văn hóa Nhật.
- `hnf-hcm` là hardware/network, không có dữ kiện xác nhận robotics. Vint Cerf hợp phần network, không tuyên bố ông chuyên robotics.
- `melody-hn`, `fsharp-hcm`: Mozart là cảm hứng âm nhạc/soạn nhạc nói chung. Không khẳng định thể loại của CLB là cổ điển; có thể dùng Bậc Thầy Giai Điệu nếu muốn trung tính thể loại.
- `esports-hn`: Faker đại diện cảm hứng League of Legends, không phải mọi môn esports. Nếu UI không ghi rõ cảm hứng này, dùng Bậc Thầy Đấu Trường Số.
- `fbg-hcm`: boardgame không đồng nghĩa cờ vua/cờ vây; không tự dùng Carlsen/Lee Sedol.
- Các CLB ngôn ngữ, văn hóa Nhật, cộng đồng và phát triển kỹ năng không đủ chuyên môn cụ thể để gán nhà văn, nhân vật tôn giáo/chính trị hoặc chuyên gia y tế.
- Không có CLB tên robotics hoặc marketing riêng trong 73 mục. Không suy ra từ nhóm công nghệ/kinh doanh.

## Câu mô tả an toàn cho UI

Với tên người thật: “Danh hiệu Mythic hư cấu của {club.shortName}, lấy cảm hứng từ {mentor} trong lĩnh vực {field}. Không đại diện quan hệ với nhân vật hoặc tổ chức của họ.”

Với mentor hư cấu: “Danh hiệu Mythic hư cấu của {club.shortName}, kế thừa tinh thần {club.title}. Bậc thầy này là nhân vật biểu tượng của Xperience.”
