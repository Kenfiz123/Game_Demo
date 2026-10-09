import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><Header/><div className="shell-body"><Sidebar/><main id="main-content">{children}</main></div></div>;
}
