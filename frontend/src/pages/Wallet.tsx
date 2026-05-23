import { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtUSD } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";

type Preview = {
  amount_cents: number;
  bonus_cents: number;
  bonus_bps: number;
  total_credit_cents: number;
  credentials_available: number;
  effective_per_credential_cents: number;
};

type WalletSummary = {
  id: string;
  balance_cents: number;
  currency: string;
};

type WalletTransaction = {
  id: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  stripe_payment_intent_id: string | null;
  note: string | null;
  created_at: string;
};

type RechargeResponse = {
  mode: "development_credit" | "stripe_payment_intent";
  wallet?: WalletSummary;
  client_secret?: string;
  amount_cents: number;
  bonus_cents: number;
  bonus_bps: number;
};

type StripeConfig = {
  enabled: boolean;
  publishable_key: string | null;
};

type PaymentSession = {
  clientSecret: string;
  amount_cents: number;
  bonus_cents: number;
};

type RechargeSyncResponse = {
  ok: boolean;
  credited: boolean;
  status?: string;
  wallet?: WalletSummary | null;
};

const PRESETS = [10000, 30000, 50000]; // $100, $300, $500
const APP_BASE = import.meta.env.VITE_APP_BASE ?? "";

export default function Wallet() {
  const { me, loading } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<number>(10000);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [syncingIntentId, setSyncingIntentId] = useState<string | null>(null);
  const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
  const orgId = defaultOrg?.id;

  const stripeConfig = useQuery({
    queryKey: ["stripe-config"],
    queryFn: () => api<StripeConfig>("/stripe/config"),
    enabled: Boolean(me),
  });

  const stripePromise = useMemo(() => {
    const publishableKey = stripeConfig.data?.publishable_key;
    return publishableKey ? loadStripe(publishableKey) : null;
  }, [stripeConfig.data?.publishable_key]);

  const { data, isFetching } = useQuery({
    queryKey: ["preview", amount],
    queryFn: () =>
      api<Preview>(`/pricing/recharge-preview?amount_cents=${amount}`),
    enabled: amount > 0,
  });

  const wallet = useQuery({
    queryKey: ["wallet", orgId],
    queryFn: () => api<WalletSummary>(`/orgs/${orgId}/wallet`),
    enabled: Boolean(orgId),
  });

  const transactions = useQuery({
    queryKey: ["wallet-transactions", orgId],
    queryFn: () => api<WalletTransaction[]>(`/orgs/${orgId}/wallet/transactions`),
    enabled: Boolean(orgId),
  });

  async function syncRecharge(paymentIntentId: string) {
    if (!orgId) return;
    setSyncingIntentId(paymentIntentId);
    setError(null);
    try {
      const result = await api<RechargeSyncResponse>(
        `/orgs/${orgId}/wallet/recharge/sync`,
        {
          method: "POST",
          body: JSON.stringify({ payment_intent_id: paymentIntentId }),
        }
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-transactions", orgId] }),
      ]);
      if (result.credited) {
        setMessage("Payment succeeded and wallet credit was added.");
        setPaymentSession(null);
      } else if (result.status === "succeeded") {
        setMessage("Payment was already credited.");
        setPaymentSession(null);
      } else {
        setMessage(`Payment is ${result.status ?? "processing"}. Wallet will update after confirmation.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync payment.");
    } finally {
      setSyncingIntentId(null);
    }
  }

  useEffect(() => {
    if (!orgId) return;
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");
    if (!paymentIntentId || syncingIntentId === paymentIntentId) return;
    syncRecharge(paymentIntentId);
    window.history.replaceState({}, "", `${window.location.pathname}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function recharge() {
    if (!orgId) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<RechargeResponse>(`/orgs/${orgId}/wallet/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount_cents: amount }),
      });
      if (result.mode === "development_credit") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["wallet", orgId] }),
          queryClient.invalidateQueries({ queryKey: ["wallet-transactions", orgId] }),
        ]);
        setPaymentSession(null);
        setMessage(
          `${fmtUSD(result.amount_cents + result.bonus_cents)} credited to ${defaultOrg?.name}.`
        );
      } else {
        if (!result.client_secret) {
          throw new Error("Stripe did not return a client secret.");
        }
        setPaymentSession({
          clientSecret: result.client_secret,
          amount_cents: result.amount_cents,
          bonus_cents: result.bonus_cents,
        });
        setMessage("Payment form ready. Confirm the payment below.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to recharge wallet.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!me) {
    return (
      <div className="card max-w-xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-semibold">Wallet</h1>
        <Link to="/login" className="btn">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Wallet</p>
          <h1 className="page-title">Credits and issuance ledger</h1>
          {defaultOrg && (
            <p className="page-subtitle">
              {defaultOrg.name} uses prepaid credit for every credential issued.
            </p>
          )}
        </div>
        <Link to="/issue" className="btn">Issue credential</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="credential-preview">
          <p className="eyebrow">Available balance</p>
          <div className="mt-3 text-5xl font-semibold text-slate-950">
            {wallet.data ? fmtUSD(wallet.data.balance_cents) : "Loading"}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white/80 p-4">
              <div className="text-xs font-semibold uppercase text-slate-500">Can issue</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">
                {wallet.data ? Math.floor(wallet.data.balance_cents / 399) : 0}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/80 p-4">
              <div className="text-xs font-semibold uppercase text-slate-500">Price</div>
              <div className="mt-1 text-2xl font-semibold text-slate-950">$3.99</div>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-600">
            Higher recharges receive bonus credit automatically after payment confirmation.
          </p>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="font-semibold text-slate-950">Recharge</h2>
            <p className="mt-1 text-sm text-slate-500">Choose an amount and preview the credit bonus.</p>
          </div>
          <div className="panel-body space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  className={amount === p ? "btn" : "btn-secondary"}
                  onClick={() => setAmount(p)}
                >
                  {fmtUSD(p)}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="label">Custom amount (USD)</span>
              <input
                type="number"
                min={10}
                step="0.01"
                value={(amount / 100).toFixed(2)}
                onChange={(e) =>
                  setAmount(Math.max(0, Math.round(Number(e.target.value || "0") * 100)))
                }
                className="input mt-1"
              />
            </label>

            {data && (
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm">
                <div className="font-medium text-slate-950">
                  {fmtUSD(data.total_credit_cents)} credit after bonus
                </div>
                <div className="mt-1 text-slate-600">
                  You pay {fmtUSD(data.amount_cents)}
                  {data.bonus_cents > 0
                    ? ` and receive ${fmtUSD(data.bonus_cents)} bonus credit.`
                    : "."}
                </div>
                <div className="mt-2 text-slate-600">
                  About {data.credentials_available} credentials at{" "}
                  {fmtUSD(data.effective_per_credential_cents)} effective cost.
                </div>
              </div>
            )}

            {message && <div className="alert-success">{message}</div>}
            {error && <div className="alert-error">{error}</div>}

            <button
              className="btn"
              disabled={isFetching || submitting || amount < 1000}
              onClick={recharge}
            >
              {submitting ? "Preparing..." : stripeConfig.data?.enabled ? "Continue to payment" : "Add funds"}
            </button>

            {paymentSession && stripePromise && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-950">Payment</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Pay {fmtUSD(paymentSession.amount_cents)}
                    {paymentSession.bonus_cents > 0
                      ? ` and receive ${fmtUSD(paymentSession.bonus_cents)} bonus credit.`
                      : "."}
                  </p>
                </div>
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: paymentSession.clientSecret,
                    appearance: { theme: "stripe" },
                  }}
                >
                  <StripePaymentForm
                    disabled={Boolean(syncingIntentId)}
                    onPaymentIntent={syncRecharge}
                    onError={setError}
                    onMessage={setMessage}
                  />
                </Elements>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-950">Transactions</h2>
            <p className="mt-1 text-sm text-slate-500">Wallet activity and issue charges.</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {(transactions.data ?? []).length === 0 && (
            <div className="px-6 py-8 text-sm text-slate-500">No transactions yet.</div>
          )}
          {(transactions.data ?? []).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <div className="font-semibold capitalize text-slate-950">{tx.type.replace("_", " ")}</div>
                <div className="text-xs text-slate-500">
                  {new Date(tx.created_at).toLocaleString()}
                  {tx.note ? ` · ${tx.note}` : ""}
                </div>
              </div>
              <div className={tx.amount_cents >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-slate-900"}>
                {tx.amount_cents >= 0 ? "+" : ""}
                {fmtUSD(tx.amount_cents)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StripePaymentForm({
  disabled,
  onPaymentIntent,
  onError,
  onMessage,
}: {
  disabled: boolean;
  onPaymentIntent: (paymentIntentId: string) => Promise<void>;
  onError: (message: string | null) => void;
  onMessage: (message: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);

  async function confirmPayment(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setConfirming(true);
    onError(null);
    onMessage(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${APP_BASE}/wallet`,
      },
      redirect: "if_required",
    });
    if (error) {
      onError(error.message ?? "Payment could not be confirmed.");
      setConfirming(false);
      return;
    }
    if (paymentIntent?.id) {
      await onPaymentIntent(paymentIntent.id);
    } else {
      onMessage("Payment submitted. Wallet will update after Stripe confirms it.");
    }
    setConfirming(false);
  }

  return (
    <form onSubmit={confirmPayment} className="space-y-4">
      <PaymentElement />
      <button
        className="btn w-full"
        disabled={!stripe || !elements || confirming || disabled}
      >
        {confirming || disabled ? "Confirming..." : "Pay now"}
      </button>
    </form>
  );
}
