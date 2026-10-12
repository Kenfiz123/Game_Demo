import { PublicCollector } from "@/components/collector/PublicCollector";
export const metadata = { title: "Phòng trưng bày Mythic", robots: { index: false, follow: false } };
export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <div className="page-wrap content-page"><PublicCollector key={username} username={username}/></div>;
}
