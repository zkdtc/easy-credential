import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiForm, fmtUSD } from "@/lib/api";
import { useAuth } from "@/lib/auth";
const BADGE_STYLES = ["modern", "academic", "technical", "minimal", "bold"];
export default function IssueCredential() {
    const { me, loading } = useAuth();
    const queryClient = useQueryClient();
    const [credentialName, setCredentialName] = useState("Certificate of Completion");
    const [description, setDescription] = useState("Completed the program requirements.");
    const [recipientName, setRecipientName] = useState("");
    const [recipientEmail, setRecipientEmail] = useState("");
    const [linkedinUrl, setLinkedinUrl] = useState("");
    const [requirements, setRequirements] = useState("");
    const [skills, setSkills] = useState("communication, leadership");
    const [expiresAt, setExpiresAt] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [badgePrompt, setBadgePrompt] = useState("A polished badge for leadership and communication");
    const [badgeStyle, setBadgeStyle] = useState("modern");
    const [badgeMessage, setBadgeMessage] = useState(null);
    const [badgeError, setBadgeError] = useState(null);
    const [uploadingBadge, setUploadingBadge] = useState(false);
    const [generatingBadge, setGeneratingBadge] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
    const orgId = defaultOrg?.id;
    const wallet = useQuery({
        queryKey: ["wallet", orgId],
        queryFn: () => api(`/orgs/${orgId}/wallet`),
        enabled: Boolean(orgId),
    });
    async function uploadBadge(event) {
        if (!defaultOrg)
            return;
        const file = event.target.files?.[0];
        if (!file)
            return;
        setUploadingBadge(true);
        setBadgeError(null);
        setBadgeMessage(null);
        try {
            const form = new FormData();
            form.set("org_id", defaultOrg.id);
            form.set("file", file);
            const uploaded = await apiForm("/assets/badges/upload", form);
            setImageUrl(uploaded.image_url);
            setBadgeMessage("Badge image uploaded.");
        }
        catch (err) {
            setBadgeError(err instanceof Error ? err.message : "Unable to upload badge image.");
        }
        finally {
            setUploadingBadge(false);
            event.target.value = "";
        }
    }
    async function generateBadge() {
        if (!defaultOrg)
            return;
        setGeneratingBadge(true);
        setBadgeError(null);
        setBadgeMessage(null);
        try {
            const generated = await api("/ai/design/image", {
                method: "POST",
                body: JSON.stringify({
                    org_id: defaultOrg.id,
                    prompt: badgePrompt,
                    style: badgeStyle,
                }),
            });
            setImageUrl(generated.image_url);
            setBadgeMessage(generated.source === "openai"
                ? "AI badge generated."
                : "Badge generated locally for development.");
        }
        catch (err) {
            setBadgeError(err instanceof Error ? err.message : "Unable to generate badge image.");
        }
        finally {
            setGeneratingBadge(false);
        }
    }
    async function submit(e) {
        e.preventDefault();
        if (!defaultOrg)
            return;
        setSubmitting(true);
        setError(null);
        setResult(null);
        try {
            const issued = await api("/credentials", {
                method: "POST",
                body: JSON.stringify({
                    org_id: defaultOrg.id,
                    credential_name: credentialName,
                    description,
                    recipient_name: recipientName,
                    recipient_email: recipientEmail,
                    recipient_linkedin_url: linkedinUrl || null,
                    requirements: requirements || null,
                    skills: skills.split(",").map((skill) => skill.trim()).filter(Boolean),
                    expires_at: expiresAt ? `${expiresAt}T23:59:59.000Z` : null,
                    image_url: imageUrl || null,
                    design_json: {
                        source: "simple_form",
                        accent: "#0284c7",
                    },
                }),
            });
            setResult(issued);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["credentials", defaultOrg.id] }),
                queryClient.invalidateQueries({ queryKey: ["wallet", defaultOrg.id] }),
                queryClient.invalidateQueries({ queryKey: ["wallet-transactions", defaultOrg.id] }),
            ]);
            setRecipientName("");
            setRecipientEmail("");
            setLinkedinUrl("");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to issue credential.");
        }
        finally {
            setSubmitting(false);
        }
    }
    if (loading)
        return _jsx("div", { className: "text-slate-500", children: "Loading..." });
    if (!me) {
        return (_jsxs("div", { className: "card max-w-xl mx-auto text-center space-y-4", children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Issue a credential" }), _jsx(Link, { to: "/login", className: "btn", children: "Sign in" })] }));
    }
    const previewSkills = skills.split(",").map((skill) => skill.trim()).filter(Boolean);
    return (_jsxs("div", { className: "page-shell", children: [_jsxs("div", { className: "page-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Issue" }), _jsx("h1", { className: "page-title", children: "Create a signed credential" }), defaultOrg && (_jsxs("p", { className: "page-subtitle", children: [defaultOrg.name, " will be shown as the issuing organization."] }))] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Link, { to: "/org", className: "btn-secondary", children: "Issuer setup" }), _jsx(Link, { to: "/credentials", className: "btn-secondary", children: "View credentials" }), _jsx(Link, { to: "/wallet", className: "btn-soft", children: wallet.data ? fmtUSD(wallet.data.balance_cents) : "Wallet" })] })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_380px]", children: [_jsxs("form", { onSubmit: submit, className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Credential details" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Issuance costs $3.99 from the wallet." })] }), _jsxs("div", { className: "panel-body space-y-5", children: [_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "block md:col-span-2", children: [_jsx("span", { className: "label", children: "Credential name" }), _jsx("input", { className: "input mt-1", value: credentialName, onChange: (e) => setCredentialName(e.target.value), required: true })] }), _jsxs("label", { className: "block md:col-span-2", children: [_jsx("span", { className: "label", children: "Description" }), _jsx("textarea", { className: "input mt-1 min-h-24", value: description, onChange: (e) => setDescription(e.target.value) })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Recipient name" }), _jsx("input", { className: "input mt-1", value: recipientName, onChange: (e) => setRecipientName(e.target.value), required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Recipient email" }), _jsx("input", { className: "input mt-1", type: "email", value: recipientEmail, onChange: (e) => setRecipientEmail(e.target.value), required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Recipient LinkedIn URL" }), _jsx("input", { className: "input mt-1", value: linkedinUrl, onChange: (e) => setLinkedinUrl(e.target.value) })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Expires" }), _jsx("input", { className: "input mt-1", type: "date", value: expiresAt, onChange: (e) => setExpiresAt(e.target.value) })] }), _jsxs("label", { className: "block md:col-span-2", children: [_jsx("span", { className: "label", children: "Requirements" }), _jsx("textarea", { className: "input mt-1 min-h-20", value: requirements, onChange: (e) => setRequirements(e.target.value) })] }), _jsxs("label", { className: "block md:col-span-2", children: [_jsx("span", { className: "label", children: "Skills" }), _jsx("input", { className: "input mt-1", value: skills, onChange: (e) => setSkills(e.target.value) })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2", children: [_jsxs("div", { className: "flex flex-col gap-3 md:flex-row md:items-start md:justify-between", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-semibold text-slate-950", children: "Badge image" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Upload artwork, generate one, or paste an image URL." })] }), _jsxs("label", { className: "btn-secondary cursor-pointer", children: [uploadingBadge ? "Uploading..." : "Upload", _jsx("input", { className: "sr-only", type: "file", accept: "image/png,image/jpeg,image/webp", onChange: uploadBadge, disabled: uploadingBadge })] })] }), _jsxs("div", { className: "mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "AI prompt" }), _jsx("input", { className: "input mt-1", value: badgePrompt, onChange: (e) => setBadgePrompt(e.target.value), placeholder: "A badge for data analytics excellence" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Style" }), _jsx("select", { className: "input mt-1", value: badgeStyle, onChange: (e) => setBadgeStyle(e.target.value), children: BADGE_STYLES.map((style) => (_jsx("option", { value: style, children: style[0].toUpperCase() + style.slice(1) }, style))) })] }), _jsx("div", { className: "flex items-end", children: _jsx("button", { className: "btn w-full", type: "button", onClick: generateBadge, disabled: generatingBadge || badgePrompt.trim().length < 3, children: generatingBadge ? "Generating..." : "Generate" }) })] }), _jsxs("label", { className: "mt-4 block", children: [_jsx("span", { className: "label", children: "Image URL" }), _jsx("input", { className: "input mt-1", value: imageUrl, onChange: (e) => setImageUrl(e.target.value), placeholder: "https://..." })] }), badgeError && _jsx("div", { className: "alert-error mt-3", children: badgeError }), badgeMessage && _jsx("div", { className: "alert-success mt-3", children: badgeMessage })] })] }), error && (_jsx("div", { className: "alert-error", children: error.includes("wallet.insufficient_funds") ? (_jsxs(_Fragment, { children: ["Wallet balance is too low. ", _jsx(Link, { to: "/wallet", className: "underline", children: "Add funds" }), "."] })) : (error) })), result && (_jsxs("div", { className: "alert-success space-y-2", children: [_jsxs("div", { children: ["Issued ", result.credential.credential_name, " to", " ", result.credential.recipient_name, ". Wallet balance is", " ", fmtUSD(result.wallet_balance_cents), "."] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx("a", { className: "underline", href: result.credential.public_url, target: "_blank", rel: "noreferrer", children: "Open public URL" }), _jsx("a", { className: "underline", href: result.credential.add_to_linkedin_url, target: "_blank", rel: "noreferrer", children: "Add to LinkedIn" }), _jsx("a", { className: "underline", href: result.credential.export_url, children: "Download VC JSON" })] })] })), _jsx("button", { className: "btn", disabled: submitting, children: submitting ? "Issuing..." : "Issue for $3.99" })] })] }), _jsxs("aside", { className: "space-y-4", children: [_jsxs("div", { className: "credential-preview", children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Preview" }), _jsx("h2", { className: "mt-2 text-2xl font-semibold text-slate-950", children: credentialName || "Credential name" })] }), _jsx("span", { className: "status-active", children: "Draft" })] }), _jsx("div", { className: "mt-6 flex justify-center", children: _jsx("div", { className: "badge-disc h-36 w-36", children: imageUrl ? (_jsx("img", { src: imageUrl, alt: "", className: "h-full w-full rounded-full object-cover" })) : (credentialName || "Credential") }) }), _jsxs("dl", { className: "mt-6 space-y-4 text-sm", children: [_jsx(PreviewField, { label: "Recipient", children: recipientName || "Recipient name" }), _jsx(PreviewField, { label: "Issuer", children: defaultOrg?.name ?? "Issuer organization" }), _jsx(PreviewField, { label: "Description", children: description || "Credential description" })] }), previewSkills.length > 0 && (_jsx("div", { className: "mt-5 flex flex-wrap gap-2", children: previewSkills.slice(0, 5).map((skill) => (_jsx("span", { className: "status-muted", children: skill }, skill))) }))] }), _jsxs("div", { className: "panel p-5", children: [_jsx("div", { className: "text-sm font-medium text-slate-500", children: "Wallet after issue" }), _jsx("div", { className: "mt-2 text-2xl font-semibold text-slate-950", children: wallet.data ? fmtUSD(Math.max(0, wallet.data.balance_cents - 399)) : "Loading" })] }), _jsxs("div", { className: "panel p-5", children: [_jsx("p", { className: "eyebrow", children: "Portable standard" }), _jsx("h3", { className: "mt-2 font-semibold text-slate-950", children: "W3C VC / Open Badges 3.0" }), _jsx("p", { className: "mt-2 text-sm leading-6 text-slate-600", children: "Each credential exports as signed JSON-LD with a hashed recipient identifier, issuer proof, and public verification URL." })] })] })] })] }));
}
function PreviewField({ label, children, }) {
    return (_jsxs("div", { children: [_jsx("dt", { className: "text-xs font-semibold uppercase text-slate-500", children: label }), _jsx("dd", { className: "mt-1 text-slate-900", children: children })] }));
}
