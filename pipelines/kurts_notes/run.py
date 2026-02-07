#!/usr/bin/env python3
"""Process PDFs in a topic folder using the Kurt's Notes pipeline.

Usage:
    python -m kurts_notes.run /path/to/vault/02_Education/Cytology
    python -m kurts_notes.run /path/to/folder --topic "Pathology" --source "kurts-notes"
    python -m kurts_notes.run /path/to/folder --topic "Pathology" --preview
"""

import argparse
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import List, Optional

import fitz

from shared.models import CardData
from shared.s3_storage import S3ImageStorage
from shared.supabase_writer import SupabaseCardWriter

from kurts_notes.slide_processor import (
    find_slide_regions,
    split_large_region,
    get_text_spans,
    render_region,
    block_multiple_regions,
    generate_cards_for_slide,
    classify_slide,
    determine_subtopic,
)


def sanitize_filename(name: str) -> str:
    """Convert string to valid filename."""
    name = re.sub(r'[<>:"/\\|?*]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def pdf_to_subtopic(pdf_name: str) -> str:
    """Convert PDF filename to subtopic name."""
    name = pdf_name.rsplit(".", 1)[0]
    name = name.replace("-", " ").replace("_", " ")
    return name.title()


def build_card_tags(
    topic: str,
    subtopic: str,
    source: Optional[str] = None,
) -> List[str]:
    """Build the tag list for a card: topic + subtopic + source."""
    base_tag = topic.lower().replace(" ", "-")
    tags = [base_tag]

    if subtopic:
        sub_tag = subtopic.lower().replace(" ", "-")
        sub_tag = re.sub(r"[^a-z0-9-]", "", sub_tag)
        if sub_tag and sub_tag != base_tag:
            tags.append(sub_tag)

    if source:
        tags.append(f"source:{source}")

    return tags


def process_pdf(
    pdf_path: Path,
    topic: str,
    s3_storage: Optional[S3ImageStorage],
    card_writer: Optional[SupabaseCardWriter],
    source: Optional[str] = None,
    preview: bool = False,
    dpi: int = 200,
) -> dict:
    """Process a single PDF file."""
    doc = fitz.open(pdf_path)

    # Determine subtopic from first page using LLM
    print(f"\n{'='*60}")
    print(f"Processing: {pdf_path.name}")
    print(f"  Determining subtopic...", end=" ", flush=True)
    try:
        first_page = doc[0]
        first_page_img = render_region(first_page, first_page.rect, dpi)
        subtopic = determine_subtopic(first_page_img, topic)
        print(f"→ {subtopic}", flush=True)
    except Exception as e:
        subtopic = pdf_to_subtopic(pdf_path.name)
        print(f"Failed ({e}), using filename: {subtopic}", flush=True)

    image_subfolder = sanitize_filename(subtopic.lower().replace(" ", "-"))

    print(f"Topic: {topic} → {subtopic}")
    if source:
        print(f"Source: {source}")
    if preview:
        print(f"Mode: PREVIEW (no uploads or inserts)")
    print(f"{'='*60}")

    all_cards: List[CardData] = []
    slide_data: List[dict] = []
    skipped_slides = 0

    for page_num in range(len(doc)):
        page = doc[page_num]
        regions = find_slide_regions(doc, page_num)

        # If only one region (full page), attempt intelligent splitting
        if len(regions) == 1:
            regions = split_large_region(page, regions[0])

        print(f"\nPage {page_num + 1}: {len(regions)} slides")

        for slide_idx, clip in enumerate(regions):
            slide_id = f"p{page_num + 1:02d}_s{slide_idx + 1:02d}"

            text_spans = get_text_spans(page, clip)
            if not text_spans:
                print(f"  {slide_id}: Skipping (no text)")
                continue

            print(f"  {slide_id}: {len(text_spans)} text items", flush=True)

            original_img = render_region(page, clip, dpi)

            # Classify slide
            print(f"    Classifying...", end=" ", flush=True)
            try:
                classification = classify_slide(original_img)
                if not classification.get("should_process", True):
                    reason = classification.get("skip_reason", "low-value")
                    slide_type = classification.get("slide_type", "unknown")
                    print(f"Skip ({slide_type}): {reason}", flush=True)
                    skipped_slides += 1
                    continue
                print("OK", flush=True)
            except Exception as e:
                print(f"Failed, proceeding: {e}", flush=True)

            # Upload original to S3 (skip in preview mode)
            original_url = "[PREVIEW]"
            if not preview:
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    original_img.save(tmp.name, quality=95)
                    original_url = s3_storage.store_image(
                        tmp.name,
                        subfolder=image_subfolder,
                        filename_prefix=f"{slide_id}_orig",
                    )
                    os.unlink(tmp.name)

            # Generate cards with AI
            print(f"    Generating cards...", end=" ", flush=True)
            try:
                result = generate_cards_for_slide(original_img, text_spans)
                print("OK", flush=True)
                # Build tags for cards from this slide
                card_tags = build_card_tags(topic, subtopic, source)

                slide_data.append(
                    {
                        "slide_id": slide_id,
                        "topic": slide_topic,
                        "image_url": original_url,
                        "tags": card_tags,
                    }
                )

                # Process occlusion cards
                occlusion_cards = result.get("occlusion_cards", [])
                print(f"    -> {len(occlusion_cards)} occlusion cards", flush=True)

                for occ in occlusion_cards:
                    hide_indices = occ.get("hide_indices", [])

                    if hide_indices and not isinstance(hide_indices[0], list):
                        hide_indices = [[idx] for idx in hide_indices]

                    region_spans = []
                    for region_indices in hide_indices:
                        spans_in_region = [
                            s for s in text_spans if s.index in region_indices
                        ]
                        if spans_in_region:
                            region_spans.append(spans_in_region)

                    if region_spans:
                        # Upload blocked image (skip in preview mode)
                        blocked_url = "[PREVIEW]"
                        if not preview:
                            blocked_img = block_multiple_regions(
                                original_img, region_spans, clip, dpi
                            )

                            with tempfile.NamedTemporaryFile(
                                suffix=".jpg", delete=False
                            ) as tmp:
                                blocked_img.save(tmp.name, quality=95)
                                blocked_url = s3_storage.store_image(
                                    tmp.name,
                                    subfolder=image_subfolder,
                                    filename_prefix=f"{slide_id}_occ",
                                )
                                os.unlink(tmp.name)

                        card = CardData(
                            card_type="occlusion",
                            question=occ.get("question", "What is hidden?"),
                            answer=occ.get("answer", ""),
                            blocked_image=blocked_url,
                            reveal_image=original_url,
                            topic=topic,
                            subtopic=subtopic,
                            source_pdf=pdf_path.name,
                            tags=card_tags,
                            importance=occ.get("importance", "core"),
                            quality=occ.get("quality", "A"),
                        )
                        all_cards.append(card)

                        if preview:
                            _print_card_preview(card, len(all_cards))

                # Process text cards
                text_cards = result.get("text_cards", [])
                print(f"    -> {len(text_cards)} text cards", flush=True)

                for tc in text_cards:
                    card_type = tc.get("type", "qa")

                    if card_type == "cloze":
                        card = CardData(
                            card_type="cloze",
                            question=tc.get("text", ""),
                            cloze_text=tc.get("text", ""),
                            answer="",
                            topic=topic,
                            subtopic=subtopic,
                            source_pdf=pdf_path.name,
                            tags=card_tags,
                            importance=tc.get("importance", "core"),
                            quality=tc.get("quality", "A"),
                        )
                    else:
                        card = CardData(
                            card_type="qa",
                            question=tc.get("question", ""),
                            answer=tc.get("answer", ""),
                            topic=topic,
                            subtopic=subtopic,
                            source_pdf=pdf_path.name,
                            tags=card_tags,
                            importance=tc.get("importance", "core"),
                            quality=tc.get("quality", "A"),
                        )

                    all_cards.append(card)

                    if preview:
                        _print_card_preview(card, len(all_cards))

            except Exception as e:
                print(f"    Error: {e}")
                import traceback

                traceback.print_exc()
                continue

    print(f"\nSlide summary: {skipped_slides} skipped, {len(slide_data)} processed")

    doc.close()

    # Insert cards to Supabase (skip in preview mode)
    if all_cards and not preview:
        print(f"\nInserting {len(all_cards)} cards to Supabase...")
        inserted = card_writer.insert_cards(all_cards)
        print(f"Inserted {len(inserted)} cards")

    return {
        "subtopic": subtopic,
        "cards_created": len(all_cards),
        "slides_processed": len(slide_data),
        "slides_skipped": skipped_slides,
        "tags": _collect_unique_tags(all_cards),
    }


def _print_card_preview(card: CardData, card_num: int) -> None:
    """Print a preview of a card that would be created."""
    q = (card.question or "")[:80]
    a = (card.answer or "")[:80]
    print(f"\n    --- Preview Card #{card_num} ---")
    print(f"      Type: {card.card_type}")
    print(f"      Q: {q}{'...' if len(card.question or '') > 80 else ''}")
    print(f"      A: {a}{'...' if len(card.answer or '') > 80 else ''}")
    print(f"      Tags: {card.tags}")
    print(f"      Importance: {card.importance} | Quality: {card.quality}")


def _collect_unique_tags(cards: List[CardData]) -> List[str]:
    """Collect all unique tags from a list of cards."""
    tags = set()
    for card in cards:
        for tag in card.tags or []:
            tags.add(tag)
    return sorted(tags)


def main():
    parser = argparse.ArgumentParser(
        description="Process PDFs in a topic folder (Kurt's Notes pipeline)"
    )
    parser.add_argument(
        "topic_folder",
        type=Path,
        help="Path to the topic folder (e.g., /path/to/vault/02_Education/Cytology)",
    )
    parser.add_argument("--topic", type=str, help="Topic name (defaults to folder name)")
    parser.add_argument(
        "--source",
        type=str,
        default="kurts-notes",
        help="Source tag for cards (default: kurts-notes)",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Preview cards without uploading to S3 or inserting to Supabase",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be processed without doing it",
    )

    args = parser.parse_args()

    topic_dir = args.topic_folder.resolve()
    if not topic_dir.exists():
        print(f"Error: Folder not found: {topic_dir}")
        sys.exit(1)

    topic = args.topic or topic_dir.name

    # Find PDFs (exclude processed/ folder)
    pdfs = [
        f
        for f in topic_dir.glob("*.pdf")
        if f.is_file() and "processed" not in str(f)
    ]

    if not pdfs:
        print(f"No PDFs found in {topic_dir}")
        sys.exit(0)

    print(f"Topic: {topic}")
    print(f"Source: {args.source}")
    print(f"Folder: {topic_dir}")
    print(f"PDFs found: {len(pdfs)}")
    for pdf in pdfs:
        print(f"  - {pdf.name}")

    if args.dry_run:
        print("\n[Dry run - no changes made]")
        sys.exit(0)

    # Initialize services (skip in preview mode)
    s3_storage = None
    card_writer = None
    if not args.preview:
        s3_storage = S3ImageStorage()
        card_writer = SupabaseCardWriter()

    # Create processed folder (skip in preview mode)
    processed_dir = topic_dir / "processed"
    if not args.preview:
        processed_dir.mkdir(exist_ok=True)

    # Process each PDF
    results = []
    for pdf in pdfs:
        try:
            result = process_pdf(
                pdf_path=pdf,
                topic=topic,
                s3_storage=s3_storage,
                card_writer=card_writer,
                source=args.source,
                preview=args.preview,
            )
            results.append(result)

            # Move PDF to processed (skip in preview mode)
            if not args.preview:
                dest = processed_dir / pdf.name
                shutil.move(str(pdf), str(dest))
                print(f"Moved PDF to processed/")

        except Exception as e:
            print(f"\nError processing {pdf.name}: {e}")
            import traceback

            traceback.print_exc()

    # Summary
    print(f"\n{'='*60}")
    print("PREVIEW SUMMARY" if args.preview else "SUMMARY")
    print(f"{'='*60}")
    total_cards = sum(r["cards_created"] for r in results)
    total_slides = sum(r["slides_processed"] for r in results)
    total_skipped = sum(r["slides_skipped"] for r in results)
    all_tags = sorted(set().union(*(r["tags"] for r in results))) if results else []

    print(f"PDFs processed: {len(results)}")
    print(f"Slides processed: {total_slides}")
    print(f"Slides skipped: {total_skipped}")
    print(f"Cards {'would be created' if args.preview else 'created'}: {total_cards}")
    if all_tags:
        print(f"Tags: {all_tags}")

    if args.preview:
        print(f"\n[Preview mode - no S3 uploads, no DB inserts, no files moved]")


if __name__ == "__main__":
    main()
