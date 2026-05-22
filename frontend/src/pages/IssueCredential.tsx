import { ChangeEvent, FormEvent, ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiForm, fmtUSD } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type IssuedCredential = {
  id: string;
  credential_name: string;
  recipient_name: string;
  public_url: string;
  export_url: string;
  add_to_linkedin_url: string;
};

type IssueResponse = {
  credential: IssuedCredential;
  wallet_balance_cents: number;
};

type WalletSummary = { balance_cents: number };
type BadgeAssetResponse = {
  image_url: string;
  source: "upload" | "openai" | "local";
  content_type: string;
};

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
  const [badgeMessage, setBadgeMessage] = useState<string | null>(null);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [generatingBadge, setGeneratingBadge] = useState(false);
  const [result, setResult] = useState<IssueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const defaultOrg = me?.orgs.find((o) => o.id === me.default_org_id) ?? me?.orgs[0];
  const orgId = defaultOrg?.id;

  const wallet = useQuery({
    queryKey: ["wallet", orgId],
    queryFn: () => api<WalletSummary>(`/orgs/${orgId}/wallet`),
    enabled: Boolean(orgId),
  });

  async function uploadBadge(event: ChangeEvent<HTMLInputElement>) {
    if (!defaultOrg) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingBadge(true);
    setBadgeError(null);
    setBadgeMessage(null);
    try {
      const form = new FormData();
      form.set("org_id", defaultOrg.id);
      form.set("file", file);
      const uploaded = await apiForm<BadgeAssetResponse>("/assets/badges/upload", form);
      setImageUrl(uploaded.image_url);
      setBadgeMessage("Badge image uploaded.");
    } catch (err) {
      setBadgeError(err instanceof Error ? err.message : "Unable to upload badge image.");
    } finally {
      setUploadingBadge(false);
      event.target.value = "";
    }
  }

  async function generateBadge() {
    if (!defaultOrg) return;
    setGeneratingBadge(true);
    setBadgeError(null);
    setBadgeMessage(null);
    try {
      const generated = await api<BadgeAssetResponse>("/ai/design/image", {
        method: "POST",
        body: JSON.stringify({
          org_id: defaultOrg.id,
          prompt: badgePrompt,
          style: badgeStyle,
        }),
      });
      setImageUrl(generated.image_url);
      setBadgeMessage(
        generated.source === "openai"
          ? "AI badge generated."
          : "Badge generated locally for development."
      );
    } catch (err) {
      setBadgeError(err instanceof Error ? err.message : "Unable to generate badge image.");
    } finally {
      setGeneratingBadge(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!defaultOrg) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const issued = await api<IssueResponse>("/credentials", {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to issue credential.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!me) {
    return (
      <div className="card max-w-xl mx-auto text-center space-y-4">
        <h1 className="text-2xl font-semibold">Issue a credential</h1>
        <Link to="/login" className="btn">Sign in</Link>
      </div>
    );
  }

  const previewSkills = skills.split(",").map((skill) => skill.trim()).filter(Boolean);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Issue</p>
          <h1 className="page-title">Create a signed credential</h1>
          {defaultOrg && (
            <p className="page-subtitle">
              {defaultOrg.name} will be shown as the issuing organization.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/org" className="btn-secondary">Issuer setup</Link>
          <Link to="/credentials" className="btn-secondary">View credentials</Link>
          <Link to="/wallet" className="btn-soft">
            {wallet.data ? fmtUSD(wallet.data.balance_cents) : "Wallet"}
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <form onSubmit={submit} className="panel">
          <div className="panel-header">
            <h2 className="font-semibold text-slate-950">Credential details</h2>
            <p className="mt-1 text-sm text-slate-500">Issuance costs $3.99 from the wallet.</p>
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
              <label className="block">
                <span className="label">Recipient name</span>
                <input
                  className="input mt-1"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="label">Recipient email</span>
                <input
                  className="input mt-1"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="label">Recipient LinkedIn URL</span>
                <input
                  className="input mt-1"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">Expires</span>
                <input
                  className="input mt-1"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
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
                <span className="label">Skills</span>
                <input
                  className="input mt-1"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                />
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-950">Badge image</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Upload artwork, generate one, or paste an image URL.
                    </p>
                  </div>
                  <label className="btn-secondary cursor-pointer">
                    {uploadingBadge ? "Uploading..." : "Upload"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={uploadBadge}
                      disabled={uploadingBadge}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
                  <label className="block">
                    <span className="label">AI prompt</span>
                    <input
                      className="input mt-1"
                      value={badgePrompt}
                      onChange={(e) => setBadgePrompt(e.target.value)}
                      placeholder="A badge for data analytics excellence"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Style</span>
                    <select
                      className="input mt-1"
                      value={badgeStyle}
                      onChange={(e) => setBadgeStyle(e.target.value)}
                    >
                      {BADGE_STYLES.map((style) => (
                        <option key={style} value={style}>
                          {style[0].toUpperCase() + style.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      className="btn w-full"
                      type="button"
                      onClick={generateBadge}
                      disabled={generatingBadge || badgePrompt.trim().length < 3}
                    >
                      {generatingBadge ? "Generating..." : "Generate"}
                    </button>
                  </div>
                </div>

                <label className="mt-4 block">
                  <span className="label">Image URL</span>
                  <input
                    className="input mt-1"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </label>
                {badgeError && <div className="alert-error mt-3">{badgeError}</div>}
                {badgeMessage && <div className="alert-success mt-3">{badgeMessage}</div>}
              </div>
            </div>

            {error && (
              <div className="alert-error">
                {error.includes("wallet.insufficient_funds") ? (
                  <>
                    Wallet balance is too low. <Link to="/wallet" className="underline">Add funds</Link>.
                  </>
                ) : (
                  error
                )}
              </div>
            )}
            {result && (
              <div className="alert-success space-y-2">
                <div>
                  Issued {result.credential.credential_name} to{" "}
                  {result.credential.recipient_name}. Wallet balance is{" "}
                  {fmtUSD(result.wallet_balance_cents)}.
                </div>
                <div className="flex flex-wrap gap-3">
                  <a className="underline" href={result.credential.public_url} target="_blank" rel="noreferrer">
                    Open public URL
                  </a>
                  <a className="underline" href={result.credential.add_to_linkedin_url} target="_blank" rel="noreferrer">
                    Add to LinkedIn
                  </a>
                  <a className="underline" href={result.credential.export_url}>
                    Download VC JSON
                  </a>
                </div>
              </div>
            )}

            <button className="btn" disabled={submitting}>
              {submitting ? "Issuing..." : "Issue for $3.99"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="credential-preview">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Preview</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {credentialName || "Credential name"}
                </h2>
              </div>
              <span className="status-active">Draft</span>
            </div>
            <div className="mt-6 flex justify-center">
              <div className="badge-disc h-36 w-36">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  credentialName || "Credential"
                )}
              </div>
            </div>
            <dl className="mt-6 space-y-4 text-sm">
              <PreviewField label="Recipient">
                {recipientName || "Recipient name"}
              </PreviewField>
              <PreviewField label="Issuer">
                {defaultOrg?.name ?? "Issuer organization"}
              </PreviewField>
              <PreviewField label="Description">
                {description || "Credential description"}
              </PreviewField>
            </dl>
            {previewSkills.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {previewSkills.slice(0, 5).map((skill) => (
                  <span key={skill} className="status-muted">{skill}</span>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-5">
            <div className="text-sm font-medium text-slate-500">Wallet after issue</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {wallet.data ? fmtUSD(Math.max(0, wallet.data.balance_cents - 399)) : "Loading"}
            </div>
          </div>

          <div className="panel p-5">
            <p className="eyebrow">Portable standard</p>
            <h3 className="mt-2 font-semibold text-slate-950">
              W3C VC / Open Badges 3.0
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Each credential exports as signed JSON-LD with a hashed recipient
              identifier, issuer proof, and public verification URL.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PreviewField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}
