import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
export default function PublicCredential() {
    const { slug } = useParams();
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifyError, setVerifyError] = useState(null);
    const credential = useQuery({
        queryKey: ["public-credential", slug],
        queryFn: () => api(`/api/public/credentials/${slug}`),
        enabled: Boolean(slug),
        retry: false,
    });
    async function verify() {
        if (!slug)
            return;
        setVerifyError(null);
        setVerifyResult(null);
        try {
            setVerifyResult(await api(`/api/public/credentials/${slug}/verify`));
        }
        catch (err) {
            setVerifyError(err instanceof Error ? err.message : "Unable to verify.");
        }
    }
    if (credential.isLoading) {
        return (_jsx("div", { className: "min-h-screen px-4 py-16", children: _jsx("div", { className: "card mx-auto max-w-2xl text-slate-500", children: "Loading..." }) }));
    }
    if (!credential.data) {
        return (_jsx("div", { className: "min-h-screen px-4 py-16", children: _jsx("div", { className: "card mx-auto max-w-2xl", children: _jsx("h1", { className: "text-2xl font-semibold", children: "Credential not found" }) }) }));
    }
    const data = credential.data;
    return (_jsx("div", { className: "min-h-screen px-4 py-10", children: _jsxs("div", { className: "mx-auto max-w-5xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between gap-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "brand-mark", children: "EC" }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-semibold text-slate-950", children: "easy-credential" }), _jsx("div", { className: "text-xs text-slate-500", children: "Public credential" })] })] }), _jsx("span", { className: statusClass(data.status), children: data.status })] }), _jsxs("div", { className: "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg", children: [_jsxs("div", { className: "grid gap-8 p-8 md:grid-cols-[220px_1fr] md:p-10", children: [_jsx("div", { className: "badge-disc h-48 w-48", children: data.image_url ? (_jsx("img", { src: data.image_url, alt: "", className: "h-full w-full rounded-full object-cover" })) : (data.credential_name) }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "W3C VC / Open Badges 3.0" }), _jsx("h1", { className: "mt-2 text-4xl font-semibold leading-tight text-slate-950", children: data.credential_name }), data.description && (_jsx("p", { className: "mt-4 max-w-2xl text-base leading-7 text-slate-600", children: data.description })), _jsxs("dl", { className: "mt-8 grid gap-5 text-sm md:grid-cols-2", children: [_jsx(Field, { label: "Issued to", children: data.recipient_name }), _jsx(Field, { label: "Issued by", children: data.issuer.website ? (_jsx("a", { className: "font-semibold text-sky-700", href: data.issuer.website, target: "_blank", rel: "noreferrer", children: data.issuer.name })) : (data.issuer.name) }), _jsx(Field, { label: "Issued on", children: new Date(data.issued_at).toLocaleDateString() }), _jsx(Field, { label: "Expires", children: data.expires_at ? new Date(data.expires_at).toLocaleDateString() : "No expiration" })] })] })] }), (data.skills.length > 0 || data.requirements) && (_jsxs("div", { className: "space-y-6 border-t border-slate-200 bg-slate-50/70 p-8 md:p-10", children: [data.requirements && (_jsxs("div", { children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Requirements" }), _jsx("p", { className: "mt-2 max-w-3xl text-sm leading-6 text-slate-600", children: data.requirements })] })), data.skills.length > 0 && (_jsxs("div", { children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Skills" }), _jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: data.skills.map((skill) => (_jsx("span", { className: "status-muted", children: skill }, skill))) })] }))] })), _jsxs("div", { className: "flex flex-wrap gap-3 border-t border-slate-200 p-8 md:p-10", children: [_jsx("a", { className: "btn", href: data.add_to_linkedin_url, target: "_blank", rel: "noreferrer", children: "Add to LinkedIn" }), _jsx("button", { className: "btn-secondary", onClick: verify, children: "Verify" }), _jsx("a", { className: "btn-secondary", href: data.qr_url, target: "_blank", rel: "noreferrer", children: "QR code" }), _jsx("a", { className: "btn-secondary", href: data.export_url, children: "Download VC JSON" })] }), (verifyResult || verifyError) && (_jsxs("div", { className: "px-8 pb-8 md:px-10 md:pb-10", children: [verifyError && _jsx("div", { className: "alert-error", children: verifyError }), verifyResult && (_jsxs("div", { className: verifyResult.valid ? "alert-success" : "alert-error", children: ["Signature ", verifyResult.signature_valid ? "matches" : "does not match", ". Result: ", verifyResult.result, ". Key: ", verifyResult.key_id ?? "unknown", "."] }))] }))] })] }) }));
}
function Field({ label, children }) {
    return (_jsxs("div", { children: [_jsx("dt", { className: "text-xs font-semibold uppercase text-slate-500", children: label }), _jsx("dd", { className: "mt-1 font-semibold text-slate-950", children: children })] }));
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
