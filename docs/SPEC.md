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
PDF Pipeline (local Python) ──▶ Supabase (PostgreSQL)
                                     ▲
S3 (images) ◀────────────────────────┤
                                     │
                              Vercel (Next.js)
```

- Cards are ingested from PDFs via an offline Python pipeline into Supabase
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
| `card_queue` | TEXT[] | Snapshot of card IDs |
| `current_position` | INT | Progress pointer |
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
| GET | `/api/decks` | List all decks with progress |
| POST | `/api/decks` | Create new filtered deck |
| DELETE | `/api/decks/[id]` | Delete deck |
| GET | `/api/decks/[id]/next` | Next card from deck queue |
| POST | `/api/decks/[id]/next` | Advance position (handles AGAIN re-queue, undo) |
| POST | `/api/decks/[id]/reset` | Reset deck to position 0 |

---

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `src/app/page.tsx` | Home — Quick 10 hero, filtered deck list |
| `/review` | `src/app/review/page.tsx` | Review session (normal + Quick 10 mode) |
| `/review?mode=quick10` | (same) | Quick 10: random 10 due cards |
| `/decks` | `src/app/decks/page.tsx` | Deck management — create, list, delete |
| `/decks/[id]` | `src/app/decks/[id]/page.tsx` | Deck-specific review session |

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

```
NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anonymous key
SUPABASE_SERVICE_KEY          — Supabase service role key (server-side only)
```

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
│   │   ├── page.tsx                Deck management
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
```
