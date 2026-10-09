import clubData from "./clubs.json";
export type Club = (typeof clubData)[number];
export const CLUBS: readonly Club[] = clubData;
export const CLUB_GROUPS = [...new Set(CLUBS.map(club => club.group))];
export const CLUB_CAMPUSES = ["Hà Nội", "Hồ Chí Minh", "Đà Nẵng"] as const;
const clubsById = new Map(CLUBS.map(club => [club.id, club]));
export const getClubById = (id: string) => clubsById.get(id);
export const normalizeClubSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
