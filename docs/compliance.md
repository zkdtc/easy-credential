# Compliance plan (phased)

## v1 — US-first, light SaaS compliance
- Standard ToS, privacy policy, cookies policy, sub-processors list.
- Cookie consent banner (essential + analytics), respect DNT / GPC.
- GDPR-style data export & delete endpoints (good practice even US-only).
- Stripe handles PCI; we never see raw card data.
- Audit log (`audit_events`) populated for issuance, revocation, wallet ops,
  signing key changes.
- Public credential pages strip third-party trackers (clean for LinkedIn preview).
- Recipient email hashed in signed payload (PII-safe).
- PII delete preserves *fact* of issuance with redacted name (signature stays
  verifiable for authenticity).

## v2 — EU/GDPR
- EU data residency (eu-west DB + S3 buckets); `orgs.data_region` drives routing.
- DPA template; regional Stripe accounts.
- Data export/delete SLAs: 30 days.
- Sub-processor change notifications.

## v3 — Enterprise
- SAML/OIDC SSO for issuer orgs (auth_provider enum already includes `saml|oidc`).
- SCIM provisioning.
- Role-based permissions hardening.
- Audit log export (CSV / JSON / SIEM integration).
- Begin SOC 2 Type I path.

## Opportunistic — Education vertical
- LTI 1.3 deep linking for LMS embed (Canvas, Moodle, Blackboard).
- FERPA-aware mode for K-12 / higher-ed (US): minimum-PII mode, parental consent flag.
- OB3-compatible JSON-LD export available in v1 (see signing-and-verification.md).

## Legal pages to ship in v1
- `/legal/terms`
- `/legal/privacy`
- `/legal/cookies`
- `/legal/dpa` (placeholder → "contact us"; live template in v2)
- `/legal/subprocessors` (Stripe, AWS, OpenAI, Cloudflare, Resend/SES)
