# Kurt's Notes Pipeline

Processes structured slide-based PDFs (like Kurt's pathology notes) into flashcards.

## How It Works

```
PDF → Extract slide regions → OCR text spans → AI classify slides
    → AI generate cards → Create blocked images → Upload to S3
    → Insert to Supabase
```

## Usage

```bash
cd pipelines
python -m kurts_notes.run /path/to/topic/folder --topic "Cytology"
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--topic` | folder name | Topic name for cards |
| `--source` | `kurts-notes` | Source tag (stored as `source:<value>` in tags) |
| `--preview` | off | Preview cards without S3 uploads or DB inserts |
| `--dry-run` | off | List PDFs without processing |

### Examples

```bash
# Standard run
python -m kurts_notes.run /path/to/Cytology --topic "Cytology"

# Preview what cards would be created
python -m kurts_notes.run /path/to/Cytology --topic "Cytology" --preview

# Custom source tag
python -m kurts_notes.run /path/to/Robbins --topic "Pathology" --source "robbins"
```

## Pipeline Steps

1. **Slide extraction** — PyMuPDF detects horizontal separators to split pages into slides
2. **Intelligent splitting** — Pages without separators are split at natural content gaps
3. **Text extraction** — OCR extracts word-level text with bounding boxes and formatting
4. **Classification** — GPT-4o classifies each slide (skip titles, outlines, transitions)
5. **Card generation** — GPT-4o generates occlusion + text cards
6. **Image blocking** — Pillow creates blocked versions with black rectangles over target text
7. **Upload** — S3 for images, Supabase for card records

## Card Tags

Each card gets 2-3 tags:
- Topic tag (e.g., `cytology`) — from `--topic` flag
- Subtopic tag (e.g., `introduction-to-cytology`) — LLM-determined per PDF
- Source tag (e.g., `source:kurts-notes`) — from `--source` flag

Filter by source in the frontend by selecting the `source:*` tag when creating a deck.

## Comprehensiveness

### What gets processed
- All slides with factual medical content (diagnostic criteria, classifications, key terms, clinical features, tables, labeled diagrams)
- ~94% of slides are processed into cards

### What gets skipped
- Title-only slides (just a heading, no content)
- Outline/agenda slides
- Transition slides ("Now let's discuss...")
- "Thank you" / Q&A / reference slides
- Slides with only images and no testable text

### Safety mechanisms
- If slide classification fails (API error), the pipeline **processes the slide anyway** (optimistic fallback — better to have an extra card than miss content)
- Per-slide card limit: 3-5 target, max 6
- Quality gate: C-quality cards are never generated

### Card types
- **Occlusion** (image-based): 3-5 text regions hidden simultaneously, user sees blocked image
- **Q&A** (text synthesis): Consolidated questions testing understanding of slide content
- **Cloze** (fill-in-blank): Sentences with key terms to recall

### Known limitations
- **Unlabeled diagrams**: Text extraction only captures labeled text, not spatial relationships (arrows, flow, topology)
- **Chart/graph nuance**: Only text labels are extracted, not the data relationships they represent
- **Dense slides**: May consolidate away supporting details to stay under 6-card limit
- **Cross-slide duplicates**: No deduplication — recap slides may generate similar cards to earlier slides

### Why image occlusion matters
Even when text extraction misses visual details, the user reads the **full slide image** during review. Occlusion cards show the complete slide with targeted regions hidden — so the user studies the original slide directly, not just extracted text. This ensures coverage even for content the pipeline can't directly extract.

### Note
Comprehensiveness strategy is pipeline-specific. Other resource types (textbooks, lecture recordings, etc.) will need different approaches to ensure coverage. Document each pipeline's strategy separately.

## Requirements

- `.env` file in `pipelines/` root
- Python 3.10+
- Dependencies: `pip install -e .` from `pipelines/` root
