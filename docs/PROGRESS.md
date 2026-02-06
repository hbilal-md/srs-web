# SRS Web — Progress Tracker

Last updated: **2026-02-05**

---

## Current Sprint: UI Improvements (#1)

Branch: `issue-1-ui-improvements` | PR: [#20](https://github.com/hbilal-md/srs-web/pull/20)

### Completed

- [x] **Home page redesign** — Quick 10 hero deck, filtered deck grid with tags/progress, staggered animations
- [x] **Quick 10 mode** — `/review?mode=quick10` fetches 10 random due cards, completion screen with "Another 10"
- [x] **API: multi-card fetch** — `/api/next` supports `limit`, `random`, `cardId` params
- [x] **Review page redesign** — Minimal layout with fixed progress bar, compact header, image-first occlusion
- [x] **Image preloading** — Both blocked + reveal images load simultaneously, crossfade on reveal (no choppy swap)
- [x] **Refined rating buttons** — Subtle bordered cards with accent lines, replaces chunky colored blocks
- [x] **Discreet action buttons** — Suspend/Flag/Undo as muted text links
- [x] **Undo preserved** — Z shortcut, tappable hint, undo button in action row all intact after redesign
- [x] **Occlusion image sizing** — Portrait: 100% width. Landscape/wide (>=768px): 90vw breakout
- [x] **Dark theme refinement** — New CSS variables (--bg-tertiary, --accent-green-dim, rating palette)

### Known Issues (Testing)

- [ ] Review page — needs testing pass for edge cases (TBD from manual testing)
- [ ] Occlusion image stacking — verify crossfade works on slow connections
- [ ] Quick 10 with fewer than 10 due cards — verify graceful handling
- [ ] Undo in Quick 10 mode — may need special handling (queue re-insertion)

### Not Started (This Sprint)

- [ ] Deck review page (`/decks/[id]`) — has not been redesigned yet, still uses old layout

---

## Merged (Previous Work)

| PR | Feature | Date |
|----|---------|------|
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
| [#1](https://github.com/hbilal-md/srs-web/issues/1) | UI improvements | Current sprint — review page redesign in progress |
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

### Content Pipeline

| Issue | Title | Notes |
|-------|-------|-------|
| [#5](https://github.com/hbilal-md/srs-web/issues/5) | CP Compendium parser | New card source |
| [#4](https://github.com/hbilal-md/srs-web/issues/4) | JH Interesting Case bot | New card source |
| [#3](https://github.com/hbilal-md/srs-web/issues/3) | Process more Kurt's notes | Expand existing cards |

### Closed

| Issue | Title |
|-------|-------|
| [#11](https://github.com/hbilal-md/srs-web/issues/11) | ~~Undo last review~~ |
| [#2](https://github.com/hbilal-md/srs-web/issues/2) | ~~Spaced Repetition Algorithm~~ |

---

## What to Test After Resuming

1. **Occlusion cards** — Do both images preload? Is the crossfade smooth? Any layout shift?
2. **Q/A cards** — Text centered? Answer reveal animation working? Divider visible?
3. **Cloze cards** — `[...]` placeholder correct? Green highlight on reveal?
4. **Quick 10 mode** — Starts correctly? Progress bar tracks? Completion screen works?
5. **Undo** — Z shortcut works? Tappable hint in footer? Undo button in action row?
6. **Rating buttons** — Accent line appears on hover? Interval text readable? Keyboard 1-4 works?
7. **Mobile** — Touch targets large enough? Safe area padding on notch phones? No horizontal overflow?
8. **Normal review mode** — Remaining count correct? Stats update after rating? Progress bar moves?

---

## Architecture Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-05 | Preload both images, crossfade via CSS opacity | Reveal image was loading from scratch on tap, causing visible delay |
| 2026-02-05 | No card container for occlusion type | Image should feel like it *is* the screen — maximizes display area |
| 2026-02-05 | Fixed 2px progress bar at viewport top | Saves vertical space vs inline progress bar |
| 2026-02-05 | Rating buttons as bordered cards (not solid color) | Matches minimalist aesthetic, accent line hints at color |
| 2026-02-05 | Action buttons as text links | Suspend/Flag/Undo are secondary actions, shouldn't compete with ratings |
