import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api, API_BASE } from "@/lib/api";
const providers = [
    { id: "google", label: "Continue with Google", className: "btn-secondary" },
    { id: "github", label: "Continue with GitHub", className: "btn" },
    { id: "apple", label: "Continue with Apple", className: "btn bg-black hover:bg-slate-900" },
    { id: "facebook", label: "Continue with Facebook", className: "btn bg-[#1877F2] hover:bg-[#1469d1]" },
];
export default function Login() {
    const { me, loading, refetch } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("demo@easylearning.ai");
    const [name, setName] = useState("Demo Issuer");
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    useEffect(() => {
        if (!loading && me)
            navigate("/", { replace: true });
    }, [me, loading, navigate]);
    async function useDemo(e) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api("/auth/dev-login", {
                method: "POST",
                body: JSON.stringify({ email, name }),
            });
            await refetch();
            navigate("/", { replace: true });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to create demo session.");
        }
        finally {
            setSubmitting(false);
        }
    }
    return (_jsxs("div", { className: "mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.95fr_1.05fr]", children: [_jsxs("section", { className: "credential-preview flex flex-col justify-between gap-8", children: [_jsxs("div", { children: [_jsx("div", { className: "brand-mark", children: "EC" }), _jsx("p", { className: "eyebrow mt-8", children: "Issuer access" }), _jsx("h1", { className: "mt-2 text-4xl font-semibold leading-tight text-slate-950", children: "Sign in to manage credentials." }), _jsx("p", { className: "mt-4 max-w-md text-sm leading-6 text-slate-600", children: "Create signed records, fund an issuer wallet, and share verification pages." })] }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { className: "rounded-lg border border-slate-200 bg-white/80 p-4", children: [_jsx("div", { className: "text-xs font-semibold uppercase text-slate-500", children: "Signed" }), _jsx("div", { className: "mt-2 text-xl font-semibold text-slate-950", children: "Ed25519" })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white/80 p-4", children: [_jsx("div", { className: "text-xs font-semibold uppercase text-slate-500", children: "Price" }), _jsx("div", { className: "mt-2 text-xl font-semibold text-slate-950", children: "$3.99" })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white/80 p-4", children: [_jsx("div", { className: "text-xs font-semibold uppercase text-slate-500", children: "Share" }), _jsx("div", { className: "mt-2 text-xl font-semibold text-slate-950", children: "URL" })] })] })] }), _jsxs("section", { className: "space-y-4", children: [_jsxs("div", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Sign in" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Choose an identity provider." })] }), _jsx("div", { className: "panel-body grid gap-3", children: providers.map((p) => (_jsx("a", { href: `${API_BASE}/auth/${p.id}/login`, className: p.className, children: p.label }, p.id))) })] }), _jsxs("form", { onSubmit: useDemo, className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Local demo" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Use a development workspace." })] }), _jsxs("div", { className: "panel-body space-y-4", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Name" }), _jsx("input", { className: "input mt-1", value: name, onChange: (e) => setName(e.target.value) })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Email" }), _jsx("input", { className: "input mt-1", type: "email", value: email, onChange: (e) => setEmail(e.target.value) })] }), error && _jsx("div", { className: "alert-error", children: error }), _jsx("button", { className: "btn w-full", disabled: submitting, children: submitting ? "Starting..." : "Enter demo workspace" })] })] })] })] }));
}
