# SRS Web — Progress Tracker

Last updated: **2026-02-07** | See also: [SPEC.md](./SPEC.md) · [ROADMAP.md](./ROADMAP.md)

---

## Current Sprint: Testing & Polish

Focus: End-to-end testing of the new filtered deck system, then new pipeline frameworks.

### Todo

- [ ] Test filtered deck flow end-to-end (create deck → review → session limits → all caught up)
- [ ] Delete old "Cyto effusion" deck (created before overhaul, lacks session data)
- [ ] Introduce additional pipeline framework(s) (textbook chapters, lecture notes, etc.)

### Remaining UI Polish (Lower Priority)

- [ ] Occlusion image stacking — verify crossfade works on slow connections
- [ ] Quick 10 with fewer than 10 due cards — verify graceful handling

---

## Completed: Filtered Deck Overhaul + Pipeline Improvements + DB Access (#2)

Branch: `issue-1-ui-improvements` | **2026-02-07**

### Filtered Deck Overhaul
- [x] Replace static position-based playlist with dynamic session queue
- [x] Priority queue: learning due → review due → new cards
- [x] Per-session limits (`new_per_session`, `review_per_session`) configurable at deck creation
- [x] Daily counter auto-reset via `last_session_date`
- [x] `cards_introduced` tracking (introduction → review lifecycle)
- [x] Session stats bar (New: x/y | Due: x/y | Learning: x)
- [x] "All caught up" screen with next due time instead of "Deck Complete"
- [x] Card type badges (new/review/learning) on review page
- [x] Migration 005 applied (session tracking columns)

### FSRS Interval Tuning
- [x] AGAIN: 1 minute (stays in learning)
- [x] HARD: 10 minutes (stays in learning)
- [x] GOOD: FSRS-calculated (~3 days for new, graduates to review)
- [x] EASY: FSRS-calculated (~15 days for new, graduates to review)

### Pipeline Tag Simplification
- [x] Dropped LLM-generated content tags (too granular, inconsistent)
- [x] Tags now: topic + subtopic + source (2–3 per card)
- [x] Removed TAG GENERATION section from LLM prompt
- [x] Pipeline comprehensiveness documented in `pipelines/kurts_notes/README.md`
- [x] Obsidian note generation removed (no longer needed)

### Database Access
- [x] Supabase MCP server configured (`.mcp.json`)
- [x] Supabase Management API confirmed working for DDL/queries
- [x] Migration 005 run via Management API
- [x] Supabase best practices skill installed
- [x] `.mcp.json` added to `.gitignore`

---

## Completed: UI Improvements Sprint (#1)

Branch: `issue-1-ui-improvements` | PRs: #20, #21 | **Merged 2026-02-06**

- [x] Home page redesign — Quick 10 hero deck, filtered deck grid with tags/progress
- [x] Quick 10 mode — `/review?mode=quick10` fetches 10 random due cards
- [x] API: multi-card fetch — `/api/next` supports `limit`, `random`, `cardId` params
- [x] Review page redesign — Minimal layout with fixed progress bar, image-first occlusion
- [x] Image preloading — Both blocked + reveal images load simultaneously, crossfade on reveal
- [x] Dark theme refinement — CSS variables (--bg-tertiary, --accent-green-dim, rating palette)
- [x] Undo preserved — Z shortcut, tappable hint, undo button in action row
- [x] **Fix: review page auto-scroll** — Locked shell to `height: 100dvh` with `overflow: hidden`
- [x] **Fix: iPad image clipping** — Replaced breakout hacks with `max-width: 90vw; margin: 0 auto` centered container
- [x] **Fix: card centering** — Added `margin: 0 auto` to `.review-card` so all card types center properly
- [x] **Rating button redesign** — Transparent body + colored border (rating color), fill on press, compact single-row layout
- [x] **Deck management overhaul** — Three-dot overflow menu (Reset/Delete) on home page deck cards
- [x] **Full-page deck creation** — `/decks/new` replaces the old modal in `/decks`
- [x] **Back links fixed** — Deck review pages now link back to home (`/`) not `/decks`
- [x] **Pipeline reorganization** — `srs_card_gen/` restructured into `pipelines/` with shared utilities
- [x] **Docs** — Updated SPEC.md, PROGRESS.md; created ROADMAP.md

---

## Merged (All PRs)

| PR | Feature | Date |
|----|---------|------|
| #21 | UI fixes, deck management, pipelines & docs | 2026-02-06 |
| #20 | Home page redesign + Quick 10 | 2026-02-05 |
| #18 | Make undo hint tappable for mobile | 2026-02-05 |
| #17 | Add undo last review with Z shortcut | 2026-02-05 |
| #16 | Reduce answer font + expand occlusion images | 2026-02-05 |
| #6 | Redesign filtered deck creator + AGAIN re-queue | 2026-02-05 |

---

## Open GitHub Issues

### High Priority

| Issue | Title | Notes |
|-------|-------|-------|
| [#3](https://github.com/hbilal-md/srs-web/issues/3) | Process more Kurt's notes | Current focus — pipeline fixes needed |
| [#5](https://github.com/hbilal-md/srs-web/issues/5) | CP Compendium parser | New pipeline framework |
| [#4](https://github.com/hbilal-md/srs-web/issues/4) | JH Interesting Case bot | New pipeline framework |
| [#8](https://github.com/hbilal-md/srs-web/issues/8) | Loading states & error handling | Partially addressed (loading dots added), error handling still needed |
| [#7](https://github.com/hbilal-md/srs-web/issues/7) | Thin API client layer | Replace inline `fetch()` calls with a typed client |

### Medium Priority

| Issue | Title | Notes |
|-------|-------|-------|
| [#14](https://github.com/hbilal-md/srs-web/issues/14) | Unit & integration tests | FSRS algorithm + API routes |
| [#13](https://github.com/hbilal-md/srs-web/issues/13) | In-app card editor | Edit question/answer/tags without external tools |
| [#12](https://github.com/hbilal-md/srs-web/issues/12) | Study statistics & analytics | Detailed charts, heatmaps, retention curves |
| [#10](https://github.com/hbilal-md/srs-web/issues/10) | Leech detection | Flag cards with high lapse counts |

### Low Priority / Future

| Issue | Title | Notes |
|-------|-------|-------|
| [#19](https://github.com/hbilal-md/srs-web/issues/19) | Gamification | Streaks, badges, XP |
| [#15](https://github.com/hbilal-md/srs-web/issues/15) | Bluetooth gamepad support | Controller input for reviews |
| [#9](https://github.com/hbilal-md/srs-web/issues/9) | Move migrations to folder | Already done (migrations/ exists) — close this issue |

### Closed

| Issue | Title |
|-------|-------|
| [#1](https://github.com/hbilal-md/srs-web/issues/1) | ~~UI improvements~~ |
| [#11](https://github.com/hbilal-md/srs-web/issues/11) | ~~Undo last review~~ |
| [#2](https://github.com/hbilal-md/srs-web/issues/2) | ~~Spaced Repetition Algorithm~~ |

---

## What to Test After Resuming

1. **Filtered deck creation** — `/decks/new` with custom new/review per-session limits
2. **Session queue** — Learning cards appear first, then review, then new
3. **Per-session limits** — New cards stop at limit, review cards stop at limit
4. **Daily reset** — Counters reset to 0 on new day
5. **All caught up** — Shows next due time when no cards available
6. **Card types** — New/review/learning badges display correctly
7. **FSRS intervals** — AGAIN=1min, HARD=10min, GOOD=days, EASY=days
8. **Undo** — Reverses session counters and cards_introduced
9. **Pipeline** — `python -m kurts_notes.run /path/to/folder` with simplified tags
10. **Supabase MCP** — Restart Claude Code and verify MCP server connects

---

## Git Audit (2026-02-06)

Full audit completed 2026-02-05. Updated after PR #21 merge.

| Finding | Status |
|---------|--------|
| PR #21 merged — UI fixes, pipelines, docs all on main | OK |
| `issue-1-ui-improvements` branch merged | Can delete |
| `issue-11-undo-last-review` branch fully merged | Can delete |
| Local `main` may be behind `origin/main` | Run `git pull` |

---

## Architecture Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-05 | Preload both images, crossfade via CSS opacity | Reveal image was loading from scratch on tap, causing visible delay |
| 2026-02-05 | No card container for occlusion type | Image should feel like it *is* the screen — maximizes display area |
| 2026-02-05 | Fixed 2px progress bar at viewport top | Saves vertical space vs inline progress bar |
| 2026-02-05 | Rating buttons as bordered cards (not solid color) | Matches minimalist aesthetic, accent line hints at color |
| 2026-02-05 | Action buttons as text links | Suspend/Flag/Undo are secondary actions, shouldn't compete with ratings |
| 2026-02-05 | Undo feature confirmed working | Z shortcut + tappable hint + action row button — no changes needed |
| 2026-02-06 | Review shell → fixed `height: 100dvh` | Prevent auto-scroll when rating buttons appear after reveal |
| 2026-02-06 | Image centering → `max-width: 90vw; margin: 0 auto` | Simple centered container replaces breakout hacks. Uniform on all devices |
| 2026-02-06 | Card centering → `margin: 0 auto` on `.review-card` | All card types (Q/A, cloze, occlusion) center regardless of parent flex context |
| 2026-02-06 | Rating buttons → transparent + colored border | Fill on press for feedback, single-row layout (label + interval), half height |
| 2026-02-06 | Deck management → home page three-dot menu | Reset/Delete via overflow menu (⋮). `/decks` page deprecated, `/decks/new` for creation |
| 2026-02-06 | Pipeline reorganization | `srs_card_gen/` → `pipelines/` with shared utilities, Kurt's Notes as first framework |
| 2026-02-07 | Dynamic session queue for filtered decks | Replaced static position-based playlist. Priority: learning → review → new. Per-session limits |
| 2026-02-07 | FSRS learning intervals tuned | AGAIN=1min, HARD=10min, GOOD/EASY=FSRS-calculated (graduate to review) |
| 2026-02-07 | Tag simplification | Dropped LLM content tags. 2-3 tags per card: topic + subtopic + source |
| 2026-02-07 | Supabase MCP for DB access | `.mcp.json` at project root. Bypasses IPv6 psql issue. Used Management API for migration |
| 2026-02-07 | Obsidian notes removed | No longer generating reference notes — reviewing via image occlusion instead |
