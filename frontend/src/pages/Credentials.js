import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
export default function Credentials() {
    const { me, loading } = useAuth();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
    const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
    const orgId = defaultOrg?.id;
    const params = new URLSearchParams();
    if (orgId)
        params.set("org_id", orgId);
    if (q.trim())
        params.set("q", q.trim());
    if (status !== "all")
        params.set("status", status);
    const credentials = useQuery({
        queryKey: ["credentials", orgId, q, status],
        queryFn: () => api(`/credentials?${params.toString()}`),
        enabled: Boolean(orgId),
    });
    if (loading)
        return _jsx("div", { className: "text-slate-500", children: "Loading..." });
    if (!me) {
        return (_jsxs("div", { className: "card max-w-xl mx-auto text-center space-y-4", children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Credentials" }), _jsx(Link, { to: "/login", className: "btn", children: "Sign in" })] }));
    }
    return (_jsxs("div", { className: "page-shell", children: [_jsxs("div", { className: "page-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Credential registry" }), _jsx("h1", { className: "page-title", children: "Issued credentials" }), defaultOrg && (_jsxs("p", { className: "page-subtitle", children: ["Browse, search, and download signed W3C VC / Open Badges 3.0 files for ", defaultOrg.name, "."] }))] }), _jsx(Link, { to: "/issue", className: "btn", children: "Issue credential" })] }), _jsxs("div", { className: "panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between", children: [_jsx("input", { className: "input md:max-w-sm", placeholder: "Search recipient, email, credential", value: q, onChange: (e) => setQ(e.target.value) }), _jsx("div", { className: "flex flex-wrap gap-2", children: ["all", "active", "revoked", "expired"].map((item) => (_jsx("button", { className: status === item ? "btn" : "btn-secondary", onClick: () => setStatus(item), children: item[0].toUpperCase() + item.slice(1) }, item))) })] }), _jsx("div", { className: "panel overflow-hidden", children: (credentials.data ?? []).length === 0 ? (_jsx("div", { className: "px-6 py-10 text-sm text-slate-600", children: "No credentials match this view." })) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "border-b border-slate-100 bg-slate-50 text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-6 py-3 font-semibold", children: "Credential" }), _jsx("th", { className: "px-6 py-3 font-semibold", children: "Recipient" }), _jsx("th", { className: "px-6 py-3 font-semibold", children: "Issued" }), _jsx("th", { className: "px-6 py-3 font-semibold", children: "Status" }), _jsx("th", { className: "px-6 py-3 font-semibold", children: "Links" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: (credentials.data ?? []).map((credential) => (_jsxs("tr", { className: "bg-white transition hover:bg-slate-50", children: [_jsxs("td", { className: "px-6 py-4", children: [_jsx("div", { className: "font-semibold text-slate-950", children: credential.credential_name }), _jsx("div", { className: "font-mono text-xs text-slate-400", children: credential.public_slug })] }), _jsxs("td", { className: "px-6 py-4", children: [_jsx("div", { className: "font-medium text-slate-900", children: credential.recipient_name }), _jsx("div", { className: "text-xs text-slate-500", children: credential.recipient_email })] }), _jsx("td", { className: "px-6 py-4 text-slate-600", children: new Date(credential.issued_at).toLocaleDateString() }), _jsx("td", { className: "px-6 py-4", children: _jsx("span", { className: statusClass(credential.status), children: credential.status }) }), _jsx("td", { className: "px-6 py-4", children: _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx("a", { className: "font-semibold text-sky-700 hover:text-sky-600", href: credential.public_url, target: "_blank", rel: "noreferrer", children: "Open" }), _jsx("a", { className: "font-semibold text-slate-700 hover:text-slate-950", href: credential.export_url, children: "VC JSON" })] }) })] }, credential.id))) })] })) })] }));
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
