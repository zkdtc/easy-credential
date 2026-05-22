import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
export default function IssuerOrg() {
    const { me, loading, refetch } = useAuth();
    const queryClient = useQueryClient();
    const [selectedOrgId, setSelectedOrgId] = useState("");
    const selectedOrg = useMemo(() => me?.orgs.find((org) => org.id === selectedOrgId) ?? null, [me?.orgs, selectedOrgId]);
    const [name, setName] = useState("");
    const [website, setWebsite] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [newOrgName, setNewOrgName] = useState("");
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    useEffect(() => {
        if (!me)
            return;
        const fallbackOrgId = me.orgs.find((org) => org.id === me.default_org_id)?.id ?? me.orgs[0]?.id ?? "";
        const nextOrgId = me.orgs.some((org) => org.id === selectedOrgId)
            ? selectedOrgId
            : fallbackOrgId;
        if (nextOrgId !== selectedOrgId) {
            setSelectedOrgId(nextOrgId);
        }
    }, [me, selectedOrgId]);
    useEffect(() => {
        if (!selectedOrg) {
            setName("");
            setWebsite("");
            setLogoUrl("");
            return;
        }
        setName(selectedOrg.name);
        setWebsite(selectedOrg.website ?? "");
        setLogoUrl(selectedOrg.logo_url ?? "");
    }, [selectedOrg]);
    async function saveOrg(e) {
        e.preventDefault();
        if (!selectedOrg)
            return;
        setSaving(true);
        setMessage(null);
        setError(null);
        try {
            const updated = await api(`/orgs/${selectedOrg.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: name.trim(),
                    website: website.trim() || null,
                    logo_url: logoUrl.trim() || null,
                }),
            });
            await Promise.all([
                refetch(),
                queryClient.invalidateQueries({ queryKey: ["credentials", updated.id] }),
            ]);
            setMessage(`${updated.name} is ready as an issuing organization.`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to save issuer organization.");
        }
        finally {
            setSaving(false);
        }
    }
    async function createOrg(e) {
        e.preventDefault();
        setCreating(true);
        setMessage(null);
        setError(null);
        try {
            const created = await api("/orgs", {
                method: "POST",
                body: JSON.stringify({ name: newOrgName.trim() }),
            });
            setNewOrgName("");
            setSelectedOrgId(created.id);
            await refetch();
            setMessage(`${created.name} was created.`);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to create organization.");
        }
        finally {
            setCreating(false);
        }
    }
    if (loading)
        return _jsx("div", { className: "text-slate-500", children: "Loading..." });
    if (!me) {
        return (_jsxs("div", { className: "card mx-auto max-w-xl space-y-4 text-center", children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Issuer organization" }), _jsx(Link, { to: "/login", className: "btn", children: "Sign in" })] }));
    }
    const canEdit = selectedOrg?.role === "owner" || selectedOrg?.role === "admin";
    return (_jsxs("div", { className: "page-shell", children: [_jsxs("div", { className: "page-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Issuer setup" }), _jsx("h1", { className: "page-title", children: "Issuing organization" }), _jsx("p", { className: "page-subtitle", children: "This identity appears on public credential pages, LinkedIn links, and W3C VC / Open Badges exports." })] }), _jsx(Link, { to: "/issue", className: "btn", children: "Issue credential" })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_360px]", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Issuer profile" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Name, website, and logo for the active issuer." })] }), _jsxs("form", { onSubmit: saveOrg, className: "panel-body space-y-5", children: [me.orgs.length > 1 && (_jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Organization" }), _jsx("select", { className: "input mt-1", value: selectedOrgId, onChange: (event) => setSelectedOrgId(event.target.value), children: me.orgs.map((org) => (_jsx("option", { value: org.id, children: org.name }, org.id))) })] })), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "block md:col-span-2", children: [_jsx("span", { className: "label", children: "Organization name" }), _jsx("input", { className: "input mt-1", value: name, onChange: (event) => setName(event.target.value), disabled: !canEdit, required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Website" }), _jsx("input", { className: "input mt-1", type: "url", value: website, onChange: (event) => setWebsite(event.target.value), disabled: !canEdit, placeholder: "https://example.edu" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Logo URL" }), _jsx("input", { className: "input mt-1", type: "url", value: logoUrl, onChange: (event) => setLogoUrl(event.target.value), disabled: !canEdit, placeholder: "https://example.edu/logo.png" })] })] }), selectedOrg && (_jsxs("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm", children: [_jsx("div", { className: "text-xs font-semibold uppercase text-slate-500", children: "Issuer slug" }), _jsx("div", { className: "mt-1 font-mono text-slate-700", children: selectedOrg.slug })] })), !canEdit && selectedOrg && (_jsxs("div", { className: "alert-error", children: ["Your role on this organization is ", selectedOrg.role, ". Ask an owner or admin to update issuer details."] })), error && _jsx("div", { className: "alert-error", children: error }), message && _jsx("div", { className: "alert-success", children: message }), _jsx("button", { className: "btn", disabled: !canEdit || saving || !selectedOrg, children: saving ? "Saving..." : "Save issuer profile" })] })] }), _jsxs("aside", { className: "space-y-4", children: [_jsxs("div", { className: "credential-preview", children: [_jsx("p", { className: "eyebrow", children: "Preview" }), _jsxs("div", { className: "mt-5 flex items-center gap-4", children: [logoUrl ? (_jsx("img", { src: logoUrl, alt: "", className: "h-16 w-16 rounded-lg border border-slate-200 bg-white object-cover" })) : (_jsx("div", { className: "flex h-16 w-16 items-center justify-center rounded-lg bg-slate-950 text-lg font-black text-white", children: (name || "Org")[0].toUpperCase() })), _jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "truncate text-xl font-semibold text-slate-950", children: name || "Organization name" }), website ? (_jsx("a", { href: website, target: "_blank", rel: "noreferrer", className: "mt-1 block truncate text-sm font-semibold text-sky-700", children: website })) : (_jsx("div", { className: "mt-1 text-sm text-slate-500", children: "Website not set" }))] })] }), _jsxs("div", { className: "mt-6 flex flex-wrap gap-2", children: [_jsx("span", { className: selectedOrg?.verified ? "status-active" : "status-muted", children: selectedOrg?.verified ? "verified" : "unverified" }), selectedOrg && _jsx("span", { className: "status-muted", children: selectedOrg.role })] })] }), _jsxs("form", { onSubmit: createOrg, className: "panel p-5", children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Create another org" }), _jsxs("label", { className: "mt-4 block", children: [_jsx("span", { className: "label", children: "Organization name" }), _jsx("input", { className: "input mt-1", value: newOrgName, onChange: (event) => setNewOrgName(event.target.value), required: true })] }), _jsx("button", { className: "btn-secondary mt-4 w-full", disabled: creating, children: creating ? "Creating..." : "Create organization" })] })] })] })] }));
}
