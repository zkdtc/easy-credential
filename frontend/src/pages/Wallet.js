import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtUSD } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";
const PRESETS = [10000, 30000, 50000]; // $100, $300, $500
export default function Wallet() {
    const { me, loading } = useAuth();
    const queryClient = useQueryClient();
    const [amount, setAmount] = useState(10000);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
    const orgId = defaultOrg?.id;
    const { data, isFetching } = useQuery({
        queryKey: ["preview", amount],
        queryFn: () => api(`/pricing/recharge-preview?amount_cents=${amount}`),
        enabled: amount > 0,
    });
    const wallet = useQuery({
        queryKey: ["wallet", orgId],
        queryFn: () => api(`/orgs/${orgId}/wallet`),
        enabled: Boolean(orgId),
    });
    const transactions = useQuery({
        queryKey: ["wallet-transactions", orgId],
        queryFn: () => api(`/orgs/${orgId}/wallet/transactions`),
        enabled: Boolean(orgId),
    });
    async function recharge() {
        if (!orgId)
            return;
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            const result = await api(`/orgs/${orgId}/wallet/recharge`, {
                method: "POST",
                body: JSON.stringify({ amount_cents: amount }),
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["wallet", orgId] }),
                queryClient.invalidateQueries({ queryKey: ["wallet-transactions", orgId] }),
            ]);
            if (result.mode === "development_credit") {
                setMessage(`${fmtUSD(result.amount_cents + result.bonus_cents)} credited to ${defaultOrg?.name}.`);
            }
            else {
                setMessage("Stripe payment intent created. Connect Stripe.js to confirm it.");
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to recharge wallet.");
        }
        finally {
            setSubmitting(false);
        }
    }
    if (loading)
        return _jsx("div", { className: "text-slate-500", children: "Loading..." });
    if (!me) {
        return (_jsxs("div", { className: "card max-w-xl mx-auto text-center space-y-4", children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Wallet" }), _jsx(Link, { to: "/login", className: "btn", children: "Sign in" })] }));
    }
    return (_jsxs("div", { className: "page-shell", children: [_jsxs("div", { className: "page-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Wallet" }), _jsx("h1", { className: "page-title", children: "Credits and issuance ledger" }), defaultOrg && (_jsxs("p", { className: "page-subtitle", children: [defaultOrg.name, " uses prepaid credit for every credential issued."] }))] }), _jsx(Link, { to: "/issue", className: "btn", children: "Issue credential" })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[0.8fr_1.2fr]", children: [_jsxs("section", { className: "credential-preview", children: [_jsx("p", { className: "eyebrow", children: "Available balance" }), _jsx("div", { className: "mt-3 text-5xl font-semibold text-slate-950", children: wallet.data ? fmtUSD(wallet.data.balance_cents) : "Loading" }), _jsxs("div", { className: "mt-5 grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "rounded-lg border border-slate-200 bg-white/80 p-4", children: [_jsx("div", { className: "text-xs font-semibold uppercase text-slate-500", children: "Can issue" }), _jsx("div", { className: "mt-1 text-2xl font-semibold text-slate-950", children: wallet.data ? Math.floor(wallet.data.balance_cents / 399) : 0 })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white/80 p-4", children: [_jsx("div", { className: "text-xs font-semibold uppercase text-slate-500", children: "Price" }), _jsx("div", { className: "mt-1 text-2xl font-semibold text-slate-950", children: "$3.99" })] })] }), _jsx("p", { className: "mt-5 text-sm leading-6 text-slate-600", children: "Higher recharges receive bonus credit automatically in development mode." })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Recharge" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Choose an amount and preview the credit bonus." })] }), _jsxs("div", { className: "panel-body space-y-5", children: [_jsx("div", { className: "grid grid-cols-3 gap-2", children: PRESETS.map((p) => (_jsx("button", { className: amount === p ? "btn" : "btn-secondary", onClick: () => setAmount(p), children: fmtUSD(p) }, p))) }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: "Custom amount (USD)" }), _jsx("input", { type: "number", min: 10, step: "0.01", value: (amount / 100).toFixed(2), onChange: (e) => setAmount(Math.max(0, Math.round(Number(e.target.value || "0") * 100))), className: "input mt-1" })] }), data && (_jsxs("div", { className: "rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm", children: [_jsxs("div", { className: "font-medium text-slate-950", children: [fmtUSD(data.total_credit_cents), " credit after bonus"] }), _jsxs("div", { className: "mt-1 text-slate-600", children: ["You pay ", fmtUSD(data.amount_cents), data.bonus_cents > 0
                                                        ? ` and receive ${fmtUSD(data.bonus_cents)} bonus credit.`
                                                        : "."] }), _jsxs("div", { className: "mt-2 text-slate-600", children: ["About ", data.credentials_available, " credentials at", " ", fmtUSD(data.effective_per_credential_cents), " effective cost."] })] })), message && _jsx("div", { className: "alert-success", children: message }), error && _jsx("div", { className: "alert-error", children: error }), _jsx("button", { className: "btn", disabled: isFetching || submitting || amount < 1000, onClick: recharge, children: submitting ? "Adding funds..." : "Add funds" })] })] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header flex items-center justify-between gap-4", children: _jsxs("div", { children: [_jsx("h2", { className: "font-semibold text-slate-950", children: "Transactions" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "Wallet activity and issue charges." })] }) }), _jsxs("div", { className: "divide-y divide-slate-100", children: [(transactions.data ?? []).length === 0 && (_jsx("div", { className: "px-6 py-8 text-sm text-slate-500", children: "No transactions yet." })), (transactions.data ?? []).map((tx) => (_jsxs("div", { className: "flex items-center justify-between gap-4 px-6 py-4", children: [_jsxs("div", { children: [_jsx("div", { className: "font-semibold capitalize text-slate-950", children: tx.type.replace("_", " ") }), _jsxs("div", { className: "text-xs text-slate-500", children: [new Date(tx.created_at).toLocaleString(), tx.note ? ` · ${tx.note}` : ""] })] }), _jsxs("div", { className: tx.amount_cents >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-slate-900", children: [tx.amount_cents >= 0 ? "+" : "", fmtUSD(tx.amount_cents)] })] }, tx.id)))] })] })] }));
}
