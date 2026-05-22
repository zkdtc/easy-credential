# AI design module

Two modes available in the editor:

## 1. Image generation
- User describes badge → OpenAI Images / Stable Diffusion (Replicate).
- Output PNG/SVG saved to S3, exposed via `cdn.easylearning.ai`.
- Used as background or central element on the canvas.

Current MVP endpoint:

- `POST /assets/badges/upload` accepts PNG/JPEG/WebP artwork and returns an
  `image_url` usable on credential issuance.
- `POST /ai/design/image {org_id, prompt, style}` returns an `image_url`.
  When `OPENAI_API_KEY` is configured, the backend calls OpenAI Images with
  `gpt-image-1`. In development without a provider key, it creates a local SVG
  badge so the end-to-end issuer workflow still works.

### Quota
- **10 free generations / org / month.**
- Overage: **$0.20 / image** deducted from wallet.
- Failed generations don't count.
- Regenerations count.
- Safety cap: 500 paid/month/org by default.

### Pipeline
1. `POST /ai/design/image {prompt, style}` → row in `ai_jobs (queued)`.
2. Worker checks moderation, calls provider, uploads result.
3. On success: update `ai_jobs (succeeded, output_url, cost_cents)`,
   bump `ai_quotas.images_used`, write `wallet_transactions` if billed.
4. Client polls `GET /ai/jobs/{id}`.

## 2. Template AI-tune (LLM styling)
- User picks template + provides `brand_color`, `name`, `vibe`.
- LLM returns a **JSON Schema-validated patch** to `design_json` (color swaps,
  font, layout tweaks). Never freeform drawing.
- Output saved as a new `templates` row owned by the org.

### Quota
- Free, soft-capped at 200/day/org to block runaway loops.

## Safety
- Prompts run through provider moderation API.
- Max 5 in-flight image jobs per org.
- Hard monthly $ ceiling per org (default $100 paid AI / month).
