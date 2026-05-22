import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    return (_jsxs("div", { className: "app-shell", children: [_jsx("header", { className: "topbar", children: _jsxs("div", { className: "mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-6", children: [_jsxs(Link, { to: "/", className: "flex items-center gap-3", children: [_jsx("span", { className: "brand-mark", children: "EC" }), _jsxs("span", { children: [_jsx("span", { className: "block text-sm font-semibold text-slate-950", children: "easy-credential" }), _jsx("span", { className: "block text-xs text-slate-500", children: "easylearning.ai" })] })] }), _jsxs("nav", { className: "flex flex-wrap items-center gap-2", children: [_jsx(NavLink, { to: "/", end: true, className: navCls, children: "Dashboard" }), _jsx(NavLink, { to: "/credentials", className: navCls, children: "Credentials" }), _jsx(NavLink, { to: "/issue", className: navCls, children: "Issue" }), _jsx(NavLink, { to: "/wallet", className: navCls, children: "Wallet" }), _jsx(NavLink, { to: "/org", className: navCls, children: "Issuer org" }), loading ? (_jsx("span", { className: "px-3 text-xs text-slate-400", children: "..." })) : me ? (_jsx(UserMenu, { me: me, onLogout: logout })) : (_jsx(NavLink, { to: "/login", className: navCls, children: "Login" }))] })] }) }), _jsx("main", { className: "mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-6", children: _jsx(Outlet, {}) }), _jsx("footer", { className: "border-t border-slate-200/80 bg-white/70 text-sm text-slate-500", children: _jsxs("div", { className: "mx-auto flex max-w-7xl justify-between px-4 py-4 lg:px-6", children: [_jsx("span", { children: "\u00A9 easylearning.ai" }), _jsx("span", { children: "v0.1.0 \u00B7 local MVP" })] }) })] }));
}
function navCls({ isActive }) {
    return isActive ? "nav-link nav-link-active" : "nav-link";
}
function UserMenu({ me, onLogout }) {
    const defaultOrg = me.orgs.find((o) => o.id === me.default_org_id) ?? me.orgs[0];
    return (_jsxs("div", { className: "ml-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm", children: [defaultOrg && (_jsx(Link, { to: "/org", className: "hidden max-w-44 truncate rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 sm:inline", children: defaultOrg.name })), me.avatar_url ? (_jsx("img", { src: me.avatar_url, alt: "", className: "h-7 w-7 rounded-full" })) : (_jsx("div", { className: "flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-900", children: (me.name ?? me.email)[0].toUpperCase() })), _jsx("button", { onClick: onLogout, className: "rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900", children: "Logout" })] }));
}
