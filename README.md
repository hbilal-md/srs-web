# SRS Web

Web-first spaced repetition system for board exam prep.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  PDF Pipeline   │────▶│   Supabase   │◀────│  Vercel UI  │
│  (local Python) │     │  (postgres)  │     │  (Next.js)  │
└─────────────────┘     └──────────────┘     └─────────────┘
        │                      │
        ▼                      │
   ┌─────────┐                 │
   │   S3    │◀────────────────┘
   │ (media) │
   └─────────┘
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.local.example` to `.env.local` and update values if needed.

### 3. Set up Supabase

Run the SQL files in `migrations/` in order in your Supabase SQL Editor.

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment to Vercel

1. Push this folder to a GitHub repository
2. Connect the repo to Vercel
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
4. Deploy!

## Features

- **Review Flow**: FSRS-4.5 scheduling, keyboard shortcuts, mobile-friendly
- **Card Types**: Q/A, Cloze, Image Occlusion
- **Filtered Decks**: Create custom study sessions by topic/tags/state
- **Progress Tracking**: Pick up where you left off on any device
- **Breadcrumbs**: Link back to Obsidian reference notes

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/next` | Get next due card |
| POST | `/api/review` | Submit rating |
| GET | `/api/stats` | Get statistics |
| POST | `/api/cards/{id}/suspend` | Suspend card |
| POST | `/api/cards/{id}/flag` | Flag card |
| GET | `/api/decks` | List filtered decks |
| POST | `/api/decks` | Create deck |
| GET | `/api/decks/{id}/next` | Next card from deck |
| DELETE | `/api/decks/{id}` | Delete deck |
| POST | `/api/decks/{id}/reset` | Reset deck progress |

## FSRS Algorithm & Card Lifecycle

This app uses **FSRS-4.5** (Free Spaced Repetition Scheduler), a modern algorithm that replaced SM-2. The implementation lives in `src/lib/fsrs.ts`.

### Card States

Cards move through 4 states:

```
NEW ──▶ LEARNING ──▶ REVIEW ◀──▶ RELEARNING
```

- **New**: Never reviewed. First rating sets initial stability and difficulty.
- **Learning**: Short intervals (1m / 5m / 10m). Graduates to Review on Good/Easy.
- **Review**: Spaced intervals (days to months to years). Rating Again sends to Relearning.
- **Relearning**: Back to short intervals until recovered, then returns to Review.

### Ratings

| Rating | Key | Effect |
|--------|-----|--------|
| **Again** | 1 | Complete blackout. Drops stability, increments lapse counter. |
| **Hard** | 2 | Recalled with significant difficulty. Small stability increase with hard penalty. |
| **Good** | 3 | Correct with some hesitation. Standard stability increase. |
| **Easy** | 4 | Perfect recall. Large stability increase with easy bonus. |

### Per-Card Metrics

| Metric | Range | What It Means |
|--------|-------|---------------|
| **Stability** | 0.1+ | How long the memory lasts. Higher = longer intervals between reviews. |
| **Difficulty** | 1-10 | How hard the card is *for you*. Derived from your ratings, not the content. Mean-reverts toward ~7.2 so it doesn't swing wildly. |
| **Lapses** | 0+ | Number of times you forgot (rated Again from Review state). High lapses = "leech" card. |

### How Intervals Are Calculated

```
interval = stability x (81/19) x (target_retention^(-2) - 1)
```

- **Target retention** is 90% — the algorithm schedules reviews so you have a 90% chance of remembering.
- Higher stability = longer intervals.
- Maximum interval is capped at 100 years.

### How Difficulty Evolves

Difficulty is set on your **first review** based on your rating:
- Easy first rating → difficulty ~1.5
- Again first rating → difficulty ~7.0

After each review, difficulty adjusts based on your rating but **mean-reverts** toward the default (~7.2), so it converges over time rather than swinging wildly. Cards you consistently struggle with drift higher; cards you consistently nail drift lower.

New cards have **no difficulty** — it's null until you first review them.

### Filtered Decks (Cram Sessions)

Filtered decks snapshot a set of cards into a fixed queue at creation time. Unlike regular reviews:

- **No daily quotas** — it's a linear queue you work through.
- **Cards rated Again get re-queued** — appended to the end so you keep seeing them until you get them right.
- **Reviews still update SRS state** — stability, difficulty, and due dates are updated normally.
- **Can be reset** to re-review the same set.

Filter options: topics, subtopics, tags, state, importance, quality, difficulty range, and sort order (due date, most difficult, most lapses, random).

### Regular Reviews vs Filtered Decks

| Aspect | Regular Reviews | Filtered Decks |
|--------|----------------|----------------|
| Card selection | Dynamic — all cards due now | Fixed at creation |
| Order | By due date | Configurable (due date, difficulty, lapses, random) |
| Again behavior | Card gets short interval, appears when due | Card re-appended to end of queue |
| Completion | Never — cards keep coming back | Done when queue is cleared |
| Use case | Daily spaced repetition | Cramming, topic review, exam prep |

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Images**: AWS S3
- **Algorithm**: FSRS-4.5 (TypeScript port)
