# Kurt's Notes Pipeline

Processes structured slide-based PDFs (like Kurt's pathology notes) into flashcards.

## How It Works

```
PDF → Extract slide regions → OCR text spans → AI classify slides
    → AI generate cards → Create blocked images → Upload to S3
    → Insert to Supabase → Generate Obsidian reference note
```

## Usage

```bash
cd pipelines
python -m kurts_notes.run /path/to/topic/folder --topic "Cytology"
```

The script will:
1. Find all PDFs in the folder (excluding `processed/`)
2. For each PDF: extract slides, classify, generate cards
3. Upload images to S3, insert cards to Supabase
4. Create Obsidian reference notes and update the topic MoC
5. Move processed PDFs to `processed/` subfolder

## Requirements

- `.env` file in `pipelines/` root (see `.env.example`)
- Python 3.10+
- Dependencies: `pip install -e .` from `pipelines/` root

## Pipeline Steps

1. **Slide extraction** — PyMuPDF detects horizontal separators to split pages into slides
2. **Text extraction** — OCR extracts word-level text with bounding boxes and formatting
3. **Classification** — GPT-4o classifies each slide (skip titles, outlines, transitions)
4. **Card generation** — GPT-4o generates occlusion + text cards from slide content
5. **Image blocking** — Pillow creates blocked versions with black rectangles over target text
6. **Upload** — S3 for images, Supabase for card records
7. **Notes** — Obsidian reference notes with slide images + MoC updates
