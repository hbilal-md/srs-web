# SRS Web — Progress Tracker

Last updated: **2026-02-06** | See also: [SPEC.md](./SPEC.md) · [ROADMAP.md](./ROADMAP.md)

---

## Current Sprint: Card Ingestion Pipeline Improvements

Focus: Fix and extend the Kurt's Notes pipeline, then introduce new pipeline frameworks.

### Todo

- [ ] Kurt's Notes pipeline fixes (user has specific issues to address)
- [ ] Test pipeline end-to-end with new `pipelines/` structure
- [ ] Introduce additional pipeline framework(s) (textbook chapters, lecture notes, etc.)
- [ ] Deck review page (`/decks/[id]`) — has not been redesigned yet, still uses old layout

### Remaining UI Polish (Lower Priority)

- [ ] Occlusion image stacking — verify crossfade works on slow connections
- [ ] Quick 10 with fewer than 10 due cards — verify graceful handling

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

1. **Pipeline** — Does `python -m kurts_notes.run /path/to/folder` work end-to-end with the new structure?
2. **Occlusion cards** — Images centered on all devices? Crossfade smooth?
3. **All card types** — Q/A, cloze, occlusion all centered (margin: 0 auto)?
4. **Rating buttons** — Colored borders visible? Fill on press? Compact height?
5. **Deck management** — Three-dot menu works? Reset/Delete? Back links go home?
6. **Create deck** — `/decks/new` form works, redirects to home on success?

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
