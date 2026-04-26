# MusicCollabHub

GitHub for music production — platforma pro vzdálenou spolupráci na DAW projektech.

## O projektu

MusicCollabHub umožňuje hudebníkům, producentům a zvukařům spolupracovat na hudebních projektech online. Klíčové pilíře:

- **Project Management** — upload DAW souborů, verzování, správa spolupracovníků, inline komentáře
- **Marketplace** — vytváření zakázek (mixing, vokály, produkce), discovery talentů, portfolio, hodnocení
- **Royalty Tracking** — definice vlastnických podílů, split sheets, earnings dashboard, payouty přes Stripe

## Tech Stack

| Vrstva | Technologie |
|--------|------------|
| Frontend | Next.js (React) + Web Audio API |
| Backend | Node.js + PostgreSQL (Prisma) |
| Storage | AWS S3 |
| Real-time | WebSocket |
| Audio | FFmpeg |
| Platby | Stripe |

## Struktura projektu

```
src/
├── components/   # React komponenty
├── pages/        # Next.js stránky / API routes
├── lib/          # Utility funkce, DB klient, S3 helper
├── hooks/        # Custom React hooks
├── styles/       # CSS / Tailwind
└── types/        # TypeScript typy
prisma/           # DB schéma a migrace
public/assets/    # Statické soubory
docs/             # Projektová dokumentace
```

## MVP Scope

- Upload a cloud storage projektových souborů
- Správa spolupracovníků s oprávněními (view/comment/edit)
- Základní komentářový systém
- Portfolio profily
- Marketplace — tvorba a procházení zakázek
- Definice vlastnických podílů
- Stripe platby

## Monetizace

- Creator subscriptions: €12–29/měsíc
- Marketplace provize: 15%

## Spuštění

```bash
npm install
npm run dev
```

## Local development → Demo data

Populate the dev database with demo users, a project, and seeded
collaboration state for manual UI testing:

```bash
npm run db:seed
```

The seed is idempotent — running it twice does not error or duplicate.
It requires `DATABASE_URL` (see `.env.example`) and assumes migrations
have already been applied.

**Demo credentials** (all share the same password):

| Email                  | Role  | Notes                                        |
|------------------------|-------|----------------------------------------------|
| `admin@example.com`    | admin | Platform admin                               |
| `creator1@example.com` | user  | Owner of the demo project, on Pro trial      |
| `creator2@example.com` | user  | Editor on the demo project, vocalist         |

**Password:** `Demo1234!`

The seed creates one demo project (`Midnight Sessions`) with a file, a
published version, an open comment thread, and a draft 50/50 ownership
split between the two creators.

## Licence

Proprietary — všechna práva vyhrazena.
