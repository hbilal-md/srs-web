# SRS Web — Roadmap

> Long-term vision, feature roadmap, and ecosystem plans.
> For current architecture see [SPEC.md](./SPEC.md). For sprint tracking see [PROGRESS.md](./PROGRESS.md).

---

## Vision

SRS Web ("The Dojo") is one app in a personal productivity ecosystem of 2–3 apps:

| App | Codename | Purpose |
|-----|----------|---------|
| **SRS Web** | The Dojo | Spaced repetition for board exam prep and lifelong learning |
| **Task Manager** | Zen Garden | Project planning — daily/weekly/monthly task management |
| **Habit Tracker** | *(TBD)* | Long-term consistency tracking across habits |

All three apps share a **Supabase backend** with a **unified gamification layer**. The goal is to replace commercial apps with personalized tools that do exactly what's needed — and turn daily productivity into a game worth playing.

**Design philosophy:** Functionality first, theming later. The Dojo aesthetic will be applied to SRS Web when the gamification layer is ready.

---

## Gamification Layer (Cross-App)

A shared system across all ecosystem apps, inspired by factory-style games (Factorio, Satisfactory):

### Streaks
- Daily review streaks (don't-break-the-chain)
- Streak freezes for rest days
- Visual streak counter on dashboard

### XP & Leveling
- Earn XP from reviews, completed tasks, maintained habits
- RPG-style level progression
- XP multipliers for streaks and consistency

### Badges & Accolades
- Milestone rewards: "1,000 Reviews", "30-Day Streak", "100% Retention Week"
- Volume badges: repeated actions recognized and celebrated
- AI-generated assets (Nano Banana or similar) for sprites, badges, pips

### Deep Stats
- Cross-app analytics dashboard
- Activity heatmaps, trend lines, personal records
- Data-driven motivation — see the numbers, chase the improvements

---

## SRS Features Roadmap

### Near-Term (Current Sprint)

| Feature | Priority | Notes |
|---------|----------|-------|
| Fix review page auto-scroll on reveal | High | `height: 100dvh` fix — usability blocker |
| Fix iPad occlusion image clipping | High | Replace breakout centering hack — usability blocker |
| Rating button redesign | Medium | Transparent + colored border, fill on press, half height |
| Deck management overhaul | Medium | Three-dot menu on home, full-page `/decks/new`, deprecate `/decks` |

### Medium-Term

| Feature | GitHub Issue | Notes |
|---------|-------------|-------|
| **Review Heatmap** | #12 | GitHub-style contribution grid — daily review activity over months |
| **Leech Detection** | #10 | Auto-flag cards with high lapse counts, action options (suspend, reset, edit) |
| **Session Summaries** | — | Post-session stats: cards reviewed, accuracy, time spent, streaks, XP earned |
| **Notifications** | — | Daily review reminders, streak-at-risk alerts (push/browser) |
| **Thin API Client** | #7 | Replace inline `fetch()` calls with a typed client layer |
| **Loading & Error States** | #8 | Proper error handling throughout (loading dots partially done) |

### Medium-Term (Pipeline & Scale)

| Feature | GitHub Issue | Notes |
|---------|-------------|-------|
| **Pipeline Reorganization** | — | Compartmentalize Python card-creation scripts in `pipelines/` with shared utilities |
| **Card Ingestion Dashboard** | #13, #5, #4, #3 | Frontend UI to upload PDFs, select a processing pipeline, auto-generate cards |

> **Priority shift:** Card volume is the bottleneck now that the review UI is dialing in. The ingestion dashboard is needed once 2-3 pipeline frameworks are working and battle-tested. Pipeline reorg comes first.

### Long-Term

| Feature | GitHub Issue | Notes |
|---------|-------------|-------|
| **Retention Curves** | #12 | Actual vs target retention rate trends over time |
| **Unit & Integration Tests** | #14 | FSRS algorithm + API route test coverage |
| **Dojo Theming** | #19 | Apply game-world aesthetics when gamification layer is ready |

### Deprioritized

| Feature | GitHub Issue | Notes |
|---------|-------------|-------|
| Bluetooth gamepad support | #15 | Not in current roadmap |
| Move migrations to folder | #9 | Already done — close this issue |

---

## Card Creation Pipelines (Detail)

### Architecture

```
pipelines/
├── shared/              Reusable: S3 storage, Supabase writer, data models
├── kurts_notes/         Framework #1: structured slide-based PDFs (Kurt's notes)
├── textbook/            Framework #2: dense reference text chapters (planned)
├── lecture_notes/       Framework #3: slide-based lecture content (planned)
└── archive/             Legacy code + original planning docs
```

All pipelines share:
- `shared/s3_storage.py` — S3ImageStorage (upload, dedup by content hash, obfuscated keys)
- `shared/supabase_writer.py` — SupabaseCardWriter (batch insert, card ID generation)
- `shared/models.py` — CardData, TextSpan dataclasses

### Kurt's Notes Pipeline (Framework #1 — Active)

The existing pipeline processes structured PDF slides into occlusion + text cards:

```
PDF → Extract slides → OCR text spans → AI classify (skip low-value)
    → AI generate cards → Create blocked images → Upload to S3 → Insert to Supabase
    → Generate Obsidian reference note + MoC
```

**Key tech:** PyMuPDF (slide extraction + OCR), OpenAI (classification + card generation), Pillow (image blocking), boto3 (S3), supabase-py

### Planned Pipelines

| Pipeline | Source Material | Status | Approach |
|----------|----------------|--------|----------|
| Kurt's Notes | Structured PDF slides | **Active** — reorganized in `pipelines/kurts_notes/` |  OCR + AI slide analysis |
| Textbook Chapters | Dense reference text | Planned | Text extraction + AI summarization → Q/A + cloze |
| Lecture Notes | Slide-based content | Planned | Similar to Kurt's Notes but different slide layouts |
| Journal Articles | Research papers | Planned | Abstract/methods/results extraction → targeted cards |
| Plain Markdown | Free-form notes | Planned | Parse markdown structure → cards from headers/lists |

### Ingestion Dashboard (Frontend — After Pipelines Stabilize)

Once 2-3 pipeline frameworks are working reliably:

```
Next.js Frontend → API Route → Python Pipeline Service → Cards in Supabase
```

- Upload PDF in browser, select pipeline type
- Pipeline runs as a backend service (FastAPI on Railway/Fly.io or similar)
- Frontend shows progress, generated cards for review/approval before insertion

---

## Infrastructure

| Area | Current | Future |
|------|---------|--------|
| Database | Supabase (free tier) | Supabase (paid) — shared across all ecosystem apps |
| Hosting | Vercel (free tier) | Vercel (paid) — as traffic/build needs grow |
| Media | AWS S3 | AWS S3 (same) |
| Pipelines | Local Python scripts | Backend service (FastAPI on Railway/Fly.io) for ingestion dashboard |
| CI/CD | Vercel auto-deploy from GitHub | Same |
| Image Gen | — | AI tools (Nano Banana etc.) for gamification assets |

Willing to invest in paid plans — personal tools > third-party subscriptions.

---

## Open Issues → Roadmap Mapping

| Issue | Maps To |
|-------|---------|
| [#1](https://github.com/hbilal-md/srs-web/issues/1) UI improvements | Current sprint (near-term) |
| [#3](https://github.com/hbilal-md/srs-web/issues/3) Process more Kurt's notes | Card Ingestion Dashboard |
| [#4](https://github.com/hbilal-md/srs-web/issues/4) JH Interesting Case bot | Card Ingestion Dashboard |
| [#5](https://github.com/hbilal-md/srs-web/issues/5) CP Compendium parser | Card Ingestion Dashboard |
| [#7](https://github.com/hbilal-md/srs-web/issues/7) Thin API client layer | Medium-term |
| [#8](https://github.com/hbilal-md/srs-web/issues/8) Loading states & error handling | Medium-term |
| [#9](https://github.com/hbilal-md/srs-web/issues/9) Move migrations to folder | Done — close |
| [#10](https://github.com/hbilal-md/srs-web/issues/10) Leech detection | Medium-term |
| [#12](https://github.com/hbilal-md/srs-web/issues/12) Study statistics & analytics | Medium-term (heatmap first) |
| [#13](https://github.com/hbilal-md/srs-web/issues/13) In-app card editor | Card Ingestion Dashboard |
| [#14](https://github.com/hbilal-md/srs-web/issues/14) Unit & integration tests | Long-term |
| [#15](https://github.com/hbilal-md/srs-web/issues/15) Bluetooth gamepad | Deprioritized |
| [#19](https://github.com/hbilal-md/srs-web/issues/19) Gamification | Cross-app gamification layer |
