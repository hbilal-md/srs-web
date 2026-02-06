---
type: project note
project: SRS Tool
status: active
tags: [work, project, education, board-exam, technical]
MoC: "[[SRS Tool - MoC]]"
base: "[[00_Project Notes.base]]"
date_created: 2026-01-18
---
> Detailed technical specification for implementation
---
## Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                   Data Storage                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Obsidian Vault (Markdown)          S3 (Images)            │
│  ┌─────────────────────────┐        ┌─────────────────┐    │
│  │ - Note content          │        │ - UUID filenames│    │
│  │ - Card text             │        │ - No structure  │    │
│  │ - Card IDs (HTML)       │        │ - Dumb storage  │    │
│  │ - Image URLs            │        │                 │    │
│  │ - Captions              │        │                 │    │
│  │ - YAML metadata         │        │                 │    │
│  └─────────────────────────┘        └─────────────────┘    │
│           │                                                 │
│           │ Obsidian Sync                                   │
│           ▼                                                 │
│  ┌─────────────────────────┐                               │
│  │ Server Copy of Vault    │                               │
│  └─────────────────────────┘                               │
│           │                                                 │
│           │ File Watcher                                    │
│           ▼                                                 │
│  ┌─────────────────────────┐                               │
│  │ SQLite (srs.db)         │                               │
│  │ - Card FSRS state       │                               │
│  │ - Review history        │                               │
│  │ - Filtered decks        │                               │
│  │ - Content hashes        │                               │
│  └─────────────────────────┘                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
---
## Card Format Specification
### File Structure
```markdown
---
type: study-note
topic: Thyroid FNA
subtopic: Bethesda III
tags: [cytology, thyroid, bethesda]
source: "Cibas Cytology 4th Ed"
source_pages: [142, 143]
status: active
---
# Title

[Notes content - readable study material]

![](https://s3.../uuid.jpg)
*Caption: Description of image*

---
## Cards

<!-- card:a1b2c3d4 -->
Q: Question text
A: Answer text

<!-- card:e5f6g7h8 -->
Q: Question with image
![](https://s3.../uuid.jpg)
A: Answer referencing image

<!-- card:i9j0k1l2 -->
C: Cloze with [hidden] text and [another hidden] part.
```
### Card ID Format
- 8 character hexadecimal: `a1b2c3d4`
- Generated via: `uuid.uuid4().hex[:8]`
- Stored in HTML comment: `<!-- card:a1b2c3d4 -->`
### Card Types
**Q/A Card:**
```
Q: <question text, may include images>
A: <answer text, may include images>
```
**Cloze Card:**
```
C: Text with [cloze deletion] and [another one].
```
- Each `[bracketed]` section becomes a separate cloze
- Rendered as: `Text with [...] and [...].`
- Answer reveals all cloze deletions
---
## SQLite Schema
```sql
-- Card state (FSRS parameters)
CREATE TABLE cards (
    card_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    card_type TEXT NOT NULL,           -- 'qa' or 'cloze'

    -- FSRS state
    stability REAL DEFAULT 0.0,
    difficulty REAL DEFAULT 0.0,
    due_date TEXT,                      -- ISO format
    last_review TEXT,
    review_count INTEGER DEFAULT 0,
    lapses INTEGER DEFAULT 0,
    state TEXT DEFAULT 'new',           -- new, learning, review, relearning

    -- Inherited metadata
    topic TEXT,
    subtopic TEXT,
    tags TEXT,                          -- JSON array

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_cards_due ON cards(due_date);
CREATE INDEX idx_cards_state ON cards(state);
CREATE INDEX idx_cards_file ON cards(file_path);

-- Review history
CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    rating INTEGER NOT NULL,            -- 1=again, 2=hard, 3=good, 4=easy
    time_taken_ms INTEGER,

    -- State snapshot before review
    prev_stability REAL,
    prev_difficulty REAL,
    prev_interval_days REAL,

    FOREIGN KEY (card_id) REFERENCES cards(card_id)
);

CREATE INDEX idx_reviews_card ON reviews(card_id);
CREATE INDEX idx_reviews_date ON reviews(reviewed_at);

-- Filtered decks
CREATE TABLE filtered_decks (
    deck_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    -- Filter config
    filter_tags TEXT,                   -- JSON array
    filter_folders TEXT,                -- JSON array of paths
    filter_states TEXT,                 -- JSON array: ["new", "learning"]
    filter_difficulty TEXT,             -- "hard" or null
    filter_last_wrong BOOLEAN DEFAULT FALSE,
    card_count INTEGER,
    sort_order TEXT DEFAULT 'random',   -- random, due, difficulty

    -- Progress
    card_queue TEXT,                    -- JSON array of card_ids
    current_position INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE
);

-- File sync tracking
CREATE TABLE sync_state (
    file_path TEXT PRIMARY KEY,
    last_modified TEXT NOT NULL,
    last_scanned TEXT NOT NULL,
    card_count INTEGER DEFAULT 0
);
```
---
## FSRS Algorithm
Reference implementation from open-anki/py-fsrs.
### Core Parameters
```python
@dataclass
class FSRSParams:
    w: list[float]  # 17 weight parameters
    request_retention: float = 0.9
    maximum_interval: int = 36500
```
### State Calculation
```python
def next_states(
    card: Card,
    rating: Rating,  # 1-4
    now: datetime
) -> Card:
    """Calculate new card state after review."""

    if card.state == State.New:
        # First review
        new_difficulty = init_difficulty(rating)
        new_stability = init_stability(rating)
    else:
        # Subsequent review
        new_difficulty = next_difficulty(card.difficulty, rating)

        if rating == Rating.Again:
            new_stability = next_forget_stability(
                card.difficulty,
                card.stability,
                retrievability(card, now)
            )
        else:
            new_stability = next_recall_stability(
                card.difficulty,
                card.stability,
                retrievability(card, now),
                rating
            )

    interval = next_interval(new_stability)

    return Card(
        stability=new_stability,
        difficulty=new_difficulty,
        due_date=now + timedelta(days=interval),
        last_review=now,
        review_count=card.review_count + 1,
        lapses=card.lapses + (1 if rating == Rating.Again else 0),
        state=next_state(card.state, rating)
    )
```
---
## API Specification
### Review Endpoints
```
GET /api/due
Response: { "count": 42 }

GET /api/next?deck_id=<optional>
Response: {
    "card_id": "a1b2c3d4",
    "type": "qa",
    "question": "What is...",
    "question_images": ["https://s3.../x.jpg"],
    "answer": "The answer is...",
    "answer_images": [],
    "topic": "Thyroid FNA",
    "tags": ["cytology", "bethesda"],
    "file_path": "02_Education/Thyroid/Bethesda III.md"
}

POST /api/review
Body: {
    "card_id": "a1b2c3d4",
    "rating": 3,
    "time_taken_ms": 5200,
    "deck_id": "<optional>"
}
Response: {
    "next_card": { ... },  // or null if done
    "remaining": 41
}

GET /api/stats
Response: {
    "due_today": 42,
    "reviewed_today": 15,
    "new": 100,
    "learning": 25,
    "review": 500,
    "retention_rate": 0.87
}
```
### Filtered Deck Endpoints
```
GET /api/decks
Response: {
    "decks": [
        {
            "deck_id": "xyz",
            "name": "Thyroid Review",
            "total": 100,
            "position": 45,
            "completed": false
        }
    ]
}

POST /api/decks
Body: {
    "name": "Heme Review",
    "tags": ["heme", "lymphoma"],
    "folders": ["02_Education/Heme/"],
    "states": ["new", "review"],
    "count": 200,
    "sort": "random"
}
Response: {
    "deck_id": "abc123",
    "matching_cards": 187
}

DELETE /api/decks/{deck_id}
```
---
## PDF Generation Pipeline
### Step 1: PDF to Images
```python
import fitz  # PyMuPDF

def render_pdf(pdf_path: str, dpi: int = 150) -> list[Image]:
    doc = fitz.open(pdf_path)
    images = []

    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)

    return images
```
### Step 2: Page Analysis (Vision API)
```python
ANALYSIS_PROMPT = """
Analyze this page from a medical education document.

Identify:
1. ALL medically relevant images:
   - Histology/cytology slides
   - Gross pathology
   - Clinical photos
   - Anatomical diagrams
   - Flowcharts
   - Tables with data
   - Graphs

2. EXCLUDE:
   - Clip art
   - Stock photos
   - Logos/branding
   - Decorative elements
   - Icons

For each relevant image, provide:
{
  "images": [
    {
      "x_percent": <left edge as % of page width>,
      "y_percent": <top edge as % of page height>,
      "width_percent": <width as %>,
      "height_percent": <height as %>,
      "description": "<what the image shows>",
      "caption": "<caption if visible>",
      "medical_relevance": "<why it's educational>"
    }
  ],
  "text_content": "<all educational text on this page>"
}
"""
```
### Step 3: Card Generation
```python
GENERATION_PROMPT = """
Create study notes and flashcards from this content.

CRITICAL RULES:
1. ONLY use information explicitly in the source
2. NEVER add facts, statistics, or details not present
3. NEVER infer or extrapolate
4. Use EXACT terminology from source
5. If uncertain, DO NOT INCLUDE

Source text:
{text_content}

Images available (use these URLs in cards):
{image_list}

Output format:
---
# [Topic Title]

[Summarized notes - faithful to source]

---
## Cards

<!-- card:{uuid} -->
Q: [Question]
A: [Answer]
<!-- Source: "[exact quote]" (page X) -->

<!-- card:{uuid} -->
C: [Cloze with [deletion] text]
<!-- Source: "[exact quote]" (page X) -->
"""
```
### Step 4: Batch Processing
```python
def process_pdf_batch(pdf_path: str, output_dir: str, topic: str):
    state_file = Path(output_dir) / ".processing" / f"{topic}.json"

    # Resume if interrupted
    if state_file.exists():
        state = json.loads(state_file.read_text())
        start_page = state['completed_pages']
    else:
        state = {'completed_pages': 0, 'content': []}
        start_page = 0

    pages = render_pdf(pdf_path)

    for i, page in enumerate(pages[start_page:], start=start_page):
        print(f"Processing page {i+1}/{len(pages)}")

        # Analyze and generate
        result = process_page(page, i)
        state['content'].append(result)
        state['completed_pages'] = i + 1

        # Save checkpoint
        state_file.write_text(json.dumps(state))
        time.sleep(1)  # Rate limit

    # Assemble final output
    assemble_markdown(state['content'], output_dir, topic)
    state_file.unlink()
```
---
## File Watcher
```python
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class VaultHandler(FileSystemEventHandler):
    def __init__(self, db: Database):
        self.db = db

    def on_modified(self, event):
        if not event.src_path.endswith('.md'):
            return

        file_path = event.src_path
        current_mtime = os.path.getmtime(file_path)

        # Check if we need to rescan
        last_scan = self.db.get_sync_state(file_path)
        if last_scan and last_scan.mtime >= current_mtime:
            return

        # Rescan file
        cards = parse_cards(file_path)

        for card in cards:
            existing = self.db.get_card(card.id)

            if existing:
                if card.content_hash != existing.content_hash:
                    # Card was edited
                    self.db.update_card_content(card)
            else:
                # New card
                self.db.insert_card(card)

        # Remove deleted cards
        db_cards = self.db.get_cards_by_file(file_path)
        parsed_ids = {c.id for c in cards}

        for db_card in db_cards:
            if db_card.id not in parsed_ids:
                self.db.delete_card(db_card.id)

        self.db.update_sync_state(file_path, current_mtime)
```
---
## S3 Upload
```python
import boto3
import uuid

def upload_image(image: Image, bucket: str) -> str:
    """Upload image to S3, return public URL."""

    s3 = boto3.client('s3')

    # Generate UUID filename
    filename = f"{uuid.uuid4().hex}.jpg"

    # Convert to bytes
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=85)
    buffer.seek(0)

    # Upload
    s3.upload_fileobj(
        buffer,
        bucket,
        f"srs-images/{filename}",
        ExtraArgs={'ContentType': 'image/jpeg'}
    )

    return f"https://{bucket}.s3.amazonaws.com/srs-images/{filename}"
```
---
## Configuration
```yaml
# srs.yaml
vault_path: "/path/to/obsidian/vault"
database_path: "./srs.db"
drafts_folder: "Drafts"

# Server
host: "0.0.0.0"
port: 8000

# S3
s3_bucket: "your-bucket-name"
s3_region: "us-east-1"

# OpenAI
openai_model: "gpt-4o"
openai_max_tokens: 4096

# FSRS
target_retention: 0.9
maximum_interval: 365
```
---
## CLI Commands
```bash
# Start server
srs serve [--port 8000] [--host 0.0.0.0]

# Scan vault for cards
srs scan [--path /vault/path]

# Generate cards from PDF
srs generate --input "file.pdf" --output "folder/" --topic "Topic"

# Show stats
srs stats

# List due cards
srs due [--tags thyroid] [--count 10]

# Reset card state
srs reset <card_id>

# Export reviews (for analysis)
srs export-reviews --output reviews.csv
```
---
## Related
- [[SRS Tool - Vision]] - Design philosophy
- [[SRS Tool - Development Plan]] - Build phases
- [[SRS Tool - MoC]] - Main navigation
