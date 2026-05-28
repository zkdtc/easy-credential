import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, apiForm, fmtUSD } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type BadgeAssetResponse = {
  image_url: string;
  source: "upload" | "openai" | "local";
};

const DEFAULT_EXPIRES_AT = "2029-12-31";

type WalletSummary = { balance_cents: number };

type ParsedRecipient = {
  recipient_name: string;
  recipient_email: string;
  recipient_linkedin_url?: string;
  _rowError?: string;
};

type BatchResultRow = {
  index: number;
  recipient_name: string;
  recipient_email: string;
  status: "ok" | "skipped" | "error";
  error?: string;
  credential?: {
    id: string;
    public_slug: string;
    public_url: string;
    export_url: string;
    add_to_linkedin_url: string;
  };
};

type BatchResponse = {
  org_id: string;
  total_requested: number;
  issued_count: number;
  skipped_count: number;
  amount_charged_cents: number;
  wallet_balance_cents: number;
  results: BatchResultRow[];
};

const PRICE_CENTS = 399;
const CSV_TEMPLATE =
  "recipient_name,recipient_email,recipient_linkedin_url\n" +
  "Alice Example,alice@example.com,\n" +
  "Bob Sample,bob@example.com,https://www.linkedin.com/in/bob\n";

export default function BatchIssue() {
  const { me, loading } = useAuth();
  const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
  const orgId = defaultOrg?.id;

  const [credentialName, setCredentialName] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [skills, setSkills] = useState("");
  const [expiresAt, setExpiresAt] = useState(DEFAULT_EXPIRES_AT);
  const [imageUrl, setImageUrl] = useState("");

  // Badge image upload / generate state (shared across all batch recipients)
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [generatingBadge, setGeneratingBadge] = useState(false);
  const [badgePrompt, setBadgePrompt] = useState("");
  const [badgeStyle, setBadgeStyle] = useState("modern");
  const [badgeMessage, setBadgeMessage] = useState<string | null>(null);
  const [badgeError, setBadgeError] = useState<string | null>(null);

  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResponse | null>(null);

  const wallet = useQuery({
    queryKey: ["wallet", orgId],
    queryFn: () => api<WalletSummary>(`/orgs/${orgId}/wallet`),
    enabled: Boolean(orgId),
  });

  const recipients = useMemo<ParsedRecipient[]>(() => parseCsv(csvText), [csvText]);
  const validCount = recipients.filter((r) => !r._rowError).length;
  const totalCost = validCount * PRICE_CENTS;
  const fundsOk =
    wallet.data !== undefined ? wallet.data.balance_cents >= totalCost : true;

  function onCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function downloadTemplate() {
    downloadBlob(CSV_TEMPLATE, "batch-recipients-template.csv", "text/csv");
  }

  async function uploadBadge(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !orgId) return;
    setBadgeMessage(null);
    setBadgeError(null);
    setUploadingBadge(true);
    try {
      const form = new FormData();
      form.append("org_id", orgId);
      form.append("file", file);
      const uploaded = await apiForm<BadgeAssetResponse>(
        "/assets/badges/upload",
        form
      );
      setImageUrl(uploaded.image_url);
      setBadgeMessage("Badge image uploaded.");
    } catch (err) {
      setBadgeError(
        err instanceof Error ? err.message : "Unable to upload badge image."
      );
    } finally {
      setUploadingBadge(false);
      // Reset the file input so re-selecting the same file re-fires onChange.
      event.target.value = "";
    }
  }

  async function generateBadge() {
    if (!orgId) return;
    if (!badgePrompt.trim()) {
      setBadgeError("Enter a short prompt describing the badge artwork.");
      return;
    }
    setBadgeMessage(null);
    setBadgeError(null);
    setGeneratingBadge(true);
    try {
      const generated = await api<BadgeAssetResponse>("/ai/design/image", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          prompt: badgePrompt.trim(),
          style: badgeStyle,
        }),
      });
      setImageUrl(generated.image_url);
      setBadgeMessage(
        generated.source === "openai"
          ? "Badge generated with AI."
          : "Badge generated locally (no OpenAI key configured)."
      );
    } catch (err) {
      setBadgeError(
        err instanceof Error ? err.message : "Unable to generate badge image."
      );
    } finally {
      setGeneratingBadge(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const validRecipients = recipients
        .filter((r) => !r._rowError)
        .map(({ _rowError, ...rest }) => rest);
      if (validRecipients.length === 0) {
        throw new Error("No valid recipients found in the CSV.");
      }
      const body = {
        org_id: orgId,
        credential_name: credentialName,
        description: description || undefined,
        requirements: requirements || undefined,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        image_url: imageUrl || undefined,
        recipients: validRecipients,
      };
      const response = await api<BatchResponse>("/credentials/batch", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch issuance failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function downloadResults() {
    if (!result) return;
    const rows = result.results.map((r) => ({
      recipient_name: r.recipient_name,
      recipient_email: r.recipient_email,
      status: r.status,
      credential_slug: r.credential?.public_slug ?? "",
      public_url: r.credential?.public_url ?? "",
      export_url: r.credential?.export_url ?? "",
      add_to_linkedin_url: r.credential?.add_to_linkedin_url ?? "",
      error: r.error ?? "",
    }));
    const headers = Object.keys(rows[0] ?? {
      recipient_name: "",
      recipient_email: "",
      status: "",
      credential_slug: "",
      public_url: "",
      export_url: "",
      add_to_linkedin_url: "",
      error: "",
    });
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => csvEscape((row as Record<string, string>)[h])).join(",")
      ),
    ].join("\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadBlob(csv, `batch-${stamp}.csv`, "text/csv");
  }

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!me) {
    return (
      <div className="card max-w-xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-semibold">Batch issuance</h1>
        <Link to="/login" className="btn">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Issue · Batch</p>
          <h1 className="page-title">Issue the same credential to many recipients</h1>
          {defaultOrg && (
            <p className="page-subtitle">
              {defaultOrg.name} will be shown as the issuing organization for every credential.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/issue" className="btn-secondary">Single issue</Link>
          <Link to="/wallet" className="btn-soft">
            {wallet.data ? fmtUSD(wallet.data.balance_cents) : "Wallet"}
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <form onSubmit={submit} className="panel">
          <div className="panel-header">
            <h2 className="font-semibold text-slate-950">Credential template</h2>
            <p className="mt-1 text-sm text-slate-500">
              These fields are shared across every recipient.
            </p>
          </div>
          <div className="panel-body space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="label">Credential name</span>
                <input
                  className="input mt-1"
                  value={credentialName}
                  onChange={(e) => setCredentialName(e.target.value)}
                  required
                />
              </label>
              <label className="block md:col-span-2">
                <span className="label">Description</span>
                <textarea
                  className="input mt-1 min-h-24"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="label">Requirements</span>
                <textarea
                  className="input mt-1 min-h-20"
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="label">Skills (comma-separated)</span>
                <input
                  className="input mt-1"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="label">Expires</span>
                <input
                  className="input mt-1"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-950">Badge image</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Upload artwork, generate one with AI, or paste an image URL —
                    used for every credential in the batch.
                  </p>
                </div>
                <div className="flex gap-2">
                  <label className="btn-secondary cursor-pointer">
                    {uploadingBadge ? "Uploading..." : "Upload"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={uploadBadge}
                      disabled={uploadingBadge || !orgId}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px_auto]">
                <input
                  className="input"
                  value={badgePrompt}
                  onChange={(e) => setBadgePrompt(e.target.value)}
                  placeholder="Describe the badge (e.g. 'cloud certification with gold ring')"
                />
                <input
                  className="input"
                  value={badgeStyle}
                  onChange={(e) => setBadgeStyle(e.target.value)}
                  placeholder="style"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={generateBadge}
                  disabled={generatingBadge || !orgId}
                >
                  {generatingBadge ? "Generating..." : "Generate with AI"}
                </button>
              </div>

              <label className="mt-4 block">
                <span className="label">Or paste an image URL</span>
                <input
                  className="input mt-1"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>

              {(badgeMessage || badgeError) && (
                <div className="mt-3">
                  {badgeError && <div className="alert-error">{badgeError}</div>}
                  {badgeMessage && !badgeError && (
                    <div className="alert-success">{badgeMessage}</div>
                  )}
                </div>
              )}

              {imageUrl && (
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-white">
                    <img
                      src={imageUrl}
                      alt="badge preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-500 underline"
                    onClick={() => {
                      setImageUrl("");
                      setBadgeMessage(null);
                    }}
                  >
                    Remove image
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-950">Recipients (CSV)</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Columns: <code>recipient_name</code>, <code>recipient_email</code>,
                    optional <code>recipient_linkedin_url</code>.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={downloadTemplate}
                  >
                    Download template
                  </button>
                  <label className="btn-secondary cursor-pointer">
                    Upload CSV
                    <input
                      className="sr-only"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={onCsvFile}
                    />
                  </label>
                </div>
              </div>
              {csvFileName && (
                <div className="mt-3 text-xs text-slate-500">
                  Loaded: <span className="font-medium">{csvFileName}</span>
                </div>
              )}
              <textarea
                className="input mt-3 min-h-32 font-mono text-xs"
                placeholder="recipient_name,recipient_email,recipient_linkedin_url"
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setCsvFileName(null);
                }}
              />
              {recipients.length > 0 && (
                <RecipientPreview recipients={recipients} />
              )}
            </div>

            {error && <div className="alert-error">{error}</div>}
            {!fundsOk && validCount > 0 && (
              <div className="alert-error">
                Wallet has {wallet.data ? fmtUSD(wallet.data.balance_cents) : "—"} but
                this batch will cost {fmtUSD(totalCost)}.{" "}
                <Link to="/wallet" className="underline">Add funds</Link>.
              </div>
            )}

            {result && (
              <div className="alert-success space-y-2">
                <div>
                  Issued {result.issued_count} of {result.total_requested} credentials.{" "}
                  Charged {fmtUSD(result.amount_charged_cents)}. Wallet balance is{" "}
                  {fmtUSD(result.wallet_balance_cents)}.
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={downloadResults}
                >
                  Download results CSV
                </button>
              </div>
            )}

            <button
              className="btn"
              disabled={
                submitting ||
                validCount === 0 ||
                !fundsOk ||
                !credentialName.trim()
              }
            >
              {submitting
                ? "Issuing..."
                : `Issue ${validCount} credential${validCount === 1 ? "" : "s"} for ${fmtUSD(totalCost)}`}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="eyebrow">Batch summary</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <SummaryStat label="Recipients" value={String(validCount)} />
              <SummaryStat
                label="Invalid rows"
                value={String(recipients.length - validCount)}
              />
              <SummaryStat label="Price each" value={fmtUSD(PRICE_CENTS)} />
              <SummaryStat label="Total cost" value={fmtUSD(totalCost)} />
            </div>
          </div>
          <div className="panel p-5">
            <div className="text-sm font-medium text-slate-500">Wallet after batch</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {wallet.data
                ? fmtUSD(Math.max(0, wallet.data.balance_cents - totalCost))
                : "Loading"}
            </div>
          </div>
          {result && (
            <div className="panel p-5">
              <p className="eyebrow">Results</p>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 text-xs">
                {result.results.map((r) => (
                  <div
                    key={r.index}
                    className={
                      "rounded-md border px-3 py-2 " +
                      (r.status === "ok"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-amber-50 text-amber-900")
                    }
                  >
                    <div className="font-medium">
                      {r.recipient_name} · {r.recipient_email}
                    </div>
                    <div className="mt-0.5">
                      {r.status === "ok" && r.credential ? (
                        <a
                          className="underline"
                          href={r.credential.public_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.credential.public_slug}
                        </a>
                      ) : (
                        <span>{r.status}: {r.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function RecipientPreview({ recipients }: { recipients: ParsedRecipient[] }) {
  const valid = recipients.filter((r) => !r._rowError);
  const invalid = recipients.filter((r) => r._rowError);
  return (
    <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">LinkedIn</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {valid.map((r, i) => (
            <tr key={`v-${i}`} className="border-t border-slate-100">
              <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
              <td className="px-3 py-1.5">{r.recipient_name}</td>
              <td className="px-3 py-1.5">{r.recipient_email}</td>
              <td className="px-3 py-1.5 truncate max-w-[12rem]">
                {r.recipient_linkedin_url ?? ""}
              </td>
              <td className="px-3 py-1.5 text-emerald-700">ok</td>
            </tr>
          ))}
          {invalid.map((r, i) => (
            <tr key={`i-${i}`} className="border-t border-slate-100 bg-amber-50">
              <td className="px-3 py-1.5 text-slate-400">—</td>
              <td className="px-3 py-1.5">{r.recipient_name}</td>
              <td className="px-3 py-1.5">{r.recipient_email}</td>
              <td className="px-3 py-1.5">{r.recipient_linkedin_url ?? ""}</td>
              <td className="px-3 py-1.5 text-amber-700">{r._rowError}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV helpers (small, self-contained — avoids adding a parsing dependency)
// ---------------------------------------------------------------------------

function parseCsv(text: string): ParsedRecipient[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  // Detect header row by looking for "email"
  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("email") && header.includes("name");
  const rows = hasHeader ? lines.slice(1) : lines;
  const headerCols = hasHeader
    ? splitCsvLine(lines[0]).map((c) => c.trim().toLowerCase())
    : ["recipient_name", "recipient_email", "recipient_linkedin_url"];
  const nameIdx = headerCols.findIndex((c) => c.includes("name"));
  const emailIdx = headerCols.findIndex((c) => c.includes("email"));
  const liIdx = headerCols.findIndex((c) => c.includes("linkedin"));

  const out: ParsedRecipient[] = [];
  for (const line of rows) {
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    const name = (cols[nameIdx >= 0 ? nameIdx : 0] ?? "").trim();
    const email = (cols[emailIdx >= 0 ? emailIdx : 1] ?? "").trim();
    const linkedin = liIdx >= 0 ? (cols[liIdx] ?? "").trim() : "";
    const row: ParsedRecipient = {
      recipient_name: name,
      recipient_email: email,
      recipient_linkedin_url: linkedin || undefined,
    };
    if (!name) row._rowError = "missing name";
    else if (!email) row._rowError = "missing email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) row._rowError = "invalid email";
    out.push(row);
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV: supports double-quoted fields with embedded commas.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(value: string): string {
  if (value == null) return "";
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
