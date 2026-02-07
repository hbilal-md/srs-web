# SRS Web — Project Specification

A web-first spaced repetition system for board exam preparation, built with Next.js, Supabase, and the FSRS-4.5 scheduling algorithm.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL) |
| Media | AWS S3 (occlusion images) |
| Styling | Tailwind CSS 3 + CSS custom properties |
| Hosting | Vercel |
| Algorithm | FSRS-4.5 (Free Spaced Repetition Scheduler) |

---

## Architecture

```
pipelines/ (local Python)
├── kurts_notes/     ──▶ Supabase (PostgreSQL)
├── textbook/  (planned)        ▲
└── shared/ (S3, Supabase)      │
                                │
S3 (images) ◀───────────────────┤
                                │
                         Vercel (Next.js)
```

- Cards are ingested from PDFs via offline Python pipelines (`pipelines/`) into Supabase
- Each pipeline framework handles a different source format (Kurt's notes, textbooks, etc.)
- Shared utilities handle S3 image upload and Supabase card insertion
- Occlusion images (blocked + revealed) are stored in S3
- The Next.js app reads/writes card state through API routes using the Supabase service key
- Deployed to Vercel with automatic GitHub deploys

---

## Database Schema

### `cards`

| Column | Type | Description |
|--------|------|-------------|
| `card_id` | TEXT (unique) | 8-char hex identifier |
| `card_type` | TEXT | `qa`, `cloze`, or `occlusion` |
| `question` | TEXT | Q/A question or occlusion prompt |
| `answer` | TEXT | Q/A answer |
| `cloze_text` | TEXT | Cloze text with `[answer]` syntax |
| `blocked_image` | TEXT | S3 URL — occluded image |
| `reveal_image` | TEXT | S3 URL — revealed image |
| `topic` | TEXT | e.g. "Pathology" |
| `subtopic` | TEXT | e.g. "Cervical Cytology" |
| `tags` | TEXT[] | Arbitrary tags |
| `importance` | TEXT | `core` or `supporting` |
| `quality` | TEXT | `A`, `B`, or `C` |
| `flagged` | BOOLEAN | Marked for editing |
| `stability` | REAL | FSRS memory stability |
| `difficulty` | REAL | FSRS difficulty (1–10) |
| `due_date` | TIMESTAMPTZ | Next review time |
| `last_review` | TIMESTAMPTZ | Most recent review |
| `review_count` | INT | Total reviews |
| `lapses` | INT | Times forgotten |
| `state` | TEXT | `new`, `learning`, `review`, `relearning`, `suspended` |

### `reviews`

| Column | Type | Description |
|--------|------|-------------|
| `card_id` | TEXT (FK) | References cards.card_id |
| `rating` | INT | 1–4 (Again, Hard, Good, Easy) |
| `time_taken_ms` | INT | Response time |
| `reviewed_at` | TIMESTAMPTZ | Timestamp |
| `prev_stability` | REAL | For undo |
| `prev_difficulty` | REAL | For undo |
| `prev_state` | TEXT | For undo |
| `prev_review_count` | INT | For undo |
| `prev_lapses` | INT | For undo |
| `prev_due_date` | TIMESTAMPTZ | For undo |
| `prev_last_review` | TIMESTAMPTZ | For undo |

### `filtered_decks`

| Column | Type | Description |
|--------|------|-------------|
| `deck_id` | TEXT (unique) | 8-char hex identifier |
| `name` | TEXT | User-given name |
| `filter_topics` | TEXT[] | Topic filter |
| `filter_subtopics` | TEXT[] | Subtopic filter |
| `filter_tags` | TEXT[] | Tag filter |
| `filter_states` | TEXT[] | State filter |
| `filter_importance` | TEXT[] | Importance filter |
| `filter_quality` | TEXT[] | Quality filter |
| `sort_order` | TEXT | `due_date`, `difficulty`, `lapses`, `random` |
| `max_cards` | INT | Card limit |
| `card_queue` | TEXT[] | Card pool (matching card IDs) |
| `cards_introduced` | TEXT[] | Cards seen at least once in this deck |
| `new_per_session` | INT | New card limit per session (default 20) |
| `review_per_session` | INT | Review card limit per session (default 200) |
| `new_today` | INT | New cards introduced today |
| `reviews_today` | INT | Reviews completed today |
| `last_session_date` | DATE | Auto-resets daily counters |
| `completed` | BOOLEAN | Done flag |

---

## API Routes

### Review Flow

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/next` | Next due card(s). Params: `limit`, `random`, `cardId` |
| POST | `/api/review` | Submit rating. Body: `{ cardId, rating, timeTakenMs }` |
| POST | `/api/review/undo` | Undo last review. Body: `{ reviewId }` |

### Card Actions

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/cards/[id]/suspend` | Suspend card (never show again) |
| POST | `/api/cards/[id]/flag` | Flag card for editing |

### Metadata & Stats

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/stats` | Due counts, retention rate, reviewed today |
| GET | `/api/topics` | Topic tree, tags, states, importance, quality |

### Filtered Decks

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/decks` | List all decks with progress (introduced/total) |
| POST | `/api/decks` | Create new filtered deck (accepts `newPerSession`, `reviewPerSession`) |
| DELETE | `/api/decks/[id]` | Delete deck |
| GET | `/api/decks/[id]/next` | Next card via dynamic session queue (learning → review → new) |
| POST | `/api/decks/[id]/next` | Update session counters and `cards_introduced` after rating |
| POST | `/api/decks/[id]/reset` | Reset session counters. `?full=true` also clears `cards_introduced` |

---

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `src/app/page.tsx` | Home — Quick 10 hero, filtered deck list |
| `/review` | `src/app/review/page.tsx` | Review session (normal + Quick 10 mode) |
| `/review?mode=quick10` | (same) | Quick 10: random 10 due cards |
| `/decks/new` | `src/app/decks/new/page.tsx` | Full-page filtered deck creation form |
| `/decks/[id]` | `src/app/decks/[id]/page.tsx` | Deck-specific review session |

> **Note:** Deck management (delete) lives on the home page via a three-dot overflow menu (⋮) on each deck card.

---

## Filtered Deck System

### Session-Based Queue (Feb 2026 Overhaul)

Filtered decks use a **dynamic session queue** instead of a static playlist. Cards are served in priority order:

1. **Learning cards due now** — Cards in `learning`/`relearning` state with `due_date <= now`
2. **Review cards due now** — Previously introduced cards in `review` state with `due_date <= now` (capped by `review_per_session`)
3. **New cards** — Cards not yet in `cards_introduced` (capped by `new_per_session`)
4. **All caught up** — No cards available; shows next due time

### Session Limits

Configurable at deck creation (like Anki):

| Setting | Default | Purpose |
|---------|---------|---------|
| `new_per_session` | 20 | Max new cards introduced per day |
| `review_per_session` | 200 | Max review cards per day |

Daily counters (`new_today`, `reviews_today`) auto-reset when `last_session_date` changes.

### Card Lifecycle in a Deck

```
card_queue (pool) ──▶ First seen ──▶ cards_introduced (tracked)
                          │
                          ▼
                    AGAIN/HARD: stays in learning, cycles back in minutes
                    GOOD/EASY: graduates to review, comes back in days
```

### Session UI

- **Stats bar**: `New: 8/20 | Due: 35/100 | Learning: 3`
- **Progress bar**: `145/200 introduced`
- **Card type badge**: Shows whether current card is new/review/learning
- **All caught up screen**: Next due time, remaining new count, session summary

---

## Components

| Component | File | Props |
|-----------|------|-------|
| `Card` | `src/components/Card.tsx` | `{ card, isRevealed, onReveal }` |
| `RatingButtons` | `src/components/RatingButtons.tsx` | `{ intervals, onRate, disabled }` |
| `ActionButtons` | `src/components/ActionButtons.tsx` | `{ onAbandon, onFlag, onUndo?, disabled }` |

### Card Types

- **Q/A** — Question text, divider, answer text (green)
- **Cloze** — Text with `[...]` blanks, answer highlighted on reveal
- **Occlusion** — Stacked blocked/reveal images. Both preloaded, crossfade on reveal

---

## FSRS-4.5 Algorithm

Implementation: `src/lib/fsrs.ts`

### Card Lifecycle

```
NEW ──▶ LEARNING ──▶ REVIEW ◀──▶ RELEARNING
                       │
                       ▼
                   SUSPENDED (manual)
```

### Ratings

| Rating | Key | Meaning | Effect |
|--------|-----|---------|--------|
| Again (1) | `1` | Blackout | Drop stability, increment lapses |
| Hard (2) | `2` | Recalled with difficulty | Small stability increase (with penalty) |
| Good (3) | `3` | Correct with hesitation | Standard increase |
| Easy (4) | `4` | Perfect recall | Large increase (with bonus) |

### Learning/Relearning Intervals

Cards in learning or relearning state use custom intervals:

| Rating | Interval | Behavior |
|--------|----------|----------|
| Again | 1 minute | Stays in learning queue |
| Hard | 10 minutes | Stays in learning queue |
| Good | FSRS-calculated (~3 days for new) | Graduates to review |
| Easy | FSRS-calculated (~15 days for new) | Graduates to review |

Only **Again** and **Hard** cycle back within a session. **Good** and **Easy** graduate the card to the review queue (due tomorrow or later).

### Key Formulas

**Interval**: `S × (81/19) × (R^-2 - 1)` where S = stability, R = target retention (0.9)

**Retrievability**: `(1 + (19/81) × t/S)^-0.5` where t = elapsed days

### Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| Space / Enter | Reveal card | Before reveal |
| 1–4 | Rate card | After reveal |
| Z | Undo last review | Anytime (when available) |

---

## Design System

### Colors (CSS Variables)

```css
--bg-primary:       #161618   /* Deep charcoal */
--bg-secondary:     #1e1e21   /* Card surfaces */
--bg-tertiary:      #252529   /* Elevated surfaces */
--bg-accent:        #2d2d32   /* Borders, dividers */
--accent-green:     #8AC926   /* Primary action color */
--accent-green-dim: rgba(138, 201, 38, 0.15)
--text-primary:     #e8e8e8
--text-muted:       #6b6b70
--rating-again:     #e74c3c
--rating-hard:      #e67e22
--rating-good:      #8AC926
--rating-easy:      #3498db
```

### Design Principles

1. **Image-first for occlusion** — No card container, image spans full width
2. **Minimalist review UI** — Content is the focus, chrome recedes
3. **Dark theme only** — Charcoal gray + green accents
4. **Mobile-first** — Touch targets, safe area padding, responsive breakouts

---

## Environment Variables

### Next.js App (`.env.local` or Vercel)

```
NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anonymous key
SUPABASE_SERVICE_KEY          — Supabase service role key (server-side only)
```

### Pipelines (`pipelines/.env`)

```
OPENAI_API                   — OpenAI API key (GPT-4o for card generation)
AWS_ACCESS_KEY_ID            — S3 credentials
AWS_SECRET_ACCESS_KEY        — S3 credentials
S3_BUCKET_NAME               — S3 bucket for card images
S3_REGION                    — S3 region
S3_PUBLIC_URL                — S3 public URL prefix
SUPABASE_URL                 — Supabase project URL
SUPABASE_SERVICE_KEY         — Supabase service role key
SUPABASE_ACCESS_TOKEN        — Personal access token (for MCP server + Management API)
```

### Database Access

Direct database connection via `psql` is **not available** — Supabase's direct host (`db.*.supabase.co`) resolves to IPv6 only, which has no route from the local network.

Two working alternatives:

1. **Supabase MCP Server** (primary) — Configured in `.mcp.json`, gives Claude Code direct database access for queries, migrations, and schema management. Uses the Management API with a personal access token.

2. **Supabase Management API** (fallback) — `POST https://api.supabase.com/v1/projects/{ref}/database/query` with the access token. Used for running DDL and ad-hoc queries via `curl`.

The REST API (`SUPABASE_URL/rest/v1/`) also works for data reads but cannot run DDL.

---

## File Structure

```
src/
├── app/
│   ├── page.tsx                    Home page
│   ├── layout.tsx                  Root layout
│   ├── globals.css                 All styles
│   ├── review/page.tsx             Review session
│   ├── decks/
│   │   ├── page.tsx                Deck management (deprecated)
│   │   ├── new/page.tsx            Create filtered deck (full page)
│   │   └── [id]/page.tsx           Deck review
│   └── api/
│       ├── next/route.ts           Next card endpoint
│       ├── review/route.ts         Submit review
│       ├── review/undo/route.ts    Undo review
│       ├── stats/route.ts          Statistics
│       ├── topics/route.ts         Metadata
│       ├── cards/[id]/suspend/     Suspend card
│       ├── cards/[id]/flag/        Flag card
│       └── decks/                  Deck CRUD + navigation
├── components/
│   ├── Card.tsx                    Card display
│   ├── RatingButtons.tsx           Rating UI
│   └── ActionButtons.tsx           Suspend/Flag/Undo
└── lib/
    ├── supabase.ts                 Client + types
    └── fsrs.ts                     FSRS-4.5 algorithm

pipelines/
├── shared/
│   ├── models.py                   CardData dataclass
│   ├── s3_storage.py               S3ImageStorage (upload, dedup, obfuscated keys)
│   └── supabase_writer.py          SupabaseCardWriter (batch insert)
├── kurts_notes/
│   ├── run.py                      Entry point: python -m kurts_notes.run /path/to/folder
│   ├── slide_processor.py          Slide extraction, OCR, AI classification, card generation
│   └── README.md                   Pipeline docs + comprehensiveness notes
├── archive/
│   ├── legacy/                     Original srs_card_gen scripts
│   └── planning_docs/              Original Obsidian planning notes
├── pyproject.toml                  Python dependencies
└── .gitignore                      Python-specific ignores
```

---

## Tag Convention

Each card gets 2–3 tags:

| Tag | Example | Source |
|-----|---------|--------|
| Topic | `cytology` | From pipeline `--topic` arg |
| Subtopic | `cervical-cytology` | From slide-level classification |
| Source | `source:kurts-notes` | From pipeline `--source` arg |

LLM-generated content tags were removed (Feb 2026) — too granular and inconsistent for filtering. The tag system is kept extensible for future resources (textbooks, lectures, etc.).

---

## Migrations

Migrations are in `migrations/` numbered sequentially:

| Migration | Description |
|-----------|-------------|
| 001 | Initial schema (cards, reviews) |
| 002 | Filtered decks |
| 003 | Additional card fields |
| 004 | Deck filters expansion |
| 005 | Deck session tracking (`cards_introduced`, per-session limits, daily counters) |

Migrations are run via the **Supabase Management API** or **SQL Editor** in the Supabase dashboard.

---

## Related Docs

- [PROGRESS.md](./PROGRESS.md) — Current sprint tracking, known issues, testing checklist
- [ROADMAP.md](./ROADMAP.md) — Long-term vision, feature roadmap, ecosystem plans
