---
type: project note
project: SRS Tool
status: active
tags: [work, project, education, board-exam, planning]
MoC: "[[SRS Tool - MoC]]"
base: "[[00_Project Notes.base]]"
date_created: 2026-01-18
---
> Phased build plan with tasks and dependencies
---
## Phase 1: Core Engine ✅
**Goal:** Parse cards, implement FSRS, store state in SQLite.
### Card Parser ✅
- [x] Parse markdown files for `## Cards` section
- [x] Extract card ID from `<!-- card:xyz -->` comments
- [x] Parse Q/A cards (`Q:` / `A:` format)
- [x] Parse cloze cards (`C:` with `[brackets]`)
- [x] Extract images embedded in cards (local + remote URLs)
- [x] Generate new card IDs for cards without them
- [x] Compute content hash for edit detection
### FSRS Implementation ✅
- [x] Port FSRS-4.5 algorithm
- [x] Implement scheduling calculation
- [x] Handle rating inputs (Again, Hard, Good, Easy)
- [x] Calculate next review date
- [ ] Unit tests for edge cases
### SQLite Database ✅
- [x] Create schema (cards, reviews, filtered_decks, sync_state)
- [x] Card CRUD operations
- [x] Review logging
- [x] Query cards by due date
- [x] Query cards by tags/folders
### File Watcher ✅
- [x] Watch vault directory for changes
- [x] Detect new/modified/deleted markdown files
- [x] Re-parse changed files
- [x] Update database on file changes
- [ ] Handle Obsidian Sync conflicts gracefully
### Metadata Inheritance ✅
- [x] Parse note YAML frontmatter
- [x] Inherit tags, topic, subtopic to cards
- [x] Store inherited metadata in database
---
## Phase 2: Review Web UI
**Goal:** Functional review interface accessible from iPad.
### Backend API (FastAPI)
- [ ] `GET /api/due` - Get due cards count
- [ ] `GET /api/next` - Get next card for review
- [ ] `POST /api/review` - Submit rating, return next card
- [ ] `GET /api/stats` - Review statistics
- [ ] `GET /api/tags` - List all tags
- [ ] `GET /api/folders` - List note folders
### Frontend
- [ ] **Wireframe:** Card display layout (question/answer)
- [ ] **Wireframe:** Rating buttons (Again, Hard, Good, Easy)
- [ ] **Wireframe:** Progress indicator
- [ ] Card flip animation
- [ ] Image rendering in cards
- [ ] Cloze card rendering (hide brackets)
- [ ] Mobile-responsive design
- [ ] Touch-friendly buttons for iPad
### Server Setup
- [ ] Run with `srs serve`
- [ ] Configurable port
- [ ] Tailscale-accessible from iPad
---
## Phase 3: Filtered Decks
**Goal:** Create and persist filtered review sessions.
### Filter Engine
- [ ] Filter by tags (multi-select)
- [ ] Filter by folder/file path
- [ ] Filter by card state (new, learning, review)
- [ ] Filter by difficulty
- [ ] Filter by last-wrong
- [ ] Limit by count
- [ ] Sort options (random, due date, difficulty)
### Deck Persistence
- [ ] Save filtered deck configuration
- [ ] Store card queue (ordered list)
- [ ] Track current position
- [ ] Resume from where you left off
- [ ] Mark deck complete when finished
### UI
- [ ] **Wireframe:** Filter panel with options
- [ ] **Wireframe:** Active decks list with progress bars
- [ ] Create new filtered deck
- [ ] Resume existing deck
- [ ] Preview matching card count before starting
---
## Phase 4: PDF Card Generation ✅
**Goal:** Generate cards from PDFs with AI assistance.
### PDF Processing ✅
- [x] Render PDF pages as images (PyMuPDF)
- [x] Split pages into slides by horizontal line detection
- [x] OCR text extraction with formatting (bold, italic, color)
- [ ] Batch processing with save points
- [ ] Resume interrupted processing
- [x] Progress reporting
### Smart Occlusion ✅
- [x] Word-level text extraction with bounding boxes
- [x] AI selects which words to occlude (GPT-4o vision)
- [x] Proportional occlusion based on content density
- [x] Formatting-aware (prioritize highlighted text)
- [x] Generate blocked images with precise text hiding
### Image Storage ✅
- [x] Local storage with content-hash deduplication
- [x] S3 storage with obfuscated filenames (128-bit entropy)
- [x] Automatic content-type detection
### Card Generation ✅
- [x] Generate occlusion cards (blocked/reveal images)
- [x] Generate Q/A cards from slide content
- [x] Generate cloze cards
- [x] Generate unique card IDs
### Output ✅
- [x] Assemble markdown with YAML frontmatter
- [x] card_count in YAML
- [x] Reference slides section at top
- [x] Cards section with plain links (not embedded)
- [x] MoC generation for topic folders
### CLI
- [ ] `srs generate --input "file.pdf" --output "folder/" --topic "Topic Name"`
- [ ] Progress output
- [ ] Resume capability
---
## Phase 5: Polish & Quality of Life
**Goal:** Smooth out rough edges, improve usability.
### Stats Dashboard
- [ ] Cards reviewed today
- [ ] Streak tracking
- [ ] Retention rate
- [ ] Cards by state (new, learning, review)
- [ ] Upcoming due cards forecast
### Review Enhancements
- [ ] Keyboard shortcuts (1-4 for ratings, space to flip)
- [ ] Undo last rating
- [ ] Skip card (don't update state)
- [ ] Link to source note in Obsidian
### Card Management
- [ ] List all cards via CLI
- [ ] Search cards by content
- [ ] Bulk operations (reset, suspend)
### Error Handling
- [ ] Graceful handling of malformed cards
- [ ] Sync conflict resolution
- [ ] API error recovery in generation
---
## Dependencies
```
Phase 1 (Core Engine)
    │
    ├── Phase 2 (Review UI)
    │       │
    │       └── Phase 3 (Filtered Decks)
    │
    └── Phase 4 (PDF Generation) [can run in parallel]

Phase 5 (Polish) depends on all above
```
---
## Technical Stack
| Component | Technology |
|-----------|------------|
| Language | Python 3.10+ |
| Web framework | FastAPI |
| Database | SQLite |
| PDF processing | PyMuPDF |
| Image handling | Pillow |
| Vision API | OpenAI GPT-4o |
| Cloud storage | AWS S3 (boto3) |
| File watching | watchdog |
| Frontend | Vanilla JS or Alpine.js |
---
## File Structure
```
srs-tool/
├── srs/
│   ├── __init__.py
│   ├── cli.py              # CLI entry point
│   ├── server.py           # FastAPI app
│   ├── fsrs.py             # FSRS algorithm
│   ├── parser.py           # Markdown parsing
│   ├── database.py         # SQLite operations
│   ├── watcher.py          # File change detection
│   ├── filtered.py         # Filtered deck logic
│   └── generate/
│       ├── __init__.py
│       ├── pdf.py          # PDF to images
│       ├── vision.py       # OpenAI vision calls
│       ├── s3.py           # S3 upload
│       └── prompts.py      # LLM prompts
├── static/
│   ├── style.css
│   └── app.js
├── templates/
│   └── review.html
├── tests/
│   ├── test_parser.py
│   ├── test_fsrs.py
│   └── test_filtered.py
├── pyproject.toml
└── README.md
```
---
## Milestones
| Milestone | Deliverable | Phase |
|-----------|-------------|-------|
| M1 | Card parser + FSRS working | 1 |
| M2 | SQLite state persistence | 1 |
| M3 | Basic web review UI | 2 |
| M4 | Mobile-responsive UI | 2 |
| M5 | Filtered decks working | 3 |
| M6 | Persistent filtered decks | 3 |
| M7 | PDF image extraction | 4 |
| M8 | Full card generation pipeline | 4 |
| M9 | Stats and polish | 5 |
---
## Related
- [[SRS Tool - Vision]] - Design decisions
- [[SRS Tool - Technical Spec]] - Detailed architecture
- [[SRS Tool - MoC]] - Main navigation
