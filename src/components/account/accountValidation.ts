import type { AccountAction } from "@/types/collector";

/** Friendly form feedback only; the backend validates every credential independently. */
export function accountFormError(action: AccountAction, confirmation = "", acceptsAccountSwitch = false): string | null {
  if (action.action === "logout") return null;
  if (action.action === "register" || action.action === "login") {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(action.username.trim())) return "Tên đăng nhập cần 3–24 chữ cái không dấu, số hoặc dấu gạch dưới.";
  }
  if (action.password.length < 12 || action.password.length > 128) return "Mật khẩu cần từ 12 đến 128 ký tự. Có thể dùng một cụm từ dễ nhớ.";
  if (action.action === "register") {
    const length = action.displayName.trim().length;
    if (length < 2 || length > 40 || /[\p{Cc}\p{Cf}]/u.test(action.displayName)) return "Tên hiển thị cần 2–40 ký tự và không chứa ký tự điều khiển.";
  }
  if (action.action === "password" && (action.currentPassword.length < 12 || action.currentPassword.length > 128)) return "Nhập mật khẩu hiện tại của tài khoản.";
  if (action.action !== "login" && action.password !== confirmation) return "Hai mật khẩu mới chưa khớp. Hãy nhập lại để xác nhận.";
  if (action.action === "login" && !acceptsAccountSwitch) return "Xác nhận chuyển sang kho của tài khoản trước khi đăng nhập.";
  return null;
}
