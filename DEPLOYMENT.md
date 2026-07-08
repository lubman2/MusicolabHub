# Deployment Guide — MusicCollabHub on Vercel

End-to-end walkthrough: from a fresh clone of the repo to a public preview URL
serving real traffic. Target time: **under 30 minutes** if you have payment
methods ready for the external services.

## What you'll deploy

- **Web app** — Next.js 16 on Vercel (preview + production)
- **Database** — Postgres on Neon (free tier ok for preview)
- **File storage** — AWS S3 (or any S3-compatible bucket)
- **Payments** — Stripe (test mode) + Stripe Connect for marketplace payouts
- **Email** — Mailtrap (sandbox) for previews; transactional provider for prod
- **Cron** — Vercel scheduled functions:
  - `/api/cron/expire-trials` — daily `0 3 * * *`
  - `/api/cron/purge-account-deletions` — daily `10 3 * * *`
  - `/api/cron/purge-soft-deleted` — daily `20 3 * * *`
  - `/api/cron/release-payouts` — daily `30 3 * * *`

  All cron routes share the same `Authorization: Bearer $CRON_SECRET` contract;
  `release-payouts` runs daily on Hobby — tighten its schedule (e.g.
  `0 * * * *`) on a Pro plan for closer-to-deadline auto-release.

---

## 0. Prerequisites

Install once, reuse for every deploy:

```bash
node --version    # 20.x or newer
npm --version
git --version
npm i -g vercel   # Vercel CLI
```

You'll also need accounts on:

| Service  | Why                              | Free tier? |
|----------|----------------------------------|------------|
| Vercel   | hosting                          | yes        |
| Neon     | Postgres                         | yes        |
| AWS      | S3 bucket                        | 12-month   |
| Stripe   | payments + Connect               | yes (test) |
| Mailtrap | SMTP capture (preview)           | yes        |

---

## 1. Sign-ups & external resources (~10 min)

### 1.1 Neon (Postgres)

1. https://console.neon.tech → **New Project** → name `musiccollabhub-prod`,
   region close to your Vercel region (default `fra1`).
2. From the project dashboard copy **two** connection strings:
   - **Pooled** (`-pooler.` host) → goes into Vercel `DATABASE_URL`.
   - **Direct** (no `-pooler`) → use locally for `prisma migrate deploy`.

### 1.2 AWS S3

1. https://console.aws.amazon.com/s3 → **Create bucket** → name
   `musiccollabhub-files-prod` (or your variant) → block all public access
   **on** (uploads use presigned URLs).
2. **CORS** (Permissions → CORS) — replace the placeholder with your final URL
   after step 4:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedOrigins": ["https://your-deploy.vercel.app"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```
3. **IAM user** (IAM → Users → Create) with programmatic access only.
   Attach a least-privilege policy to the bucket:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
       "Resource": [
         "arn:aws:s3:::musiccollabhub-files-prod",
         "arn:aws:s3:::musiccollabhub-files-prod/*"
       ]
     }]
   }
   ```
4. Save the access key id + secret. You'll paste them into Vercel.

### 1.3 Stripe

1. https://dashboard.stripe.com → keep **test mode** for previews.
2. **Products** → create two products:
   - `Pro` → recurring price → copy `price_…` → `STRIPE_PRO_PRICE_ID`.
   - `Team` → recurring price → copy `price_…` → `STRIPE_TEAM_PRICE_ID`.
3. **Developers → API keys** → copy `sk_test_…` and `pk_test_…`.
4. **Connect → Settings** → enable Stripe Connect (Standard accounts) for
   marketplace payouts. No keys needed beyond the standard secret key.
5. Webhook is configured **after** the first deploy in step 5.

### 1.4 Mailtrap (preview email)

1. https://mailtrap.io → create an **Email Testing** inbox.
2. Copy SMTP host / port / user / pass — these go into the SMTP_* vars.

For real production email, swap Mailtrap for Resend / Postmark / AWS SES with
a DKIM-verified sender domain.

---

## 2. Local prep (~3 min)

```bash
git clone <repo-url> musiccollabhub
cd musiccollabhub
npm install

cp .env.example .env
```

Fill in `.env` with the values from step 1 (use the **direct** Neon URL so you
can run migrations locally).

Generate the auth and cron secrets:

```bash
echo "NEXTAUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env
echo "CRON_SECRET=\"$(openssl rand -hex 32)\"" >> .env
```

Then run migrations against the cloud DB:

```bash
npx prisma migrate deploy
```

(Optional) seed demo data — **dev only, never run against prod**:

```bash
npm run db:seed
```

Sanity-check locally:

```bash
npm run build
npm run dev
# open http://localhost:3000 — landing page should render
```

---

## 3. Vercel project setup (~5 min)

```bash
vercel login
vercel link        # creates .vercel/ — pick "create new project"
```

Push every var from your `.env` into Vercel. Easiest path is the dashboard
(**Project → Settings → Environment Variables**), but the CLI works too:

```bash
# Repeat per var, scope = production / preview / development
vercel env add DATABASE_URL production
# … paste the *pooled* Neon URL when prompted

vercel env add NEXTAUTH_SECRET production
vercel env add APP_URL production              # use a placeholder, fix in §4
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_SECRET_ACCESS_KEY production
vercel env add AWS_S3_BUCKET production
vercel env add AWS_REGION production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_PUBLISHABLE_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production   # filled in §5
vercel env add STRIPE_PRO_PRICE_ID production
vercel env add STRIPE_TEAM_PRICE_ID production
vercel env add SMTP_HOST production
vercel env add SMTP_PORT production
vercel env add SMTP_USER production
vercel env add SMTP_PASS production
vercel env add SMTP_FROM production
vercel env add CRON_SECRET production
vercel env add PLATFORM_FEE_BPS production
```

For preview deploys repeat the critical ones with `preview` instead of
`production`. Use a separate Neon branch + Stripe test keys + Mailtrap sandbox
to keep preview traffic isolated from prod.

`vercel.json` already pins:

- framework = `nextjs`
- build = `prisma generate && next build`
- region = `fra1` (change here if your DB lives elsewhere)
- daily crons at 03:00-03:30 UTC → `/api/cron/expire-trials`,
  `/api/cron/purge-account-deletions`, `/api/cron/purge-soft-deleted`,
  `/api/cron/release-payouts`

---

## 4. First deploy (~2 min)

Preview deploy:

```bash
vercel
```

Promote to production:

```bash
vercel --prod
```

Vercel prints the deploy URL. **Update `APP_URL` and `NEXT_PUBLIC_APP_URL`**
in Vercel env to match this URL (or your custom domain), then redeploy:

```bash
vercel --prod
```

Update the S3 CORS `AllowedOrigins` (step 1.2) to the same URL.

---

## 5. Stripe webhook (~3 min)

The webhook endpoint exists at `/api/webhooks/stripe` but needs a signing
secret tied to the deployed URL.

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. URL: `https://<your-deploy-url>/api/webhooks/stripe`
3. Events to subscribe (minimum):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `account.updated` (Stripe Connect onboarding completion)
4. Copy the **Signing secret** (`whsec_…`).
5. Update `STRIPE_WEBHOOK_SECRET` in Vercel env (production scope), then
   redeploy: `vercel --prod`.
6. Hit **Send test webhook** in Stripe → confirm a 2xx response.

---

## 6. Smoke test (~2 min)

```bash
./scripts/deploy-verify.sh https://<your-deploy-url>
```

Pass criteria (script exits 0):

- `/api/health` returns 200 with `database: ok` and `env: ok`
- `/` renders (200)
- `/api/webhooks/stripe` rejects an unsigned POST with 400/401 (proves the
  route is reachable and signature verification is wired)
- `/api/cron/expire-trials`, `/api/cron/purge-account-deletions`,
  `/api/cron/purge-soft-deleted`, and `/api/cron/release-payouts` each return
  401 without auth (proves the routes are reachable and auth-gated)

If anything fails, the script prints the failing endpoint's response. Common
fixes:

| Symptom                                  | Fix                                                  |
|------------------------------------------|------------------------------------------------------|
| `database: fail`                         | DATABASE_URL wrong, or Neon IP allowlist blocks Vercel (Neon is open by default) |
| `env: fail` listing `STRIPE_…`           | env var missing for the deployed environment        |
| cron returns 500 (not 401)               | `CRON_SECRET` not set in Vercel for that environment|
| `/api/webhooks/stripe` returns 404       | redeploy needed after env changes                   |

---

## 7. Custom domain (optional)

1. Vercel Project → **Settings → Domains** → add your domain.
2. Add the DNS records Vercel shows (CNAME or A/AAAA).
3. Update `APP_URL` + `NEXT_PUBLIC_APP_URL` to the custom URL.
4. Update the Stripe webhook URL to the custom domain.
5. Update the S3 bucket CORS `AllowedOrigins`.
6. Redeploy.

---

## 8. Going live (test mode → live mode)

Only after preview is fully smoke-tested:

1. Stripe → toggle to **Live mode**, repeat step 1.3 with live keys, repeat
   step 5 with a live-mode webhook endpoint.
2. Swap Mailtrap for a transactional provider; verify DKIM/SPF on the sender
   domain.
3. Promote Neon project from free tier if you expect non-trivial load
   (autoscaling or paid plan).
4. Tighten S3 IAM policy if you've widened it for debugging.
5. Re-run `./scripts/deploy-verify.sh` against the live URL.

---

## Rollback

Every Vercel deploy has its own immutable URL. To roll back:

```bash
vercel ls                       # list recent deploys
vercel promote <deployment-url> # repoint production alias
```

A bad migration is harder to roll back. Always:

- Take a Neon branch (snapshot) before `prisma migrate deploy` in prod.
- If a migration breaks the deploy, restore from the branch in Neon's UI and
  redeploy the previous commit.

---

## Reference

- `vercel.json` — framework, build command, region, cron config
- `.env.example` — full env contract with comments
- `scripts/deploy-verify.sh` — post-deploy smoke test
- `src/app/api/health/route.ts` — liveness + DB + env check endpoint
