---
type: project note
project: SRS Tool
status: active
tags: [work, project, education, board-exam, planning]
MoC: "[[SRS Tool - MoC]]"
base: "[[00_Project Notes.base]]"
date_created: 2026-01-18
---
> Migration plan: Obsidian-first → Web-first architecture
---
## Architecture Overview
```
┌─────────────────────┐
│   PDF Pipeline      │  (local Python script)
│   - Extract slides  │
│   - Generate cards  │
│   - Upload to S3    │
│   - Write to Supa   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│     Supabase        │◀───▶│   Vercel Frontend   │
│  - cards table      │     │   - Review UI       │
│  - reviews table    │     │   - Filtered decks  │
│  - decks table      │     │   - Stats dashboard │
│  - auth (built-in)  │     │   - Simple auth     │
└─────────────────────┘     └─────────────────────┘
          │
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│     AWS S3          │     │   Obsidian Vault    │
│  - Slide images     │     │   - Reference notes │
│  - Occlusion imgs   │     │   - Interlinked     │
│  (already set up)   │     │   - No cards/embeds │
└─────────────────────┘     └─────────────────────┘
```
---
## Database Schema (Supabase)
### cards
```sql
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id TEXT UNIQUE NOT NULL,  -- 8-char hex for display
  card_type TEXT NOT NULL,       -- 'qa', 'cloze', 'occlusion'

  -- Content
  question TEXT,
  answer TEXT,
  cloze_text TEXT,
  blocked_image TEXT,            -- S3 URL
  reveal_image TEXT,             -- S3 URL

  -- Breadcrumbs (for linking to Obsidian reference)
  topic TEXT,
  subtopic TEXT,
  source_pdf TEXT,
  obsidian_note TEXT,            -- e.g., "Cervical Cytology" for [[Cervical Cytology]]

  -- FSRS state
  stability REAL DEFAULT 0,
  difficulty REAL DEFAULT 0,
  due_date TIMESTAMPTZ,
  last_review TIMESTAMPTZ,
  review_count INT DEFAULT 0,
  lapses INT DEFAULT 0,
  state TEXT DEFAULT 'new',      -- new, learning, review, relearning, suspended

  -- Metadata
  tags TEXT[],
  flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cards_due ON cards(due_date);
CREATE INDEX idx_cards_state ON cards(state);
CREATE INDEX idx_cards_topic ON cards(topic);
```
### reviews
```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id TEXT REFERENCES cards(card_id),
  rating INT NOT NULL,           -- 1-4
  time_taken_ms INT,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Snapshot before review
  prev_stability REAL,
  prev_difficulty REAL,
  prev_state TEXT
);

CREATE INDEX idx_reviews_card ON reviews(card_id);
CREATE INDEX idx_reviews_date ON reviews(reviewed_at);
```
### filtered_decks
```sql
CREATE TABLE filtered_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,

  -- Filter config
  filter_topics TEXT[],
  filter_tags TEXT[],
  filter_states TEXT[],
  max_cards INT,

  -- Progress (card_ids in order, position)
  card_queue TEXT[],             -- Array of card_ids
  current_position INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
---
## API Endpoints (Vercel API Routes)
### Review Flow
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/due` | Get count of due cards |
| GET | `/api/next` | Get next card for review |
| POST | `/api/review` | Submit rating, get next card |
| GET | `/api/stats` | Dashboard statistics |
### Card Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cards/{id}/suspend` | Suspend (abandon) card |
| POST | `/api/cards/{id}/flag` | Flag for editing |
| GET | `/api/cards` | List cards (with filters) |
### Filtered Decks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/decks` | List all decks with progress |
| POST | `/api/decks` | Create filtered deck |
| GET | `/api/decks/{id}/next` | Get next card from deck |
| DELETE | `/api/decks/{id}` | Delete deck |
| POST | `/api/decks/{id}/reset` | Reset deck progress |
### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (Supabase auth) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
---
## Frontend Pages
### `/` - Review Page (main)
- Card display with flip animation
- Rating buttons (Again, Hard, Good, Easy)
- Abandon / Flag buttons
- Breadcrumb display: `Cytology → Cervical Cytology`
- "Open in Obsidian" link (obsidian://open?vault=...)
- Progress bar for filtered decks
- Keyboard shortcuts
### `/decks` - Deck Manager
- List ongoing filtered decks with progress bars
- Create new filtered deck:
  - Select topics (multi-select)
  - Select tags (multi-select)
  - Filter by state (new, learning, review)
  - Limit card count
- Resume / Reset / Delete decks
### `/stats` - Dashboard
- Cards reviewed today
- Retention rate
- Cards by state (pie chart)
- Upcoming due forecast
- Topic breakdown
### `/login` - Auth
- Simple email/password
- Single user (you)
---
## PDF Pipeline Updates
### Changes to card generation:
1. **Remove markdown file output** - no more `.md` files with cards
2. **Write directly to Supabase** - insert cards to database
3. **Keep S3 for images** - already working
4. **Generate Obsidian reference note** - clean note without card syntax
### Reference Note Format (Obsidian):
```markdown
---
type: reference-note
topic: Cytology
subtopic: Cervical Cytology
source: Cervical-cytology.pdf
date_created: 2026-01-18
---
# Cervical Cytology
Source: [[Cervical-cytology.pdf]]
---
## Slides
### Superficial Cells
![[slide_01.jpg]]
- Polygonal shape
- Pyknotic nucleus
- Abundant cytoplasm
### Intermediate Cells
![[slide_02.jpg]]
- Larger nucleus
- Vesicular chromatin
---
## Key Concepts
- Bethesda System classification
- [[LSIL]] vs [[HSIL]] criteria
- [[Koilocytes]] indicate HPV
```
No `## Cards` section - cards live in Supabase only.
---
## Migration Steps
### Phase 1: Setup ✅
- [x] Create Supabase project
- [x] Create database tables (schema above)
- [ ] Set up Supabase auth (single user)
- [x] Create Vercel project (Next.js ready)
- [ ] Deploy to Vercel (needs GitHub push)
### Phase 2: Core Review ✅
- [x] Port `fsrs.py` to TypeScript
- [x] Create API routes for review flow
- [x] Build review UI in React/Next.js
- [ ] Test review flow end-to-end
### Phase 3: Filtered Decks ✅
- [x] Deck creation UI
- [x] Deck progress tracking
- [x] Resume functionality
### Phase 4: PDF Pipeline Update ✅
- [x] Update generator to write to Supabase (`supabase_generator.py`)
- [x] Generate clean Obsidian reference notes
- [ ] Test full pipeline
### Phase 5: Polish
- [x] Stats dashboard (basic)
- [x] Mobile PWA support (manifest added)
- [ ] Obsidian URI links
---
## Tech Decisions
| Component | Choice | Reason |
|-----------|--------|--------|
| Frontend | Next.js 14 | Vercel native, API routes built-in |
| Styling | Tailwind | Fast, matches current dark theme |
| Database | Supabase (Postgres) | Free tier, built-in auth, realtime |
| Auth | Supabase Auth | Simple, secure, no extra setup |
| FSRS | TypeScript port | Runs in API routes, no Python needed |
| Hosting | Vercel | Free tier, instant deploys |
| Images | AWS S3 | Already set up, working |
---
## What Stays in Obsidian
- Reference notes with interlinks
- Study notes
- Slide images (embedded)
- Knowledge graph connections
- PDF annotations
## What Moves to Web
- All flashcards
- Review state (FSRS)
- Filtered decks
- Review history
- Statistics
---
## Environment Variables (Vercel)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx  # for PDF pipeline
```
---
## Related
- [[SRS Tool - MoC]]
- [[SRS Tool - Development Plan]]
- [[SRS Tool - Technical Spec]]
