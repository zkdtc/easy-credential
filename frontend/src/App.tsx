import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

export default function App() {
  const { me, loading, refetch } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    refetch();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="brand-mark">EC</span>
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                easy-credential
              </span>
              <span className="block text-xs text-slate-500">easylearning.ai</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <NavLink to="/" end className={navCls}>Dashboard</NavLink>
            <NavLink to="/credentials" className={navCls}>Credentials</NavLink>
            <NavLink to="/issue" className={navCls}>Issue</NavLink>
            <NavLink to="/wallet" className={navCls}>Wallet</NavLink>
            <NavLink to="/org" className={navCls}>Issuer org</NavLink>
            {loading ? (
              <span className="px-3 text-xs text-slate-400">...</span>
            ) : me ? (
              <UserMenu me={me} onLogout={logout} />
            ) : (
              <NavLink to="/login" className={navCls}>Login</NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200/80 bg-white/70 text-sm text-slate-500">
        <div className="mx-auto flex max-w-7xl justify-between px-4 py-4 lg:px-6">
          <span>© easylearning.ai</span>
          <span>v0.1.0 · local MVP</span>
        </div>
      </footer>
    </div>
  );
}

function navCls({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

function UserMenu({ me, onLogout }: { me: import("@/lib/auth").Me; onLogout: () => void }) {
  const defaultOrg = me.orgs.find((o) => o.id === me.default_org_id) ?? me.orgs[0];
  return (
    <div className="ml-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
      {defaultOrg && (
        <Link
          to="/org"
          className="hidden max-w-44 truncate rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 sm:inline"
        >
          {defaultOrg.name}
        </Link>
      )}
      {me.avatar_url ? (
        <img src={me.avatar_url} alt="" className="h-7 w-7 rounded-full" />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-900">
          {(me.name ?? me.email)[0].toUpperCase()}
        </div>
      )}
      <button onClick={onLogout} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900">
        Logout
      </button>
    </div>
  );
}
