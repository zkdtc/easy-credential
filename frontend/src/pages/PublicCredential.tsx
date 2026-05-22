import { useParams } from "react-router-dom";
import { ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type PublicCredentialData = {
  slug: string;
  credential_name: string;
  description: string | null;
  recipient_name: string;
  issuer: {
    name: string;
    website: string | null;
    logo_url: string | null;
    verified: boolean;
  };
  skills: string[];
  requirements: string | null;
  image_url: string | null;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  status: "active" | "revoked" | "expired";
  public_url: string;
  export_url: string;
  qr_url: string;
  add_to_linkedin_url: string;
  signing_key_id: string;
};

type VerifyResult = {
  valid: boolean;
  signature_valid: boolean;
  revoked: boolean;
  expired: boolean;
  issuer_verified: boolean;
  key_id: string | null;
  result: string;
};

export default function PublicCredential() {
  const { slug } = useParams<{ slug: string }>();
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const credential = useQuery({
    queryKey: ["public-credential", slug],
    queryFn: () => api<PublicCredentialData>(`/api/public/credentials/${slug}`),
    enabled: Boolean(slug),
    retry: false,
  });

  async function verify() {
    if (!slug) return;
    setVerifyError(null);
    setVerifyResult(null);
    try {
      setVerifyResult(
        await api<VerifyResult>(`/api/public/credentials/${slug}/verify`)
      );
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Unable to verify.");
    }
  }

  if (credential.isLoading) {
    return (
      <div className="min-h-screen px-4 py-16">
        <div className="card mx-auto max-w-2xl text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!credential.data) {
    return (
      <div className="min-h-screen px-4 py-16">
        <div className="card mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Credential not found</h1>
        </div>
      </div>
    );
  }

  const data = credential.data;

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="brand-mark">EC</div>
            <div>
              <div className="text-sm font-semibold text-slate-950">easy-credential</div>
              <div className="text-xs text-slate-500">Public credential</div>
            </div>
          </div>
          <span className={statusClass(data.status)}>{data.status}</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="grid gap-8 p-8 md:grid-cols-[220px_1fr] md:p-10">
            <div className="badge-disc h-48 w-48">
            {data.image_url ? (
              <img src={data.image_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              data.credential_name
            )}
            </div>
            <div>
              <p className="eyebrow">W3C VC / Open Badges 3.0</p>
              <h1 className="mt-2 text-4xl font-semibold leading-tight text-slate-950">
                {data.credential_name}
              </h1>
              {data.description && (
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  {data.description}
                </p>
              )}
              <dl className="mt-8 grid gap-5 text-sm md:grid-cols-2">
                <Field label="Issued to">{data.recipient_name}</Field>
                <Field label="Issued by">
                  {data.issuer.website ? (
                    <a className="font-semibold text-sky-700" href={data.issuer.website} target="_blank" rel="noreferrer">
                      {data.issuer.name}
                    </a>
                  ) : (
                    data.issuer.name
                  )}
                </Field>
                <Field label="Issued on">{new Date(data.issued_at).toLocaleDateString()}</Field>
                <Field label="Expires">
                  {data.expires_at ? new Date(data.expires_at).toLocaleDateString() : "No expiration"}
                </Field>
              </dl>
            </div>
          </div>

          {(data.skills.length > 0 || data.requirements) && (
            <div className="space-y-6 border-t border-slate-200 bg-slate-50/70 p-8 md:p-10">
              {data.requirements && (
                <div>
                  <h2 className="font-semibold text-slate-950">Requirements</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{data.requirements}</p>
                </div>
              )}
              {data.skills.length > 0 && (
                <div>
                  <h2 className="font-semibold text-slate-950">Skills</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.skills.map((skill) => (
                      <span key={skill} className="status-muted">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 border-t border-slate-200 p-8 md:p-10">
            <a className="btn" href={data.add_to_linkedin_url} target="_blank" rel="noreferrer">
              Add to LinkedIn
            </a>
            <button className="btn-secondary" onClick={verify}>Verify</button>
            <a className="btn-secondary" href={data.qr_url} target="_blank" rel="noreferrer">
              QR code
            </a>
            <a className="btn-secondary" href={data.export_url}>
              Download VC JSON
            </a>
          </div>

          {(verifyResult || verifyError) && (
            <div className="px-8 pb-8 md:px-10 md:pb-10">
              {verifyError && <div className="alert-error">{verifyError}</div>}
              {verifyResult && (
                <div className={verifyResult.valid ? "alert-success" : "alert-error"}>
                  Signature {verifyResult.signature_valid ? "matches" : "does not match"}.
                  Result: {verifyResult.result}. Key: {verifyResult.key_id ?? "unknown"}.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{children}</dd>
    </div>
  );
}

function statusClass(status: PublicCredentialData["status"]) {
  if (status === "active") {
    return "status-active";
  }
  if (status === "expired") {
    return "status-warning";
  }
  return "status-muted";
}
