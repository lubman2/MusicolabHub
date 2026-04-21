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

## Licence

Proprietary — všechna práva vyhrazena.
