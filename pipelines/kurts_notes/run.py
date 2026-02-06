#!/usr/bin/env python3
"""Process PDFs in a topic folder using the Kurt's Notes pipeline.

Usage:
    python -m kurts_notes.run /path/to/vault/02_Education/Cytology
    python -m kurts_notes.run /path/to/folder --topic "Pathology" --dry-run
"""

import argparse
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import List

import fitz

from shared.models import CardData
from shared.s3_storage import S3ImageStorage
from shared.supabase_writer import SupabaseCardWriter

from kurts_notes.slide_processor import (
    find_slide_regions,
    get_text_spans,
    render_region,
    block_multiple_regions,
    generate_cards_for_slide,
    classify_slide,
)
from kurts_notes.obsidian_notes import create_reference_note, update_moc


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


def process_pdf(
    pdf_path: Path,
    topic: str,
    s3_storage: S3ImageStorage,
    card_writer: SupabaseCardWriter,
    output_dir: Path,
    dpi: int = 200,
) -> dict:
    """Process a single PDF file."""
    subtopic = pdf_to_subtopic(pdf_path.name)
    image_subfolder = sanitize_filename(subtopic.lower().replace(" ", "-"))

    print(f"\n{'='*60}")
    print(f"Processing: {pdf_path.name}")
    print(f"Topic: {topic} → {subtopic}")
    print(f"{'='*60}")

    doc = fitz.open(pdf_path)

    all_cards: List[CardData] = []
    slide_data: List[dict] = []
    skipped_slides = 0

    for page_num in range(len(doc)):
        page = doc[page_num]
        regions = find_slide_regions(doc, page_num)
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

            # Upload original to S3
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
                slide_topic = result.get("slide_topic", f"Slide {slide_id}")

                slide_data.append(
                    {
                        "slide_id": slide_id,
                        "topic": slide_topic,
                        "image_url": original_url,
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

                        all_cards.append(
                            CardData(
                                card_type="occlusion",
                                question=occ.get("question", "What is hidden?"),
                                answer=occ.get("answer", ""),
                                blocked_image=blocked_url,
                                reveal_image=original_url,
                                topic=topic,
                                subtopic=subtopic,
                                source_pdf=pdf_path.name,
                                obsidian_note=subtopic,
                                tags=[topic.lower().replace(" ", "-")],
                                importance=occ.get("importance", "core"),
                                quality=occ.get("quality", "A"),
                            )
                        )

                # Process text cards
                text_cards = result.get("text_cards", [])
                print(f"    -> {len(text_cards)} text cards", flush=True)

                for tc in text_cards:
                    card_type = tc.get("type", "qa")

                    if card_type == "cloze":
                        all_cards.append(
                            CardData(
                                card_type="cloze",
                                question=tc.get("text", ""),
                                cloze_text=tc.get("text", ""),
                                answer="",
                                topic=topic,
                                subtopic=subtopic,
                                source_pdf=pdf_path.name,
                                obsidian_note=subtopic,
                                tags=[topic.lower().replace(" ", "-")],
                                importance=tc.get("importance", "core"),
                                quality=tc.get("quality", "A"),
                            )
                        )
                    else:
                        all_cards.append(
                            CardData(
                                card_type="qa",
                                question=tc.get("question", ""),
                                answer=tc.get("answer", ""),
                                topic=topic,
                                subtopic=subtopic,
                                source_pdf=pdf_path.name,
                                obsidian_note=subtopic,
                                tags=[topic.lower().replace(" ", "-")],
                                importance=tc.get("importance", "core"),
                                quality=tc.get("quality", "A"),
                            )
                        )

            except Exception as e:
                print(f"    Error: {e}")
                import traceback

                traceback.print_exc()
                continue

    print(f"\nSlide summary: {skipped_slides} skipped, {len(slide_data)} processed")

    doc.close()

    # Insert cards to Supabase
    if all_cards:
        print(f"\nInserting {len(all_cards)} cards to Supabase...")
        inserted = card_writer.insert_cards(all_cards)
        print(f"Inserted {len(inserted)} cards")

    # Create reference note
    reference_note_path = create_reference_note(
        output_dir=output_dir,
        topic=topic,
        subtopic=subtopic,
        source_pdf=pdf_path.name,
        slides=slide_data,
    )
    print(f"Created reference note: {reference_note_path.name}")

    return {
        "subtopic": subtopic,
        "cards_created": len(all_cards),
        "slides_processed": len(slide_data),
        "reference_note": reference_note_path,
    }


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
    print(f"Folder: {topic_dir}")
    print(f"PDFs found: {len(pdfs)}")
    for pdf in pdfs:
        print(f"  - {pdf.name}")

    if args.dry_run:
        print("\n[Dry run - no changes made]")
        sys.exit(0)

    # Initialize services
    s3_storage = S3ImageStorage()
    card_writer = SupabaseCardWriter()

    # Create processed folder
    processed_dir = topic_dir / "processed"
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
                output_dir=topic_dir,
            )
            results.append(result)

            # Move PDF to processed
            dest = processed_dir / pdf.name
            shutil.move(str(pdf), str(dest))
            print(f"Moved PDF to processed/")

        except Exception as e:
            print(f"\nError processing {pdf.name}: {e}")
            import traceback

            traceback.print_exc()

    # Update MoC
    if results:
        existing_notes = [
            f.stem
            for f in topic_dir.glob("*.md")
            if f.stem != f"{topic} - MoC" and not f.stem.startswith(".")
        ]

        moc_path = update_moc(topic_dir, topic, existing_notes)
        print(f"\nUpdated MoC: {moc_path.name}")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    total_cards = sum(r["cards_created"] for r in results)
    total_slides = sum(r["slides_processed"] for r in results)
    print(f"PDFs processed: {len(results)}")
    print(f"Slides processed: {total_slides}")
    print(f"Cards created: {total_cards}")


if __name__ == "__main__":
    main()
