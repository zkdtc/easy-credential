import { FormEvent, useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && me) navigate("/", { replace: true });
  }, [me, loading, navigate]);

  async function useDemo(e: FormEvent) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create demo session.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="credential-preview flex flex-col justify-between gap-8">
        <div>
          <div className="brand-mark">EC</div>
          <p className="eyebrow mt-8">Issuer access</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight text-slate-950">
            Sign in to manage credentials.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
            Create signed records, fund an issuer wallet, and share verification pages.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">Signed</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">Ed25519</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">Price</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">$3.99</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/80 p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">Share</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">URL</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="panel">
          <div className="panel-header">
            <h2 className="font-semibold text-slate-950">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Choose an identity provider.</p>
          </div>
          <div className="panel-body grid gap-3">
            {providers.map((p) => (
              <a
                key={p.id}
                href={`${API_BASE}/auth/${p.id}/login`}
                className={p.className}
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>

        <form onSubmit={useDemo} className="panel">
          <div className="panel-header">
            <h2 className="font-semibold text-slate-950">Local demo</h2>
            <p className="mt-1 text-sm text-slate-500">Use a development workspace.</p>
          </div>
          <div className="panel-body space-y-4">
            <label className="block">
              <span className="label">Name</span>
              <input
                className="input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input
                className="input mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <div className="alert-error">{error}</div>}
            <button className="btn w-full" disabled={submitting}>
              {submitting ? "Starting..." : "Enter demo workspace"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
