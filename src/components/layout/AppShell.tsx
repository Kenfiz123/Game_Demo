import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BackendStatus } from "./BackendStatus";
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell experience-premium"><Header/><div className="shell-body"><Sidebar/><main id="main-content" tabIndex={-1}><BackendStatus/>{children}</main></div></div>;
}
