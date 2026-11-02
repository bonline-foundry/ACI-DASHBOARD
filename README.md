# ACI Media Dashboard

One web dashboard for ACI Consumer Brands' media work, in six modules:

| Module | What it does |
| --- | --- |
| **Plan** | Monthly campaign calendar (timeline, calendar, list), budgets against plan and actual spend |
| **Spend** | Money spent by brand, month, channel, TV station and agency |
| **Performance** | Cost to reach 1,000 people by channel (manual input or upload) |
| **Digital Data** | ACI's own Meta, YouTube and TikTok results (manual input or upload) |
| **Competitor Tracking** | Each brand against 3 rivals: share of voice, ad log, YouTube snapshot, source owners |
| **Billing** | Unpaid bills by age, payment status, reminders, notes |

Plus **Home** (alerts and key numbers), **Uploads & History** (every Excel upload is a version you can restore, every change is logged) and **Settings** (brands, rivals, vendors, TV stations, alert rules, Excel templates).

All data is entered by hand or uploaded from the Excel templates. Every upload is checked before it is saved (file type, columns, month, duplicates, row errors, totals). Manual edits are kept when a month is uploaded again. Money is in BDT, with VAT.

## Repository layout

```
aci-media-dashboard/   the app (Next.js 16, React 19, Tailwind 4, shadcn/ui on Base UI, Drizzle ORM, Neon Postgres)
docs/spine/specs/      the design spec
docs/spine/plans/      the build plans, one per step
.spine/                project config and the pinned environment contract
ACI Media Dashboard Deep Research.pdf, ACI Media Dashboard User Flow and Wireframes.html   source research and wireframes
```

## Run it locally

Requirements: Node.js 20 or newer, a Neon Postgres database.

```bash
cd aci-media-dashboard
npm install
cp .env.example .env.local      # fill in DATABASE_URL and the endpoint guards
npm run db:setup                # create tables and the fixed reference lists
npm run dev                     # http://localhost:3000
```

The app refuses to start if `DATABASE_URL` does not point at the endpoint named in `NEON_EXPECTED_ENDPOINT`, so it cannot run against the wrong database by accident.

## Tests

```bash
npm test            # unit tests (Vitest, in-memory PGlite with the real migrations)
npm run test:e2e    # browser tests (Playwright); run only against the Neon dev branch and clean up after themselves
npm run demo        # visible, slowed-down walkthrough of every module for presentations (keeps its data)
```

## Notes

- There is no login yet: the app is built for a single user ("Admin"). Do not expose it on a public URL with real data without adding access protection.
- `.env*` files are never committed. Only `.env.example` (empty values) is in the repository.
