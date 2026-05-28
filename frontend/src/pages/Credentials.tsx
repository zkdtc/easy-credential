import { useEffect, useMemo, useState } from "react";
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

type CredentialsPage = {
  items: Credential[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

const PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 500; // server max per request

// Same column order as the Batch results CSV, for drop-in compatibility.
const EXPORT_HEADERS = [
  "recipient_name",
  "recipient_email",
  "status",
  "credential_slug",
  "public_url",
  "export_url",
  "add_to_linkedin_url",
  "error",
] as const;

function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  return /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

export default function Credentials() {
  const { me, loading } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "revoked" | "expired">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
  const orgId = defaultOrg?.id;

  // Reset to the first page whenever the filter or org changes.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [q, status, orgId]);

  const params = new URLSearchParams();
  if (orgId) params.set("org_id", orgId);
  if (q.trim()) params.set("q", q.trim());
  if (status !== "all") params.set("status", status);
  params.set("limit", String(limit));
  params.set("offset", "0");

  const credentials = useQuery({
    queryKey: ["credentials", orgId, q, status, limit],
    queryFn: () => api<CredentialsPage>(`/credentials?${params.toString()}`),
    enabled: Boolean(orgId),
  });

  const items = credentials.data?.items ?? [];
  const total = credentials.data?.total ?? items.length;
  const hasMore = credentials.data?.has_more ?? false;

  // ---- Download all ----------------------------------------------------------
  const [exportState, setExportState] = useState<{
    status: "idle" | "fetching" | "ready" | "error";
    csv?: string;
    error?: string;
    fetched?: number;
    total?: number;
  }>({ status: "idle" });

  // Reset any prepared CSV when filters change so users never download stale data.
  useEffect(() => {
    setExportState({ status: "idle" });
  }, [q, status, orgId]);

  const exportFilename = useMemo(() => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const scope = status === "all" ? "all" : status;
    return `credentials-${scope}-${stamp}.csv`;
  }, [status]);

  const exportDataUrl = useMemo(() => {
    if (!exportState.csv) return null;
    // BOM helps Excel detect UTF-8 (names with accents/emoji).
    return (
      "data:text/csv;charset=utf-8,%EF%BB%BF" +
      encodeURIComponent(exportState.csv)
    );
  }, [exportState.csv]);

  async function downloadAll() {
    if (!orgId) return;
    setExportState({ status: "fetching", fetched: 0 });
    try {
      const all: Credential[] = [];
      let offset = 0;
      let totalRows = 0;
      // Loop until the server says there are no more pages.
      while (true) {
        const p = new URLSearchParams();
        p.set("org_id", orgId);
        if (q.trim()) p.set("q", q.trim());
        if (status !== "all") p.set("status", status);
        p.set("limit", String(EXPORT_PAGE_SIZE));
        p.set("offset", String(offset));
        const page = await api<CredentialsPage>(`/credentials?${p.toString()}`);
        all.push(...page.items);
        totalRows = page.total;
        setExportState({
          status: "fetching",
          fetched: all.length,
          total: totalRows,
        });
        if (!page.has_more || page.items.length === 0) break;
        offset += page.items.length;
        // Safety: stop if we somehow exceed a sane upper bound.
        if (all.length > 100_000) break;
      }
      const csv = [
        EXPORT_HEADERS.join(","),
        ...all.map((c) =>
          EXPORT_HEADERS.map((h) => {
            switch (h) {
              case "recipient_name":
                return csvEscape(c.recipient_name);
              case "recipient_email":
                return csvEscape(c.recipient_email);
              case "status":
                return csvEscape(c.status);
              case "credential_slug":
                return csvEscape(c.public_slug);
              case "public_url":
                return csvEscape(c.public_url);
              case "export_url":
                return csvEscape(c.export_url);
              case "add_to_linkedin_url":
                return csvEscape(c.add_to_linkedin_url);
              case "error":
                return "";
            }
          }).join(",")
        ),
      ].join("\n");
      setExportState({
        status: "ready",
        csv,
        fetched: all.length,
        total: totalRows,
      });
    } catch (err) {
      setExportState({
        status: "error",
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {exportState.status === "fetching" && (
            <span className="text-xs text-slate-500">
              Preparing CSV... {exportState.fetched ?? 0}
              {exportState.total ? ` / ${exportState.total}` : ""}
            </span>
          )}
          {exportState.status === "error" && (
            <span className="text-xs text-rose-600">{exportState.error}</span>
          )}
          {exportState.status === "ready" && exportDataUrl ? (
            <a
              className="btn-secondary inline-block"
              href={exportDataUrl}
              download={exportFilename}
              onClick={() => {
                // After the user clicks the link, let them re-fetch a fresh snapshot next time.
                setTimeout(() => setExportState({ status: "idle" }), 200);
              }}
            >
              Download {exportState.fetched ?? 0} credentials.csv
            </a>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              onClick={downloadAll}
              disabled={exportState.status === "fetching" || !orgId}
            >
              {exportState.status === "fetching"
                ? "Preparing..."
                : "Download all (CSV)"}
            </button>
          )}
          <Link to="/issue" className="btn">Issue credential</Link>
        </div>
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
        {items.length === 0 ? (
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
              {items.map((credential) => (
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
        {items.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-3 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
            <div>
              Showing{" "}
              <span className="font-semibold text-slate-800">{items.length}</span>{" "}
              of{" "}
              <span className="font-semibold text-slate-800">{total}</span>{" "}
              credentials
            </div>
            {hasMore && (
              <button
                type="button"
                className="btn-secondary"
                disabled={credentials.isFetching}
                onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, 500))}
              >
                {credentials.isFetching
                  ? "Loading..."
                  : `Load more (+${Math.min(PAGE_SIZE, total - items.length)})`}
              </button>
            )}
            {!hasMore && total > PAGE_SIZE && (
              <span>All credentials loaded.</span>
            )}
          </div>
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
