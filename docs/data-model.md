# Data model

> All money columns are stored as integer **cents** (`bigint`). All timestamps
> are `timestamptz`. UUIDs (v7 preferred for index locality) are used as PKs.

## users
```
id uuid pk
email citext unique
name text
avatar_url text
auth_provider enum(google,facebook,apple,saml,oidc)  -- saml/oidc reserved for v3
provider_subject text                                 -- OAuth `sub`
default_org_id uuid fk -> orgs.id (nullable)
created_at, updated_at timestamptz
```

## orgs
```
id uuid pk
name text
slug text unique
logo_url text
website text
verified bool default false
data_region text default 'us-east-1'                 -- multi-region ready
feature_flags jsonb default '{}'                      -- e.g. {"open_badges_3":{"enabled":false}}
sso_config jsonb default '{}'                         -- v3 placeholder
ai_perks_json jsonb default '{}'                      -- per-org AI quota overrides
created_at, updated_at
```

## org_members
```
org_id uuid fk
user_id uuid fk
role enum(owner, admin, issuer)
created_at
pk(org_id, user_id)
```

## wallets
```
id uuid pk
org_id uuid fk unique
balance_cents bigint not null default 0
currency char(3) default 'USD'
updated_at
```

## wallet_transactions
```
id uuid pk
wallet_id uuid fk
type enum(recharge, bonus, issue_charge, ai_generation, refund, adjustment)
amount_cents bigint                       -- signed
balance_after_cents bigint
stripe_payment_intent_id text unique nullable
credential_id uuid fk nullable
ai_job_id uuid fk nullable
note text
created_at
```

## pricing_rules
```
id uuid pk
name text                                 -- 'tier_100', 'tier_300', 'tier_500'
min_amount_cents bigint
max_amount_cents bigint nullable
bonus_bps int                             -- 1000 = 10%, 1500 = 15%, 2000 = 20%
active bool
effective_from timestamptz
effective_to timestamptz nullable
```

## templates
```
id uuid pk
owner_org_id uuid fk nullable             -- null = global template
name text
category text
design_json jsonb                         -- Konva scene graph
preview_url text
is_ai_generated bool default false
created_at
```

## credentials
```
id uuid pk
public_slug text unique                   -- 12-char base62 (~71 bits entropy)
org_id uuid fk
issued_by_user_id uuid fk
recipient_user_id uuid fk nullable        -- v2 'claim' link
template_id uuid fk nullable
design_json jsonb                         -- immutable snapshot
image_url text
credential_name text
description text
recipient_name text
recipient_email citext
recipient_linkedin_url text nullable
requirements text
skills text[]
issued_at timestamptz
expires_at timestamptz nullable
revoked_at timestamptz nullable
revoke_reason text nullable
signature text                            -- Ed25519 over canonical payload
signing_key_id uuid fk -> signing_keys.id
created_at
```

## signing_keys
```
id uuid pk
public_key text                           -- PEM
private_key_pem text                      -- MVP dev scaffold; replace with KMS-wrapped key material
algorithm text default 'Ed25519'
active bool
created_at
retired_at timestamptz nullable
```

## ai_jobs
```
id uuid pk
user_id uuid fk
org_id uuid fk
type enum(image, template_tune)
prompt text
status enum(queued, running, succeeded, failed)
output_url text
cost_cents int default 0
quota_consumed bool default false
billed bool default false
created_at, completed_at
```

## ai_quotas
```
id uuid pk
org_id uuid fk
month date                                -- first-of-month
images_used int default 0
template_tunes_used int default 0
unique(org_id, month)
```

## verifications (audit of public lookups)
```
id uuid pk
credential_id uuid fk
verifier_ip inet
verifier_ua text
result enum(valid, expired, revoked, signature_invalid, not_found)
created_at
```

## audit_events
```
id uuid pk
org_id uuid fk
actor_user_id uuid fk nullable
action text                               -- e.g. 'credential.issue', 'wallet.recharge'
target_type text
target_id text
metadata jsonb
ip inet
user_agent text
created_at
```

## feature_interest (Notify-me captures)
```
id uuid pk
org_id uuid fk
feature_key text                          -- e.g. 'open_badges_3'
captured_at timestamptz
unique(org_id, feature_key)
```

## ERD highlights

- `orgs 1—* wallets (1)` — exactly one wallet per org.
- `orgs 1—* credentials` — credentials always belong to an org.
- `credentials *—1 signing_keys` — historical credentials remain verifiable after key rotation.
- `wallets 1—* wallet_transactions` — append-only ledger; balance is recomputable.
