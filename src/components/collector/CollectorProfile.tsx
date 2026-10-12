"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, LockKeyhole } from "lucide-react";
import { useXperience } from "@/hooks/useXperience";
import { COSMETICS } from "@/data/cosmetics";
import { collectorProfileEditorKey, normalizeCollectorBio, selectFeaturedMythics } from "@/lib/collectorCatalog";
import { validDisplayName } from "@/lib/collectorValidation";
import type { CollectorProfile as Profile } from "@/types/collector";
import { CollectorGallery } from "./CollectorGallery";
import "./collector.css";

function ProfileEditor({ saved, username, ownedItemIds, disabled, save }: {
  saved: Profile; username?: string; ownedItemIds: readonly string[]; disabled: boolean; save: (profile: Profile) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Profile>(() => ({ ...saved, featuredItemIds: [...saved.featuredItemIds] }));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const owned = useMemo(() => new Set(ownedItemIds), [ownedItemIds]);
  const choices = useMemo(() => COSMETICS.filter(item => item.rarity === "MYTHIC" && owned.has(item.id)), [owned]);
  const featured = selectFeaturedMythics(draft.featuredItemIds, ownedItemIds);
  const validName = validDisplayName(draft.displayName);
  const publicReady = Boolean(username && saved.isPublic);
  const sharePath = username ? `/profile/${encodeURIComponent(username)}` : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).href); if (mounted.current) setMessage("Đã sao chép liên kết hồ sơ công khai."); }
    catch { if (mounted.current) setMessage("Không thể sao chép tự động. Mở hồ sơ công khai rồi sao chép địa chỉ trên trình duyệt."); }
  };
  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || disabled || !validName) return;
    inFlight.current = true; setPending(true); setMessage("");
    try {
      const ok = await save({ ...draft, displayName: draft.displayName.trim(), bio: draft.bio.trim(), isPublic: Boolean(username && draft.isPublic), featuredItemIds: featured.map(item => item.id) });
      if (mounted.current) setMessage(ok ? "Đã lưu phòng trưng bày." : "Chưa lưu được hồ sơ. Kiểm tra kết nối rồi thử lại.");
    } catch { if (mounted.current) setMessage("Chưa lưu được hồ sơ. Kiểm tra kết nối rồi thử lại."); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  };
  return <>
    <CollectorGallery displayName={draft.displayName} bio={draft.bio} username={username} items={featured}/>
    <form className="collector-editor" onSubmit={onSave} aria-label="Chỉnh sửa hồ sơ nhà sưu tầm">
      <div className="collector-section-heading"><div><h2>Dấu ấn của bạn</h2><p>Chọn bảo vật đang sở hữu; bản đã bán hoặc dùng đổi đồ không còn được trưng bày.</p></div><Link href="/inventory">Quản lý kho đồ</Link></div>
      <div className="collector-form-grid"><label>Tên hiển thị<input name="displayName" value={draft.displayName} minLength={2} maxLength={40} required autoComplete="nickname" onChange={event => setDraft(current => ({ ...current, displayName: event.target.value }))}/></label><label>Lời giới thiệu<textarea name="bio" value={draft.bio} maxLength={180} rows={3} placeholder="Câu chuyện bộ sưu tập của bạn…" onChange={event => setDraft(current => ({ ...current, bio: normalizeCollectorBio(event.target.value) }))}/><small>{draft.bio.length} / 180 ký tự</small></label></div>
      <fieldset className="collector-featured-fields"><legend>Ba vị trí nổi bật</legend>{[0, 1, 2].map(index => <label key={index}>Vị trí {index + 1}<select value={owned.has(draft.featuredItemIds[index]) ? draft.featuredItemIds[index] : ""} disabled={disabled || pending} onChange={event => setDraft(current => { const ids = [...current.featuredItemIds]; ids[index] = event.target.value; return { ...current, featuredItemIds: ids }; })}><option value="">Chưa trưng bày</option>{choices.map(item => <option key={item.id} value={item.id} disabled={draft.featuredItemIds.some((id, selectedIndex) => selectedIndex !== index && id === item.id)}>{item.name}</option>)}</select></label>)}</fieldset>
      {!choices.length ? <p className="collector-note">Chưa có Mythic trong kho. Bạn vẫn có thể lưu tên và lời giới thiệu trước.</p> : null}
      <div className="collector-publish"><label><input type="checkbox" checked={Boolean(username && draft.isPublic)} disabled={!username || disabled || pending} onChange={event => setDraft(current => ({ ...current, isPublic: event.target.checked }))}/><span>Công khai hồ sơ để chia sẻ<small>Chỉ hiện tên, lời giới thiệu, trang bị và tiến độ khám phá. Không hiện ví EX/XCoin, serial hay lịch sử giao dịch.</small></span></label>{!username ? <Link href="/account"><LockKeyhole size={15}/>Tạo tài khoản để chia sẻ hồ sơ</Link> : <p>{saved.isPublic ? "Hồ sơ đã công khai. Bỏ chọn rồi lưu để ẩn lại." : "Hồ sơ đang riêng tư. Chỉ công khai sau khi bạn chọn và lưu."}</p>}</div>
      <div className="collector-editor-actions"><button className="primary-button" type="submit" disabled={disabled || pending || !validName}>{pending ? "Đang lưu…" : "Lưu hồ sơ"}</button>{publicReady ? <><button type="button" className="secondary-button" onClick={copyLink}><Copy size={15}/>Sao chép liên kết</button><Link className="secondary-button" href={sharePath}><ExternalLink size={15}/>Xem bản công khai</Link></> : null}<p role="status" aria-live="polite">{message}</p></div>
    </form>
  </>;
}

export function CollectorProfile() {
  const { collector, account, playerId, state, hydrated, isPlaying, updateProfile } = useXperience();
  if (!hydrated) return <div className="collector-loading" role="status">Đang tải hồ sơ và bảo vật đã lưu…</div>;
  return <div className="collector-page"><nav className="collector-page-links" aria-label="Khu vực nhà sưu tầm"><Link href="/collection">Sổ bộ sưu tập CLB</Link><Link href="/account">{account ? "Tài khoản" : "Đăng nhập / đăng ký"}</Link></nav><ProfileEditor key={collectorProfileEditorKey(playerId, account?.username)} saved={collector.profile} username={account?.username} ownedItemIds={state.ownedItemIds} disabled={isPlaying} save={updateProfile}/></div>;
}
