---
title: Deploy Plan - Free Tier Testing (3 users)
date: 2026-05-08
status: draft
---

# Deploy Plan — MusicCollabHub Free Tier (3 Users)

## Prehled sluzeb

| Sluzba | Provider | Free Tier | Limit | Poznamka |
|---|---|---|---|---|
| Hosting / App | Vercel Hobby | FREE | 100 GB/mo bandwidth, serverless functions 10s timeout | Vercel je native pro Next.js, zero config |
| PostgreSQL DB | Neon | FREE | 0.5 GB storage, 5M compute units/mo | Serverless Postgres, auto-scale to 0. Branching pro dev/prod |
| S3 Storage | Cloudflare R2 | FREE | 10 GB storage, 1M class A ops, 10M class B ops/mo | S3-compatible, zero egress fees. Lepsi nez AWS S3 free tier |
| Email | Resend | FREE | 3000 emailu/mesic, 100/den | Jednoduche API, leps nez SMTP. Podporuje nodemailer transport |
| Auth | Built-in | FREE | - | JWT cookies + bcrypt, zadna external sluzba |
| Stripe | Test Mode | FREE | - | Testovaci klice, realne platby se neprovadeji |

## Celkove naklady: $0/mesic

---

## 1) Vercel — Hosting (Hobby, FREE)

**Vyhody:**
- Zero config pro Next.js
- Automaticke deploys z GitHub
- Preview deploys pro kazdy PR
- Edge functions + Serverless functions

**Limity:**
- 100 GB/mesic bandwidth (pro 3 uzivatele vice nez dost)
- Serverless function timeout 10s (pozor na dlouhe operace)
- 100k function invocations/mesic

**Setup:**
```bash
npm i -g vercel
cd ~/gt/MusicolabHub/crew/lubman
vercel login    # GitHub auth
vercel --prod  # nebo pres GitHub integration
```

**Env vars na Vercel:** Viz sekce 5.

---

## 2) Neon — PostgreSQL (Free, FREE)

**Vyhody:**
- Serverless Postgres, autoscale to 0
- Branching (dev/staging/prod z jednoho clusteru)
- 0.5 GB storage — pro testovaci fazi vice nez dost
- Prisma plne podporuje Neon (pg adapter)

**Setup:**
1. Registrace: https://neon.tech (GitHub login)
2. Vytvorit projekt -> ziskat connection string
3. Connection string format:
   `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

**Dulezite pro Prisma:**
- Neon podporuje Prisma pg adapter (uz pouzivame `@prisma/adapter-pg`)
- Pridat do `prisma.config.ts`: `adapter: 'pg'`

**Limity:**
- 0.5 GB storage
- 5M compute units/mesic (cca 100-200 active users)
- Auto-suspend po 5 minutach neaktivity (studeny start ~500ms)

---

## 3) Cloudflare R2 — S3 Storage (Free, FREE)

**Vyhody oproti AWS S3:**
- 10 GB storage FREE (AWS S3 ma jen 5 GB a jen 12 mesicu)
- ZERO egress fees (AWS S3 uctuje za stahovani)
- S3-compatible API (staci zmenit endpoint + credentials)
- Presigned URL funguji stejne jako AWS S3

**Setup:**
1. Registrace: https://dash.cloudflare.com
2. R2 -> Create Bucket (napr. `musiccollabhub-files`)
3. R2 -> Manage R2 API Tokens -> Create API Token (Read & Write)
4. Ziskat: Access Key ID, Secret Access Key

**Zmena v kodu (src/lib/s3.ts):**
Pridat `endpoint` do S3Client config:
```typescript
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});
```

NEBO pouzit AWS S3 free tier (5GB, 12 mesicu) — ale R2 je lepsi long-term.

---

## 4) Resend — Email (Free, FREE)

**Vyhody oproti SMTP:**
- 3000 emailu/mesic FREE (Brevo jen 300/den, Mailtrap jen testing)
- Jednoduche API (leps nez SMTP konfigurace)
- Domain verification (DKIM, SPF) — leps deliverability
- Podporuje nodemailer transport (`nodemailer-resend`)

**Setup:**
1. Registrace: https://resend.com (GitHub login)
2. Ziskat API key: `re_xxxxx`
3. Pridat domain (volitelne pro produkci, pro testovani staci `onboarding.resend.dev`)

**Zmena v kodu (src/lib/email.ts):**
Moznost A — pres nodemailer transport:
```bash
npm i nodemailer-resend
```
```typescript
import { ResendTransport } from "nodemailer-resend";
const transporter = nodemailer.createTransport(
  new ResendTransport({ apiKey: process.env.RESEND_API_KEY! })
);
```

Moznost B — pres nativni Resend SDK:
```bash
npm i resend
```
```typescript
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY!);
await resend.emails.send({ from, to, subject, html });
```

**Limity:**
- 3000 emailu/mesic
- 100 emailu/den (pro 3 uzivatele vice nez dost)

---

## 5) Environment Variables

```
# === DATABASE ===
DATABASE_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/musiccollabhub?sslmode=require"

# === NEXTAUTH ===
NEXTAUTH_SECRET="<generate: openssl rand -base64 32>"
NEXTAUTH_URL="https://musiccollabhub.vercel.app"  # nebo custom domain

# === S3 / R2 STORAGE ===
AWS_ACCESS_KEY_ID="<R2 Access Key ID>"
AWS_SECRET_ACCESS_KEY="<R2 Secret Access Key>"
AWS_S3_BUCKET="musiccollabhub-files"
AWS_REGION="auto"
# Pokud pouzijes R2 misto AWS S3, pridat do s3.ts:
R2_ACCOUNT_ID="<Cloudflare Account ID>"

# === EMAIL ===
RESEND_API_KEY="re_xxxxx"
# NEBO SMTP (pokud chces zachovat puvodni kod):
# SMTP_HOST="smtp.resend.com"
# SMTP_PORT=587
# SMTP_USER="resend"
# SMTP_PASS="<Resend API Key>"
SMTP_FROM="noreply@onboarding.resend.dev"

# === STRIPE (test mode) ===
STRIPE_SECRET_KEY="sk_test_xxxxx"
STRIPE_PUBLISHABLE_KEY="pk_test_xxxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxxx"
STRIPE_PRO_PRICE_ID="price_xxxxx"  # vytvor v Stripe Dashboard
STRIPE_TEAM_PRICE_ID="price_xxxxx"

# === APP ===
APP_URL="https://musiccollabhub.vercel.app"
NEXT_PUBLIC_APP_URL="https://musiccollabhub.vercel.app"
```

---

## 6) Deploy Kroky

```
Krok  Popis                               Cas
----- ----------------------------------- -----------
1     Vytvorit Neon DB + ziskat URL       5 min
2     Vytvorit R2 Bucket + API token      5 min
3     Vytvorit Resend account + API key   5 min
4     Vytvorit Stripe test account        10 min
5     Generovat NEXTAUTH_SECRET           1 min
6     Aktualizovat src/lib/s3.ts (R2)     10 min
7     Aktualizovat src/lib/email.ts       15 min
        (Resend SDK nebo nodemailer-transport)
8     Push na GitHub                      2 min
9     Propojit repo s Vercel              5 min
10    Nastavit env vars na Vercel         10 min
11    npx prisma db push                   2 min
12    Test: signup, login, upload, invite  30 min
```

---

## 7) Alternativy (kdyby free nestacilo)

| Sluzba | Free | Placena alternativa | Cena |
|---|---|---|---|
| DB | Neon 0.5GB | Supabase Pro | $25/mo (8GB) |
| Storage | R2 10GB | AWS S3 | ~$0.23/GB/mo |
| Email | Resend 3000/mo | Resend Pro | $20/mo (50k/mo) |
| Hosting | Vercel Hobby | Vercel Pro | $20/mo |

**Celkem placena varianta: ~$45/mo** — ale pro 3 uzivatele free staci.

---

## 8) Bezpecnostni poznamky

- .env.local JE v .gitignore — nikdy necommitovat
- NEXTAUTH_SECRET musi byt skutecne nahodny (ne hardcoded)
- R2 credentials + Resend API key ukladat jen ve Vercel env vars
- Stripe test keys jsou safe pro testing, ale nikdy nepouzivat live keys bez HTTPS
- Custom domain na Vercel = automaticky HTTPS (Let's Encrypt)
