---
type: project note
project: SRS Tool
status: active
tags: [work, project, education, board-exam]
MoC: "[[SRS Tool - MoC]]"
base: "[[00_Project Notes.base]]"
date_created: 2026-01-18
---
> Markdown-first SRS that lives in Obsidian, reviewed via webapp
---
## Why Build This
### The Problem with Existing Tools
**Anki:**
- Opaque database format
- Hard to version control
- WYSIWYG editing is clunky
- Plugin ecosystem is janky
**Mochi:**
- Better UI but verbose cloze syntax `{{1::text}}`
- Algorithm was weak until recently
- No note types for automation
**What we need:**
- Cards that are also readable study notes
- Lives in Obsidian vault (syncs automatically)
- Minimal friction for card creation
- Image-heavy support for pathology
- Mobile review on iPad
- Filtered decks for targeted study
---
## Core Design Decisions
### 1. Notes-First Format
Cards live at the bottom of study notes, not in separate files.
```markdown
---
type: study-note
topic: Thyroid FNA
subtopic: Bethesda III
tags: [cytology, thyroid, bethesda]
---
# Bethesda Category III: AUS/FLUS

[Readable notes content here...]

---
## Cards

<!-- card:f7a8b9c0 -->
Q: What is the ROM for Bethesda III?
A: 10-30%

<!-- card:d1e2f3a4 -->
C: Bethesda III has a [10-30%] risk of malignancy.
```
**Benefits:**
- Notes provide context when cards are confusing
- Poor card performance → read the note above
- Single file per topic, not scattered cards
- Obsidian renders cleanly
### 2. Hidden Card IDs
Each card has a unique ID in an HTML comment:
```markdown
<!-- card:a1b2c3d4 -->
Q: Question here
A: Answer here
```
- Invisible in Obsidian reading view
- Parser extracts for database linking
- ID persists through text edits
- Delete + recreate = new ID, fresh SRS state
### 3. FSRS Algorithm
Use [[FSRS]] instead of SM-2 (per [[SRS Tool - Hashcards Analysis]]).
- More accurate scheduling
- Better recall for less review time
- Same algorithm Anki uses now
### 4. Separate Content from State
| Storage | Contains |
|---------|----------|
| Markdown files | Note content, card text, card IDs, image URLs, captions |
| SQLite database | FSRS state, review history, filtered decks |
| S3 | Images (obscure filenames, no structure) |
**Why:** Markdown stays human-readable. Review state is machine-managed.
### 5. Cards Inherit Note Metadata
Cards automatically inherit from parent note YAML:
- `tags`
- `topic`
- `subtopic`
No need to tag each card individually.
---
## Image Handling for Pathology
### Storage
- Images uploaded to S3 with UUID filenames
- No organization needed in S3
- Markdown embeds URL + caption
```markdown
![](https://s3.../a1b2c3d4e5f6.jpg)
*Caption: Bethesda III showing nuclear enlargement with irregular contours*
```
### Image-Based Cards
```markdown
<!-- card:x1y2z3w4 -->
Q: What is the diagnosis?
![](https://s3.../a1b2c3d4e5f6.jpg)
A: Bethesda III (AUS/FLUS) - nuclear enlargement, irregular contours
```
### AI Generation from PDFs
Pipeline:
1. PDF pages rendered as images
2. Vision model identifies medically relevant images (excludes clip art)
3. Bounding box extraction and cropping
4. Upload cropped images to S3
5. Generate cards with image context
6. Output to Drafts folder for human review
---
## Review Modes
### Mode 1: SRS Queue
- System pulls cards due based on FSRS
- Default daily review
- "Trust the algorithm"
### Mode 2: Filtered Decks
- You specify: tags, folders, count, sort order
- Pull cards regardless of due date
- SRS state still updates from reviews
- **Persistent:** Can do 300 cards over multiple sessions
**Use cases:**
- Night before exam: 200 cards on specific topic
- Weak area drill: Cards you got wrong recently
- New material: Unseen cards from recent notes
---
## Review Interface
### Webapp on Local Server
- FastAPI backend
- Mobile-responsive frontend
- Access via Tailscale from iPad
- File watcher syncs Obsidian edits
### Edit Flow
1. Review card on iPad
2. Notice error
3. Open Obsidian, edit markdown
4. Obsidian Sync pushes change
5. Server detects file change
6. Next review shows corrected card
---
## Anti-Hallucination for AI Generation
When generating cards from PDFs:
- LLM instructed to ONLY use source content
- No added facts, statistics, or explanations
- Exact terminology from source
- Source citations in comments for verification
```markdown
<!-- card:a1b2c3d4 -->
Q: What is the ROM for Bethesda III?
A: 10-30%
<!-- Source: "ROM 10-30%" (page 12) -->
```
---
## What This Is NOT
- Not an Anki replacement for everyone
- Not trying to support shared decks or social features
- Not optimizing for streaks or gamification
- Not building a native mobile app (webapp is enough)
---
## Success Criteria
1. Create a card in < 30 seconds
2. Review 100 cards in < 20 minutes
3. Generate 50 cards from a PDF chapter in < 10 minutes
4. All data human-readable and git-friendly
5. Mobile review works smoothly on iPad
6. Filtered decks persist across sessions
---
## Related
- [[SRS Tool - MoC]] - Main navigation
- [[SRS Tool - Development Plan]] - Build phases
- [[SRS Tool - Technical Spec]] - Architecture details
- [[SRS Tool - Hashcards Analysis]] - Prior art research
