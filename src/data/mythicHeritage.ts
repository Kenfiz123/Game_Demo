import type { Club } from "./clubs";

interface MythicHeritage { mentor: string; title: string; isHistoricalPerson: boolean; }
// Verified discipline fit is documented in design/mythic-heritage-sources.md.
// Names are symbolic tributes, never endorsements, official rankings or membership claims.
const historicalMentors: Readonly<Record<string, string>> = {
  "football-team-hn": "Messi", "fptufc-hn": "Messi", "ffc-hcm": "Messi",
  "fbc-hcm": "Michael Jordan", "basketball-dn": "Michael Jordan",
  "volleyball-hn": "Karch Kiraly", "fvb-hcm": "Karch Kiraly",
  "vovinam-hn": "Nguyễn Lộc", "fvc-hcm": "Nguyễn Lộc", "fvc-dn": "Nguyễn Lộc",
  "tabletennis-hn": "Ma Long", "muaythai-hn": "Buakaw",
  "badminton-hn": "Lin Dan",
  "fcode": "Linus Torvalds", "dever-dn": "Linus Torvalds", "js-hn": "Ada Lovelace",
  "ai-hn": "Alan Turing", "hnf-hcm": "Vint Cerf", "fia-hcm": "Whitfield Diffie",
  "guitar-hn": "Andrés Segovia", "cinema-hn": "Akira Kurosawa", "melody-hn": "Mozart", "fsharp-hcm": "Mozart",
  "photography-hn": "Ansel Adams", "chess-hn": "Magnus Carlsen", "fcc-hcm": "Magnus Carlsen", "go-hn": "Lee Sedol",
  "fsic-hn": "Warren Buffett",
};
const fictionalMentors: Readonly<Record<string, string>> = {
  "street-workout-hn": "Bậc Thầy Xà Đơn", "iskate-hn": "Bậc Thầy Đường Trượt",
  "badminton-hn": "Bậc Thầy Đường Cầu", "gym-hn": "Bậc Thầy Sức Mạnh",
  "taekwondo-hn": "Võ Sư Cước Pháp", "nunchaku-hn": "Võ Sư Song Côn",
  "hebe-hn": "Bậc Thầy Nghệ Thuật", "melody-hn": "Bậc Thầy Thanh Âm", "guitar-hn": "Huyền Thoại Lục Huyền",
  "hiphop-hn": "Bậc Thầy Nhịp Phố", "yosakoi-hn": "Bậc Thầy Vũ Điệu Nhật",
  "ftic-hn": "Nghệ Nhân Tơ Trúc", "cinema-hn": "Bậc Thầy Điện Ảnh", "soleil-hn": "Bậc Thầy Vũ Đạo",
  "fti-hcm": "Nghệ Nhân Tơ Trúc", "beatking-hcm": "Bậc Thầy Nhịp Phố", "fsharp-hcm": "Bậc Thầy Hòa Âm",
  "fstyle-hcm": "Bậc Thầy Vũ Đạo", "mec-hcm": "Bậc Thầy Giải Trí", "fac-hcm": "Bậc Thầy Sắc Màu",
  "udc-hcm": "Bậc Thầy Vũ Đạo", "dfp-dn": "Bậc Thầy Vũ Đạo", "nys-dn": "Bậc Thầy Nghệ Thuật",
  "fcode": "Bậc Thầy Mã Nguồn", "js-hn": "Bậc Thầy Mã Nguồn", "dever-dn": "Bậc Thầy Mã Nguồn",
  "design-hn": "Bậc Thầy Tạo Hình", "fev-hcm": "Bậc Thầy Kết Nối", "csg-hcm": "Bậc Thầy Truyền Tin",
  "fum-dn": "Bậc Thầy Truyền Tin", "evo-dn": "Bậc Thầy Tổ Chức",
  "chinese-hn": "Bậc Thầy Hán Ngữ", "maymua-hn": "Bậc Thầy Văn Hóa Phù Tang", "english-hn": "Bậc Thầy Ngôn Từ",
  "dango-hn": "Bậc Thầy Thế Giới Mộng", "jsc-hcm": "Bậc Thầy Nhật Phong", "eflame-dn": "Bậc Thầy Ngôn Từ",
  "business-hn": "Bậc Thầy Thương Trường", "fsic-hn": "Bậc Thầy Đầu Tư", "bec-hcm": "Bậc Thầy Kinh Doanh",
  "skillcetera-hcm": "Bậc Thầy Kỹ Năng", "noshy-hn": "Bậc Thầy Tự Tin", "books-hn": "Bậc Thầy Tri Thức",
  "debate-hn": "Bậc Thầy Biện Luận", "psychology-hn": "Bậc Thầy Thấu Cảm", "fps-hcm": "Bậc Thầy Hùng Biện",
  "esports-hn": "Bậc Thầy Đấu Trường Số", "fbg-hcm": "Bậc Thầy Chiến Thuật",
  "igo-hn": "Bậc Thầy Thiện Nguyện", "vochai-hn": "Bậc Thầy Sống Xanh", "student-union-hn": "Bậc Thầy Kết Nối",
  "sitigroup-hcm": "Bậc Thầy Cộng Đồng", "unicamp-hn": "Bậc Thầy Khám Phá", "color-team-hn": "Bậc Thầy Sáng Tạo",
};
export function getMythicHeritage(club: Club): MythicHeritage {
  const mentor = historicalMentors[club.id] ?? fictionalMentors[club.id] ?? "Bậc Thầy Sáng Tạo";
  return { mentor, title: "Truyền Nhân Của " + mentor, isHistoricalPerson: !!historicalMentors[club.id] };
}
