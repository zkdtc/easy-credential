import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from "@/lib/auth";
import { api, fmtUSD } from "@/lib/api";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
export default function Dashboard() {
    const { me, loading } = useAuth();
    const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
    const orgId = defaultOrg?.id;
    const wallet = useQuery({
        queryKey: ["wallet", orgId],
        queryFn: () => api(`/orgs/${orgId}/wallet`),
        enabled: Boolean(orgId),
    });
    const credentials = useQuery({
        queryKey: ["credentials", orgId],
        queryFn: () => api(`/credentials?org_id=${orgId}`),
        enabled: Boolean(orgId),
    });
    if (loading)
        return _jsx("div", { className: "text-slate-500", children: "Loading..." });
    if (!me) {
        return (_jsx("div", { className: "mx-auto max-w-2xl", children: _jsxs("div", { className: "credential-preview space-y-5 text-center", children: [_jsx("div", { className: "mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-950 text-lg font-black text-white", children: "EC" }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Issuer dashboard" }), _jsx("h1", { className: "page-title", children: "Welcome to easy-credential" }), _jsx("p", { className: "page-subtitle mx-auto", children: "Issue signed credentials, share public URLs, and verify recipient records." })] }), _jsx(Link, { to: "/login", className: "btn", children: "Sign in" })] }) }));
    }
    const items = credentials.data ?? [];
    const activeCount = items.filter((item) => item.status === "active").length;
    const revokedCount = items.filter((item) => item.status === "revoked").length;
    const recent = items.slice(0, 5);
    return (_jsxs("div", { className: "page-shell", children: [_jsxs("div", { className: "page-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Workspace" }), _jsxs("h1", { className: "page-title", children: ["Good to see you, ", me.name ?? me.email] }), defaultOrg && (_jsxs("p", { className: "page-subtitle", children: [defaultOrg.name, " is ready to issue W3C VC / Open Badges 3.0 credentials with public verification."] }))] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Link, { to: "/org", className: "btn-secondary", children: "Set up issuer" }), _jsx(Link, { to: "/wallet", className: "btn-secondary", children: "Add funds" }), _jsx(Link, { to: "/issue", className: "btn", children: "Issue credential" })] })] }), _jsxs("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-4", children: [_jsx(Stat, { label: "Wallet balance", value: wallet.data ? fmtUSD(wallet.data.balance_cents) : "Loading", link: "/wallet", accent: "sky" }), _jsx(Stat, { label: "Issued", value: String(items.length), accent: "slate" }), _jsx(Stat, { label: "Active", value: String(activeCount), accent: "emerald" }), _jsx(Stat, { label: "Revoked", value: String(revokedCount), accent: "amber" })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[1.25fr_0.75fr]", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Recent credentials" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Latest issued records for this org." })] }), _jsx(Link, { to: "/credentials", className: "btn-secondary", children: "View all" })] }), _jsx("div", { className: "divide-y divide-slate-100", children: recent.length === 0 ? (_jsx("div", { className: "px-6 py-8 text-sm text-slate-500", children: "No credentials yet. Your first issued record will appear here." })) : (recent.map((credential) => (_jsxs("div", { className: "flex items-center justify-between gap-4 px-6 py-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate font-semibold text-slate-950", children: credential.credential_name }), _jsxs("div", { className: "mt-1 text-sm text-slate-500", children: [credential.recipient_name, " \u00B7 ", new Date(credential.issued_at).toLocaleDateString()] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: statusClass(credential.status), children: credential.status }), _jsx("a", { href: credential.public_url, target: "_blank", rel: "noreferrer", className: "text-sm font-semibold text-sky-700 hover:text-sky-600", children: "Open" })] })] }, credential.id)))) })] }), _jsxs("div", { className: "space-y-6", children: [_jsxs("section", { className: "panel p-6", children: [_jsx("p", { className: "eyebrow", children: "Portable format" }), _jsx("h2", { className: "mt-2 font-semibold text-slate-950", children: "W3C VC / Open Badges 3.0" }), _jsx("p", { className: "mt-2 text-sm leading-6 text-slate-600", children: "Every issued record has a signed JSON-LD export for wallets, archives, and offline verification." })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Organizations" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Membership and issuer identity." })] }), _jsx(Link, { to: "/org", className: "text-sm font-semibold text-sky-700 hover:text-sky-600", children: "Setup" })] }) }), _jsx("div", { className: "divide-y divide-slate-100", children: me.orgs.map((o) => (_jsxs("div", { className: "flex items-center justify-between gap-4 px-6 py-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate font-semibold text-slate-950", children: o.name }), _jsx("div", { className: "font-mono text-xs text-slate-400", children: o.slug })] }), _jsx("span", { className: "status-muted", children: o.role })] }, o.id))) })] })] })] })] }));
}
function Stat({ label, value, link, accent, }) {
    const accentClass = {
        sky: "bg-sky-50 text-sky-800 border-sky-100",
        slate: "bg-slate-100 text-slate-800 border-slate-200",
        emerald: "bg-emerald-50 text-emerald-800 border-emerald-100",
        amber: "bg-amber-50 text-amber-800 border-amber-100",
    }[accent];
    return (_jsxs("div", { className: "metric-card", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("div", { className: "text-sm font-medium text-slate-500", children: label }), _jsx("div", { className: `h-2.5 w-2.5 rounded-full border ${accentClass}` })] }), _jsx("div", { className: "metric-value", children: value }), link && (_jsx(Link, { to: link, className: "mt-3 inline-block text-sm font-semibold text-sky-700 hover:text-sky-600", children: "Manage wallet" }))] }));
}
function statusClass(status) {
    if (status === "active") {
        return "status-active";
    }
    if (status === "expired") {
        return "status-warning";
    }
    return "status-muted";
}
