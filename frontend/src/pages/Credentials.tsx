import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Credential = {
  id: string;
  public_slug: string;
  credential_name: string;
  recipient_name: string;
  recipient_email: string;
  issuer_name: string;
  status: "active" | "revoked" | "expired";
  issued_at: string;
  public_url: string;
  export_url: string;
  add_to_linkedin_url: string;
};

export default function Credentials() {
  const { me, loading } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "revoked" | "expired">("all");
  const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
  const orgId = defaultOrg?.id;
  const params = new URLSearchParams();
  if (orgId) params.set("org_id", orgId);
  if (q.trim()) params.set("q", q.trim());
  if (status !== "all") params.set("status", status);

  const credentials = useQuery({
    queryKey: ["credentials", orgId, q, status],
    queryFn: () => api<Credential[]>(`/credentials?${params.toString()}`),
    enabled: Boolean(orgId),
  });

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!me) {
    return (
      <div className="card max-w-xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-semibold">Credentials</h1>
        <Link to="/login" className="btn">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Credential registry</p>
          <h1 className="page-title">Issued credentials</h1>
          {defaultOrg && (
              <p className="page-subtitle">
                Browse, search, and download signed W3C VC / Open Badges 3.0
                files for {defaultOrg.name}.
              </p>
          )}
        </div>
        <Link to="/issue" className="btn">Issue credential</Link>
      </div>

      <div className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <input
          className="input md:max-w-sm"
          placeholder="Search recipient, email, credential"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "revoked", "expired"] as const).map((item) => (
            <button
              key={item}
              className={status === item ? "btn" : "btn-secondary"}
              onClick={() => setStatus(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden">
        {(credentials.data ?? []).length === 0 ? (
          <div className="px-6 py-10 text-sm text-slate-600">
            No credentials match this view.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Credential</th>
                <th className="px-6 py-3 font-semibold">Recipient</th>
                <th className="px-6 py-3 font-semibold">Issued</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(credentials.data ?? []).map((credential) => (
                <tr key={credential.id} className="bg-white transition hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-950">{credential.credential_name}</div>
                    <div className="font-mono text-xs text-slate-400">
                      {credential.public_slug}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{credential.recipient_name}</div>
                    <div className="text-xs text-slate-500">{credential.recipient_email}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(credential.issued_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={statusClass(credential.status)}>
                      {credential.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-3">
                      <a
                        className="font-semibold text-sky-700 hover:text-sky-600"
                        href={credential.public_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                      <a
                        className="font-semibold text-slate-700 hover:text-slate-950"
                        href={credential.export_url}
                      >
                        VC JSON
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
