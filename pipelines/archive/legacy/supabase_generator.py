"""Generate cards and upload to Supabase from PDF extraction results.

Replaces markdown_generator.py for the web-first architecture.
Cards go to Supabase, reference notes go to Obsidian.
"""

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Union

from .image_storage import S3ImageStorage
from .supabase_client import CardData, SupabaseCardWriter


@dataclass
class DeckMetadata:
    """Metadata for a flashcard deck."""
    title: str
    topic: str
    subtopic: str
    source_pdf: str
    tags: List[str]
    obsidian_note: Optional[str] = None  # Note name for breadcrumb linking


def sanitize_filename(name: str) -> str:
    """Convert a string to a valid filename."""
    import re
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


class SupabaseCardGenerator:
    """Generates cards and uploads to Supabase from extraction results."""

    def __init__(self):
        """Initialize the generator."""
        self.image_storage = S3ImageStorage()
        self.card_writer = SupabaseCardWriter()

    def process_occlusion_results(
        self,
        results_json: Union[str, Path, List[dict]],
        source_images_dir: Union[str, Path],
        metadata: DeckMetadata
    ) -> Dict[str, any]:
        """Convert occlusion extraction results to Supabase cards.

        Args:
            results_json: Path to JSON file or list of slide results
            source_images_dir: Directory containing the extracted images
            metadata: Metadata for the deck

        Returns:
            Dict with counts and inserted card IDs
        """
        # Load results if path provided
        if isinstance(results_json, (str, Path)):
            with open(results_json) as f:
                results = json.load(f)
        else:
            results = results_json

        source_images_dir = Path(source_images_dir)
        image_subfolder = sanitize_filename(metadata.subtopic.lower().replace(" ", "-"))

        all_cards: List[CardData] = []
        original_images: Dict[str, str] = {}  # slide_id -> S3 URL

        for slide_result in results:
            if "error" in slide_result:
                continue

            slide_id = slide_result.get("slide_id", "unknown")
            original_image = slide_result.get("original_image")

            # Upload original image to S3
            original_url = None
            if original_image:
                source_orig = source_images_dir / original_image
                if source_orig.exists():
                    original_url = self.image_storage.store_image(
                        source_orig,
                        subfolder=image_subfolder,
                        filename_prefix=f"{slide_id}_orig"
                    )
                    original_images[slide_id] = original_url

            # Process occlusion cards
            for occ_card in slide_result.get("occlusion_cards", []):
                blocked_image = occ_card.get("blocked_image")
                blocked_url = None

                if blocked_image:
                    source_blocked = source_images_dir / blocked_image
                    if source_blocked.exists():
                        blocked_url = self.image_storage.store_image(
                            source_blocked,
                            subfolder=image_subfolder,
                            filename_prefix=f"{slide_id}_occ"
                        )

                all_cards.append(CardData(
                    card_type="occlusion",
                    question=occ_card.get("question", "What is hidden?"),
                    answer=occ_card.get("answer", ""),
                    blocked_image=blocked_url,
                    reveal_image=original_url,
                    topic=metadata.topic,
                    subtopic=metadata.subtopic,
                    source_pdf=metadata.source_pdf,
                    obsidian_note=metadata.obsidian_note or metadata.subtopic,
                    tags=metadata.tags,
                    difficulty=occ_card.get("difficulty", "medium"),
                ))

            # Process text cards (qa and cloze)
            for text_card in slide_result.get("text_cards", []):
                card_type = text_card.get("type", "qa")

                if card_type == "cloze":
                    all_cards.append(CardData(
                        card_type="cloze",
                        cloze_text=text_card.get("text", ""),
                        question=text_card.get("text", ""),  # Store in question too for display
                        answer="",
                        topic=metadata.topic,
                        subtopic=metadata.subtopic,
                        source_pdf=metadata.source_pdf,
                        obsidian_note=metadata.obsidian_note or metadata.subtopic,
                        tags=metadata.tags,
                    ))
                else:
                    all_cards.append(CardData(
                        card_type="qa",
                        question=text_card.get("question", ""),
                        answer=text_card.get("answer", ""),
                        topic=metadata.topic,
                        subtopic=metadata.subtopic,
                        source_pdf=metadata.source_pdf,
                        obsidian_note=metadata.obsidian_note or metadata.subtopic,
                        tags=metadata.tags,
                    ))

        # Insert all cards to Supabase
        if all_cards:
            inserted = self.card_writer.insert_cards(all_cards)
            card_ids = [c["card_id"] for c in inserted]
        else:
            card_ids = []

        return {
            "total_cards": len(all_cards),
            "occlusion_cards": sum(1 for c in all_cards if c.card_type == "occlusion"),
            "qa_cards": sum(1 for c in all_cards if c.card_type == "qa"),
            "cloze_cards": sum(1 for c in all_cards if c.card_type == "cloze"),
            "card_ids": card_ids,
            "original_images": original_images,
        }

    def generate_reference_note(
        self,
        results_json: Union[str, Path, List[dict]],
        original_images: Dict[str, str],
        metadata: DeckMetadata,
        vault_path: Union[str, Path],
        output_folder: str
    ) -> Path:
        """Generate a clean Obsidian reference note (no card syntax).

        This note is for studying/reviewing the source material.
        Cards are in Supabase, not in this file.

        Args:
            results_json: Path to JSON file or list of slide results
            original_images: Dict of slide_id -> S3 URL from process_occlusion_results
            metadata: Metadata for the note
            vault_path: Path to Obsidian vault
            output_folder: Folder within vault for the note

        Returns:
            Path to the created markdown file
        """
        # Load results if path provided
        if isinstance(results_json, (str, Path)):
            with open(results_json) as f:
                results = json.load(f)
        else:
            results = results_json

        vault_path = Path(vault_path)

        # Build reference note content
        lines = [
            "---",
            "type: reference-note",
            f"topic: {metadata.topic}",
            f"subtopic: {metadata.subtopic}",
            f"source: {metadata.source_pdf}",
            f"tags: [{', '.join(metadata.tags)}]",
            f"date_created: {date.today().isoformat()}",
            "---",
            "",
            f"# {metadata.title}",
            "",
            f"Source: [[{metadata.source_pdf}]]",
            "",
            "---",
            "",
            "## Slides",
            "",
        ]

        # Add slides with their topics
        for slide_result in results:
            if "error" in slide_result:
                continue

            slide_id = slide_result.get("slide_id", "unknown")
            slide_topic = slide_result.get("slide_topic", f"Slide {slide_id}")
            image_url = original_images.get(slide_id)

            lines.append(f"### {slide_topic}")
            if image_url:
                lines.append(f"![]({image_url})")
            lines.append("")

            # Extract key points from text spans if available
            text_spans = slide_result.get("text_spans", [])
            if text_spans:
                # Group consecutive spans into bullet points
                # This is a simplified extraction - could be enhanced
                pass

        lines.extend([
            "---",
            "",
            "## Related",
            "",
            f"- [[{metadata.topic} - MoC]]",
            "",
        ])

        # Write the file
        output_dir = vault_path / output_folder
        output_dir.mkdir(parents=True, exist_ok=True)

        filename = sanitize_filename(metadata.title) + ".md"
        output_path = output_dir / filename

        output_path.write_text("\n".join(lines), encoding="utf-8")

        return output_path


def process_pdf_to_supabase(
    results_json: Union[str, Path],
    source_images_dir: Union[str, Path],
    topic: str,
    subtopic: str,
    source_pdf: str,
    tags: List[str] = None,
    vault_path: Optional[Union[str, Path]] = None,
    vault_folder: Optional[str] = None
) -> Dict[str, any]:
    """Convenience function to process PDF results to Supabase.

    Args:
        results_json: Path to the smart occlusion JSON results
        source_images_dir: Directory containing extracted images
        topic: Main topic (e.g., "Cytology")
        subtopic: Subtopic (e.g., "Cervical Cytology")
        source_pdf: Source PDF filename
        tags: Optional list of tags
        vault_path: Optional Obsidian vault path for reference note
        vault_folder: Folder within vault for reference note

    Returns:
        Dict with processing results
    """
    metadata = DeckMetadata(
        title=subtopic,
        topic=topic,
        subtopic=subtopic,
        source_pdf=source_pdf,
        tags=tags or ["board-exam", topic.lower()],
        obsidian_note=subtopic,
    )

    generator = SupabaseCardGenerator()

    # Process cards to Supabase
    result = generator.process_occlusion_results(
        results_json,
        source_images_dir,
        metadata
    )

    # Generate reference note if vault path provided
    if vault_path and vault_folder:
        note_path = generator.generate_reference_note(
            results_json,
            result["original_images"],
            metadata,
            vault_path,
            vault_folder
        )
        result["reference_note"] = str(note_path)

    return result
