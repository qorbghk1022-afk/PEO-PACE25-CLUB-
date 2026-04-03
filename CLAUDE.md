# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PEO (PACE25 Club) is a gamified running crew web app where members earn experience points and level up a character (egg → slime → pixel runner) as they run. It serves ~30 members across two cohorts (1기/2기). The app is in Korean.

**Production:** https://pace25.netlify.app (Netlify auto-deploy from main)

## Commands

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
```

No test framework is configured.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript 5
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **External API:** Strava OAuth for automatic running activity sync (2기 only)
- **Styling:** Plain CSS (globals.css), no CSS framework
- **Only runtime dependency beyond Next/React:** `@supabase/supabase-js`

## Architecture

### App Router Structure (`/app`)

- `page.tsx` — Main app page with 4 tabs (MyPage, ChallengeBoard, Ranking, Calendar). Auth-gated; redirects to `/login` if not authenticated.
- `login/page.tsx` — Auth flow (email/password + OTP verification, signup with address via Daum postcode)
- `policy/` — Privacy policy and terms pages

### API Routes (`/app/api`)

| Route | Purpose |
|---|---|
| `strava/sync` | Fetch Strava club activities and upsert into Supabase |
| `cron` | Daily cron job (23:00 KST) — triggers Strava sync |
| `sync-sheet` | Sync data to Google Sheets (1기 spreadsheet integration) |
| `signup-complete` | Post-signup member creation (uses service role key) |
| `profile/` | Get/update member profile |
| `delete-account` | Account deletion |
| `recalc` | Recalculate scoring/stats |
| `seed` | Database seeding |
| `import-sprints` | Import sprint data |

### Components (`/components`)

Four main tab components, each is a self-contained client component with direct Supabase queries:
- `MyPage.tsx` — Character card, radar chart, season stats, 3-month scores
- `ChallengeBoard.tsx` — 2-week team challenge with fine calculation
- `Ranking.tsx` — Leaderboard with medal display for top 3
- `Calendar.tsx` — Monthly heatmap with streak counter

### Library (`/lib`)

- `scoring.ts` — All scoring formulas (v4.0): speed, endurance, long run, consistency, efficiency. Final score = speed×0.3 + endurance×0.25 + longRun×0.15 + consistency×0.2 + efficiency×0.1
- `types.ts` — TypeScript type definitions
- `supabase/` — Supabase client configuration (browser + server + service role variants)

### Database (`/sql`)

Schema files in execution order: `01_schema.sql` → `02_seed.sql` → `03_auth.sql` → `04_rls.sql` → `05_profiles.sql`

Core tables: `members`, `activities`, `seasons`, `member_season_stats`, `challenges`, `challenge_teams`, `sync_logs`

### Data Files (`/data`)

CSV files for cohort 1 (1기) data: member raw data, ability scores, challenge board data. These are synced to/from Google Sheets.

## Environment Variables

See `.env.local.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side admin operations
- `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` / `STRAVA_REFRESH_TOKEN` / `STRAVA_CLUB_ID` — Strava integration
- `NEXT_PUBLIC_SITE_URL` — Deployment URL
- `CRON_SECRET` — Cron job authentication

## Key Domain Concepts

- **Seasons (시즌):** 2-week periods for scoring
- **LV formula:** `FLOOR(100 × (cumulative_EXP / b) ^ p)` where b=54000 (1기) or 6720 (2기), p=0.72
- **Challenge fines:** Teams that don't meet 15km/member goal pay ₩3,000 per missing km
- **Two cohorts:** 1기 (26 members, spreadsheet-based) and 2기 (5 members, Strava-synced)
- **Character growth:** 10 stages from egg to pixel runner, determined by LV ranges

## Existing Context Document

`CLAUDE(v1).md` contains detailed domain context including scoring formulas, spreadsheet column mappings, challenge rules, and operational details from the PEO rulebook.
