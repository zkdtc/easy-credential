import { useAuth } from "@/lib/auth";
import { api, fmtUSD } from "@/lib/api";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

type Wallet = { balance_cents: number };
type Credential = {
  id: string;
  credential_name: string;
  recipient_name: string;
  status: "active" | "revoked" | "expired";
  issued_at: string;
  public_url: string;
};
type CredentialsPage = {
  items: Credential[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export default function Dashboard() {
  const { me, loading } = useAuth();
  const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
  const orgId = defaultOrg?.id;

  const wallet = useQuery({
    queryKey: ["wallet", orgId],
    queryFn: () => api<Wallet>(`/orgs/${orgId}/wallet`),
    enabled: Boolean(orgId),
  });

  const credentials = useQuery({
    queryKey: ["credentials", orgId, "dashboard"],
    // Dashboard only needs the latest few + counts. Fetch a small page; the
    // server still returns `total` for the stats card.
    queryFn: () =>
      api<CredentialsPage>(`/credentials?org_id=${orgId}&limit=20`),
    enabled: Boolean(orgId),
  });

  if (loading) return <div className="text-slate-500">Loading...</div>;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="credential-preview space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-950 text-lg font-black text-white">
            EC
          </div>
          <div>
            <p className="eyebrow">Issuer dashboard</p>
            <h1 className="page-title">Welcome to easy-credential</h1>
            <p className="page-subtitle mx-auto">
              Issue signed credentials, share public URLs, and verify recipient records.
            </p>
          </div>
          <Link to="/login" className="btn">Sign in</Link>
        </div>
      </div>
    );
  }

  const items = credentials.data?.items ?? [];
  const total = credentials.data?.total ?? items.length;
  // Active/revoked stats are based on the page we loaded; the precise
  // overall total uses `total` from the server.
  const activeCount = items.filter((item) => item.status === "active").length;
  const revokedCount = items.filter((item) => item.status === "revoked").length;
  const recent = items.slice(0, 5);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 className="page-title">Good to see you, {me.name ?? me.email}</h1>
          {defaultOrg && (
            <p className="page-subtitle">
              {defaultOrg.name} is ready to issue W3C VC / Open Badges 3.0
              credentials with public verification.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/org" className="btn-secondary">Set up issuer</Link>
          <Link to="/wallet" className="btn-secondary">Add funds</Link>
          <Link to="/issue" className="btn">Issue credential</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Stat
          label="Wallet balance"
          value={wallet.data ? fmtUSD(wallet.data.balance_cents) : "Loading"}
          link="/wallet"
          accent="sky"
        />
        <Stat label="Issued" value={String(total)} accent="slate" />
        <Stat label="Active" value={String(activeCount)} accent="emerald" />
        <Stat label="Revoked" value={String(revokedCount)} accent="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="panel">
          <div className="panel-header flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-950">Recent credentials</h2>
              <p className="mt-1 text-sm text-slate-500">Latest issued records for this org.</p>
            </div>
            <Link to="/credentials" className="btn-secondary">View all</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recent.length === 0 ? (
              <div className="px-6 py-8 text-sm text-slate-500">
                No credentials yet. Your first issued record will appear here.
              </div>
            ) : (
              recent.map((credential) => (
                <div key={credential.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">
                      {credential.credential_name}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {credential.recipient_name} · {new Date(credential.issued_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={statusClass(credential.status)}>{credential.status}</span>
                    <a
                      href={credential.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-sky-700 hover:text-sky-600"
                    >
                      Open
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel p-6">
            <p className="eyebrow">Portable format</p>
            <h2 className="mt-2 font-semibold text-slate-950">
              W3C VC / Open Badges 3.0
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Every issued record has a signed JSON-LD export for wallets,
              archives, and offline verification.
            </p>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950">Organizations</h2>
                  <p className="mt-1 text-sm text-slate-500">Membership and issuer identity.</p>
                </div>
                <Link to="/org" className="text-sm font-semibold text-sky-700 hover:text-sky-600">
                  Setup
                </Link>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {me.orgs.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">{o.name}</div>
                    <div className="font-mono text-xs text-slate-400">{o.slug}</div>
                  </div>
                  <span className="status-muted">{o.role}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, link, accent,
}: { label: string; value: string; link?: string; accent: "sky" | "slate" | "emerald" | "amber" }) {
  const accentClass = {
    sky: "bg-sky-50 text-sky-800 border-sky-100",
    slate: "bg-slate-100 text-slate-800 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
  }[accent];

  return (
    <div className="metric-card">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        <div className={`h-2.5 w-2.5 rounded-full border ${accentClass}`} />
      </div>
      <div className="metric-value">{value}</div>
      {link && (
        <Link to={link} className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:text-sky-600">
          Manage wallet
        </Link>
      )}
    </div>
  );
}

function statusClass(status: Credential["status"]) {
  if (status === "active") {
    return "status-active";
  }
  if (status === "expired") {
    return "status-warning";
  }
  return "status-muted";
}
