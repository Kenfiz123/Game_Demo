"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Eye, EyeOff, Fingerprint, KeyRound, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useXperience } from "@/hooks/useXperience";
import type { AccountAction } from "@/types/collector";
import { accountFormError } from "./accountValidation";
import styles from "./account.module.css";

type AccountMode = "register" | "login";
type AuthSubmit = (action: AccountAction) => Promise<boolean>;

function PasswordField({ id, label, value, onChange, autoComplete, describedBy }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password"; describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.passwordField}>
      <input id={id} name={id} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} minLength={12} maxLength={128} required aria-describedby={describedBy} spellCheck={false} autoCapitalize="none" />
      <button type="button" onClick={() => setVisible(!visible)} aria-label={`${visible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}</button>
    </div>
  </div>;
}

export function GuestAccountForm({ mode, ready, busy, error, onSubmit }: {
  mode: AccountMode; ready: boolean; busy: boolean; error: string | null; onSubmit: AuthSubmit;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acceptsSwitch, setAcceptsSwitch] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const mounted = useRef(false);
  const formLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const message = validation ?? (attempted ? error : null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formLock.current || busy || !ready) return;
    const action: AccountAction = mode === "register" ? { action: "register", username: username.trim(), password, displayName: displayName.trim() } : { action: "login", username: username.trim(), password };
    const invalid = accountFormError(action, confirmation, acceptsSwitch);
    setAttempted(true); setValidation(invalid);
    if (invalid) return;
    formLock.current = true;
    try {
      const success = await onSubmit(action);
      if (mounted.current && success) { setPassword(""); setConfirmation(""); }
    } catch {
      if (mounted.current) setValidation("Chưa kết nối được máy chủ. Hãy thử lại.");
    } finally { formLock.current = false; }
  }

  return <form onSubmit={event => void submit(event)} noValidate aria-label={mode === "register" ? "Đăng ký tài khoản" : "Đăng nhập tài khoản"}>
    <fieldset className={styles.fields} disabled={busy || !ready}>
      <legend className={styles.srOnly}>{mode === "register" ? "Thông tin đăng ký" : "Thông tin đăng nhập"}</legend>
      <div className={styles.field}><label htmlFor="account-username">Tên đăng nhập</label><input id="account-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" required aria-describedby="account-username-note" /><small id="account-username-note">3–24 ký tự: chữ không dấu, số, dấu _. Không phân biệt hoa/thường.</small></div>
      {mode === "register" && <div className={styles.field}><label htmlFor="account-display-name">Tên hiển thị</label><input id="account-display-name" name="displayName" autoComplete="nickname" value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={40} required /><small>Tên sẽ xuất hiện trên hồ sơ và dấu ấn vật phẩm.</small></div>}
      <PasswordField id="account-password" label="Mật khẩu" value={password} onChange={setPassword} autoComplete={mode === "register" ? "new-password" : "current-password"} describedBy="account-password-note" />
      <p id="account-password-note" className={styles.fieldNote}>12–128 ký tự. Nên dùng mật khẩu riêng cho bản demo này.</p>
      {mode === "register" ? <PasswordField id="account-password-confirmation" label="Nhập lại mật khẩu" value={confirmation} onChange={setConfirmation} autoComplete="new-password" /> : <label className={styles.confirmation}><input type="checkbox" checked={acceptsSwitch} onChange={event => setAcceptsSwitch(event.target.checked)} /><span>Tôi hiểu đăng nhập sẽ chuyển sang kho của tài khoản. Kho khách hiện tại <strong>không được gộp</strong> và không còn truy cập bằng phiên này; hãy đăng ký trước nếu muốn giữ kho khách.</span></label>}
      <button className={styles.primaryButton} type="submit" disabled={mode === "login" && !acceptsSwitch}>{busy ? "Đang xử lý…" : mode === "register" ? "Tạo tài khoản & giữ kho hiện tại" : "Đăng nhập vào kho của tôi"}<ArrowUpRight size={16} aria-hidden="true" /></button>
    </fieldset>
    {message && <p className={styles.error} role="alert">{message}</p>}
  </form>;
}

export function ChangePasswordForm({ ready, busy, error, onSubmit }: { ready: boolean; busy: boolean; error: string | null; onSubmit: AuthSubmit }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const mounted = useRef(false);
  const formLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const message = validation ?? (attempted ? error : null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formLock.current || busy || !ready) return;
    const action: AccountAction = { action: "password", currentPassword, password };
    const invalid = accountFormError(action, confirmation);
    setAttempted(true); setValidation(invalid);
    if (invalid) return;
    formLock.current = true;
    try {
      if (await onSubmit(action) && mounted.current) { setCurrentPassword(""); setPassword(""); setConfirmation(""); setAttempted(false); }
    } catch {
      if (mounted.current) setValidation("Chưa kết nối được máy chủ. Hãy thử lại.");
    } finally { formLock.current = false; }
  }

  return <form onSubmit={event => void submit(event)} noValidate aria-label="Đổi mật khẩu">
    <fieldset className={styles.fields} disabled={busy || !ready}>
      <legend className={styles.srOnly}>Thông tin đổi mật khẩu</legend>
      <PasswordField id="account-current-password" label="Mật khẩu hiện tại" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
      <PasswordField id="account-new-password" label="Mật khẩu mới" value={password} onChange={setPassword} autoComplete="new-password" describedBy="new-password-note" />
      <p id="new-password-note" className={styles.fieldNote}>12–128 ký tự. Những phiên đăng nhập khác sẽ bị đăng xuất sau khi đổi mật khẩu.</p>
      <PasswordField id="account-new-password-confirmation" label="Nhập lại mật khẩu mới" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
      <button className={styles.secondaryButton} type="submit"><KeyRound size={16} aria-hidden="true" />{busy ? "Đang lưu…" : "Lưu mật khẩu mới"}</button>
    </fieldset>
    {message && <p className={styles.error} role="alert">{message}</p>}
  </form>;
}

const numberFormat = new Intl.NumberFormat("vi-VN");
function joinedDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(timestamp) : "Chưa xác định";
}

export function AccountPanel() {
  const { account, authAction, authError, hydrated, isPlaying, state, economy } = useXperience();
  const [mode, setMode] = useState<AccountMode>("register");
  const [pending, setPending] = useState<AccountAction["action"] | null>(null);
  const [notice, setNotice] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmsLogout, setConfirmsLogout] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const ready = hydrated && !isPlaying;
  const error = localError ?? authError;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function execute(action: AccountAction) {
    if (inFlight.current || !ready) return false;
    inFlight.current = true;
    setPending(action.action); setNotice(""); setLocalError(null);
    try {
      const success = await authAction(action);
      if (!mounted.current) return success;
      if (success) {
        setConfirmsLogout(false);
        setNotice(action.action === "register" ? "Tài khoản đã sẵn sàng. Kho, EX và XCoin hiện tại được giữ nguyên." : action.action === "login" ? "Đã mở kho của tài khoản." : action.action === "password" ? "Đã đổi mật khẩu và đăng xuất các phiên khác." : "Đã đăng xuất. Tài khoản và bộ sưu tập vẫn được lưu trên máy chủ local.");
      }
      return success;
    } catch {
      if (mounted.current) setLocalError("Chưa kết nối được máy chủ. Thử lại khi backend local hoạt động.");
      return false;
    } finally { inFlight.current = false; if (mounted.current) setPending(null); }
  }

  return <div className={`page-wrap ${styles.page}`}>
    <header className={styles.heading}><h1>Tài khoản của bạn</h1><p>Một danh tính cho kho đồ, bộ sưu tập và những di sản bạn sở hữu.</p></header>
    <div className={styles.layout}>
      <section className={styles.identity} aria-labelledby="identity-title">
        <div className={styles.identityMark}>{account ? <ShieldCheck size={32} strokeWidth={1.3} aria-hidden="true" /> : <Fingerprint size={34} strokeWidth={1.3} aria-hidden="true" />}</div>
        <span className={styles.identityKind}>{hydrated ? account ? "Tài khoản đã liên kết" : "Phiên khách" : "Đang kết nối máy chủ"}</span>
        <h2 id="identity-title">{account?.displayName ?? "Giữ lại hành trình của bạn."}</h2>
        <p>{account ? <><span className={styles.username}>@{account.username}</span><br />Tham gia ngày {joinedDate(account.createdAt)}.</> : "Đăng ký để giữ nguyên kho hiện tại và quay lại từ một trình duyệt khác kết nối cùng máy chủ local."}</p>
        <dl className={styles.balances}><div><dt>Vật phẩm trong kho</dt><dd>{hydrated ? numberFormat.format(state.ownedItemIds.length) : "—"}</dd></div><div><dt>Điểm Xperience</dt><dd>{hydrated ? numberFormat.format(state.exPoints) : "—"}<span>EX</span></dd></div><div><dt>Ví sự kiện</dt><dd>{hydrated ? numberFormat.format(economy.coinBalance) : "—"}<span>XCoin</span></dd></div></dl>
        <nav className={styles.links} aria-label="Không gian sưu tầm"><Link href="/profile"><UserRound size={16} aria-hidden="true" />Hồ sơ khoe Mythic<ArrowUpRight size={14} aria-hidden="true" /></Link><Link href="/collection"><Fingerprint size={16} aria-hidden="true" />Sổ bộ sưu tập CLB<ArrowUpRight size={14} aria-hidden="true" /></Link></nav>
        <div className={styles.localNote}><LockKeyhole size={17} aria-hidden="true" /><p>Dữ liệu nằm trên máy chủ local này, chưa phải tài khoản FPT hay Google. Đổi máy cần kết nối lại cùng máy chủ; không có dịch vụ lấy lại mật khẩu qua email.</p></div>
      </section>
      <section className={styles.console} aria-labelledby="account-form-title" aria-busy={pending !== null}>
        {account ? <>
          <div className={styles.consoleHeading}><KeyRound size={19} aria-hidden="true" /><div><h2 id="account-form-title">Bảo vệ bộ sưu tập</h2><p>Mật khẩu được xác minh trên backend; ứng dụng không lưu mật khẩu trong trình duyệt.</p></div></div>
          <ChangePasswordForm key={account.username} ready={ready} busy={pending !== null} error={error} onSubmit={execute} />
          <div className={styles.logout}><h3>Rời tài khoản trên trình duyệt này</h3><p>Đăng xuất tạo một phiên khách mới. Kho của tài khoản không bị xóa và có thể mở lại bằng tên đăng nhập, mật khẩu.</p>{confirmsLogout ? <div className={styles.logoutConfirmation}><p>Bạn muốn đăng xuất khỏi @{account.username}?</p><div><button type="button" className={styles.secondaryButton} disabled={pending !== null || !ready} onClick={() => void execute({ action: "logout" })}>{pending === "logout" ? "Đang đăng xuất…" : "Xác nhận đăng xuất"}</button><button type="button" className={styles.textButton} disabled={pending !== null} onClick={() => setConfirmsLogout(false)}>Ở lại tài khoản</button></div>{error && <p role="alert" className={styles.error}>{error}</p>}</div> : <button type="button" className={styles.textButton} disabled={!ready || pending !== null} onClick={() => { setConfirmsLogout(true); setNotice(""); }}><LogOut size={15} aria-hidden="true" />Đăng xuất</button>}</div>
        </> : <>
          <div className={styles.modeSwitch} role="group" aria-label="Lựa chọn tài khoản"><button type="button" aria-pressed={mode === "register"} disabled={pending !== null} onClick={() => { setMode("register"); setNotice(""); setLocalError(null); }}>Đăng ký giữ kho</button><button type="button" aria-pressed={mode === "login"} disabled={pending !== null} onClick={() => { setMode("login"); setNotice(""); setLocalError(null); }}>Đã có tài khoản</button></div>
          <h2 id="account-form-title">{mode === "register" ? "Biến kho khách thành kho của bạn." : "Chào mừng bạn trở lại."}</h2>
          <p className={styles.formIntroduction}>{mode === "register" ? "Tạo tài khoản không bắt đầu lại. Toàn bộ vật phẩm, EX, XCoin và dấu ấn hiện tại sẽ đi cùng bạn." : "Nhập tài khoản đã tạo trên máy chủ này. Đây là chuyển tài khoản, không phải gộp hai kho đồ."}</p>
          <GuestAccountForm key={mode} mode={mode} ready={ready} busy={pending !== null} error={error} onSubmit={execute} />
        </>}
        {!hydrated && <p className={styles.waiting} role="status">Đang kết nối dữ liệu. Chưa thể thay đổi tài khoản.</p>}
        {isPlaying && <p className={styles.waiting} role="status">Hãy kết thúc lượt chơi trước khi thay đổi tài khoản.</p>}
        {notice && <p className={styles.success} role="status"><Check size={17} aria-hidden="true" />{notice}</p>}
      </section>
    </div>
  </div>;
}
