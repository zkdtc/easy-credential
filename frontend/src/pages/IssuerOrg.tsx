import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Org, useAuth } from "@/lib/auth";

type OrgResponse = Org;

export default function IssuerOrg() {
  const { me, loading, refetch } = useAuth();
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const selectedOrg = useMemo(
    () => me?.orgs.find((org) => org.id === selectedOrgId) ?? null,
    [me?.orgs, selectedOrgId]
  );
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!me) return;
    const fallbackOrgId =
      me.orgs.find((org) => org.id === me.default_org_id)?.id ?? me.orgs[0]?.id ?? "";
    const nextOrgId = me.orgs.some((org) => org.id === selectedOrgId)
      ? selectedOrgId
      : fallbackOrgId;
    if (nextOrgId !== selectedOrgId) {
      setSelectedOrgId(nextOrgId);
    }
  }, [me, selectedOrgId]);

  useEffect(() => {
    if (!selectedOrg) {
      setName("");
      setWebsite("");
      setLogoUrl("");
      return;
    }
    setName(selectedOrg.name);
    setWebsite(selectedOrg.website ?? "");
    setLogoUrl(selectedOrg.logo_url ?? "");
  }, [selectedOrg]);

  async function saveOrg(e: FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await api<OrgResponse>(`/orgs/${selectedOrg.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          website: website.trim() || null,
          logo_url: logoUrl.trim() || null,
        }),
      });
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["credentials", updated.id] }),
      ]);
      setMessage(`${updated.name} is ready as an issuing organization.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save issuer organization.");
    } finally {
      setSaving(false);
    }
  }

  async function createOrg(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    setError(null);
    try {
      const created = await api<OrgResponse>("/orgs", {
        method: "POST",
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      setNewOrgName("");
      setSelectedOrgId(created.id);
      await refetch();
      setMessage(`${created.name} was created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create organization.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!me) {
    return (
      <div className="card mx-auto max-w-xl space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Issuer organization</h1>
        <Link to="/login" className="btn">Sign in</Link>
      </div>
    );
  }

  const canEdit = selectedOrg?.role === "owner" || selectedOrg?.role === "admin";

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Issuer setup</p>
          <h1 className="page-title">Issuing organization</h1>
          <p className="page-subtitle">
            This identity appears on public credential pages, LinkedIn links,
            and W3C VC / Open Badges exports.
          </p>
        </div>
        <Link to="/issue" className="btn">Issue credential</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="panel">
          <div className="panel-header">
            <h2 className="font-semibold text-slate-950">Issuer profile</h2>
            <p className="mt-1 text-sm text-slate-500">
              Name, website, and logo for the active issuer.
            </p>
          </div>
          <form onSubmit={saveOrg} className="panel-body space-y-5">
            {me.orgs.length > 1 && (
              <label className="block">
                <span className="label">Organization</span>
                <select
                  className="input mt-1"
                  value={selectedOrgId}
                  onChange={(event) => setSelectedOrgId(event.target.value)}
                >
                  {me.orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="label">Organization name</span>
                <input
                  className="input mt-1"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canEdit}
                  required
                />
              </label>
              <label className="block">
                <span className="label">Website</span>
                <input
                  className="input mt-1"
                  type="url"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  disabled={!canEdit}
                  placeholder="https://example.edu"
                />
              </label>
              <label className="block">
                <span className="label">Logo URL</span>
                <input
                  className="input mt-1"
                  type="url"
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  disabled={!canEdit}
                  placeholder="https://example.edu/logo.png"
                />
              </label>
            </div>

            {selectedOrg && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="text-xs font-semibold uppercase text-slate-500">Issuer slug</div>
                <div className="mt-1 font-mono text-slate-700">{selectedOrg.slug}</div>
              </div>
            )}

            {!canEdit && selectedOrg && (
              <div className="alert-error">
                Your role on this organization is {selectedOrg.role}. Ask an owner or admin
                to update issuer details.
              </div>
            )}
            {error && <div className="alert-error">{error}</div>}
            {message && <div className="alert-success">{message}</div>}
            <button className="btn" disabled={!canEdit || saving || !selectedOrg}>
              {saving ? "Saving..." : "Save issuer profile"}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="credential-preview">
            <p className="eyebrow">Preview</p>
            <div className="mt-5 flex items-center gap-4">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-slate-200 bg-white object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-950 text-lg font-black text-white">
                  {(name || "Org")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-slate-950">
                  {name || "Organization name"}
                </h2>
                {website ? (
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm font-semibold text-sky-700"
                  >
                    {website}
                  </a>
                ) : (
                  <div className="mt-1 text-sm text-slate-500">Website not set</div>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className={selectedOrg?.verified ? "status-active" : "status-muted"}>
                {selectedOrg?.verified ? "verified" : "unverified"}
              </span>
              {selectedOrg && <span className="status-muted">{selectedOrg.role}</span>}
            </div>
          </div>

          <form onSubmit={createOrg} className="panel p-5">
            <h2 className="font-semibold text-slate-950">Create another org</h2>
            <label className="mt-4 block">
              <span className="label">Organization name</span>
              <input
                className="input mt-1"
                value={newOrgName}
                onChange={(event) => setNewOrgName(event.target.value)}
                required
              />
            </label>
            <button className="btn-secondary mt-4 w-full" disabled={creating}>
              {creating ? "Creating..." : "Create organization"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
