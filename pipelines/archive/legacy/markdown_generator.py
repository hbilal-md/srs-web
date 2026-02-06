"""Generate Obsidian markdown notes from PDF card extraction results.

Converts the output from smart occlusion extraction into properly formatted
markdown files with YAML frontmatter and card syntax.
"""

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Union

from .image_storage import ObsidianImageStorage, S3ImageStorage
from .parser import generate_card_id


@dataclass
class CardData:
    """Data for a single card to be written."""
    card_type: str  # 'occlusion', 'qa', 'cloze'
    question: str
    answer: str
    question_image: Optional[str] = None  # Path to blocked image
    answer_image: Optional[str] = None    # Path to original image
    difficulty: str = "medium"
    slide_id: Optional[str] = None


@dataclass
class DeckMetadata:
    """Metadata for a flashcard deck/note."""
    title: str
    topic: str
    subtopic: str
    source_pdf: str
    tags: List[str]
    moc_link: Optional[str] = None


def sanitize_filename(name: str) -> str:
    """Convert a string to a valid filename."""
    # Remove or replace invalid characters
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def generate_yaml_frontmatter(metadata: DeckMetadata, card_count: int = 0) -> str:
    """Generate YAML frontmatter for an Obsidian note."""
    lines = [
        "---",
        "type: flashcard-deck",
        f"topic: {metadata.topic}",
        f"subtopic: {metadata.subtopic}",
        f"source: {metadata.source_pdf}",
        f"tags: [{', '.join(metadata.tags)}]",
        "status: draft",
        f"card_count: {card_count}",
        f"date_created: {date.today().isoformat()}",
    ]

    if metadata.moc_link:
        lines.append(f'MoC: "[[{metadata.moc_link}]]"')

    lines.append("---")
    return "\n".join(lines)


def generate_occlusion_card(card: CardData, card_id: str) -> str:
    """Generate markdown for an occlusion-type card.

    Occlusion cards use plain links (not embedded) for images.
    The review app will handle displaying them appropriately.
    """
    lines = [
        f"<!-- card:{card_id} -->",
        f"Q: {card.question}",
    ]

    if card.question_image:
        lines.append(f"[blocked]({card.question_image})")

    lines.append(f"A: {card.answer}")

    if card.answer_image:
        lines.append(f"[reveal]({card.answer_image})")

    return "\n".join(lines)


def generate_qa_card(card: CardData, card_id: str) -> str:
    """Generate markdown for a standard Q/A card."""
    lines = [
        f"<!-- card:{card_id} -->",
        f"Q: {card.question}",
    ]

    if card.question_image:
        lines.append(f"[image]({card.question_image})")

    lines.append(f"A: {card.answer}")

    if card.answer_image:
        lines.append(f"[image]({card.answer_image})")

    return "\n".join(lines)


def generate_cloze_card(card: CardData, card_id: str) -> str:
    """Generate markdown for a cloze deletion card."""
    return f"<!-- card:{card_id} -->\nC: {card.question}"


def generate_card_markdown(card: CardData) -> str:
    """Generate markdown for any card type."""
    card_id = generate_card_id()

    if card.card_type == "occlusion":
        return generate_occlusion_card(card, card_id)
    elif card.card_type == "cloze":
        return generate_cloze_card(card, card_id)
    else:  # qa
        return generate_qa_card(card, card_id)


class MarkdownDeckGenerator:
    """Generates Obsidian markdown notes from extraction results."""

    def __init__(self, vault_path: Union[str, Path],
                 images_folder: str = "assets/srs-images",
                 use_s3: bool = False):
        """Initialize the generator.

        Args:
            vault_path: Path to Obsidian vault root
            images_folder: Folder within vault for images (local storage only)
            use_s3: If True, use S3 storage instead of local
        """
        self.vault_path = Path(vault_path)
        if use_s3:
            self.image_storage = S3ImageStorage()
        else:
            self.image_storage = ObsidianImageStorage(vault_path, images_folder)

    def process_occlusion_results(self,
                                   results_json: Union[str, Path, List[dict]],
                                   source_images_dir: Union[str, Path],
                                   metadata: DeckMetadata,
                                   output_folder: str) -> Path:
        """Convert occlusion extraction results to an Obsidian note.

        Args:
            results_json: Path to JSON file or list of slide results
            source_images_dir: Directory containing the extracted images
            metadata: Metadata for the deck
            output_folder: Folder within vault for the note (e.g., "02_Education/Cytology")

        Returns:
            Path to the created markdown file
        """
        # Load results if path provided
        if isinstance(results_json, (str, Path)):
            with open(results_json) as f:
                results = json.load(f)
        else:
            results = results_json

        source_images_dir = Path(source_images_dir)

        # Collect all cards and track original images for reference section
        all_cards: List[CardData] = []
        original_images: List[Dict[str, str]] = []  # List of {slide_id, path, topic}
        image_subfolder = sanitize_filename(metadata.subtopic.lower().replace(" ", "-"))

        for slide_result in results:
            if "error" in slide_result:
                continue

            slide_id = slide_result.get("slide_id", "unknown")
            original_image = slide_result.get("original_image")

            # Store original image and track for reference section
            original_path = None
            if original_image:
                source_orig = source_images_dir / original_image
                if source_orig.exists():
                    original_path = self.image_storage.store_image(
                        source_orig,
                        subfolder=image_subfolder,
                        filename_prefix=f"{slide_id}_orig"
                    )
                    # Track for reference section
                    slide_topic = slide_result.get("slide_topic", f"Slide {slide_id}")
                    original_images.append({
                        "slide_id": slide_id,
                        "path": original_path,
                        "topic": slide_topic
                    })

            # Process occlusion cards
            for occ_card in slide_result.get("occlusion_cards", []):
                blocked_image = occ_card.get("blocked_image")
                blocked_path = None

                if blocked_image:
                    source_blocked = source_images_dir / blocked_image
                    if source_blocked.exists():
                        blocked_path = self.image_storage.store_image(
                            source_blocked,
                            subfolder=image_subfolder,
                            filename_prefix=f"{slide_id}_occ"
                        )

                all_cards.append(CardData(
                    card_type="occlusion",
                    question=occ_card.get("question", "What is hidden?"),
                    answer=occ_card.get("answer", ""),
                    question_image=blocked_path,
                    answer_image=original_path,
                    difficulty=occ_card.get("difficulty", "medium"),
                    slide_id=slide_id
                ))

            # Process text cards (qa and cloze)
            for text_card in slide_result.get("text_cards", []):
                card_type = text_card.get("type", "qa")

                if card_type == "cloze":
                    all_cards.append(CardData(
                        card_type="cloze",
                        question=text_card.get("text", ""),
                        answer="",
                        slide_id=slide_id
                    ))
                else:
                    all_cards.append(CardData(
                        card_type="qa",
                        question=text_card.get("question", ""),
                        answer=text_card.get("answer", ""),
                        question_image=original_path if text_card.get("show_image") else None,
                        slide_id=slide_id
                    ))

        # Generate markdown content (card_count now known)
        content_parts = [
            generate_yaml_frontmatter(metadata, card_count=len(all_cards)),
            "",
            f"# {metadata.title}",
            "",
            f"Source: [[{metadata.source_pdf}]]",
            "",
            "---",
            "",
            "## Reference Slides",
            "",
            "Original slides for reference (in order):",
            "",
        ]

        # Add reference section with all original images
        for img_info in original_images:
            content_parts.append(f"### {img_info['topic']}")
            content_parts.append(f"![]({img_info['path']})")
            content_parts.append("")

        content_parts.extend([
            "---",
            "",
            "## Cards",
            "",
        ])

        # Add all cards
        for card in all_cards:
            content_parts.append(generate_card_markdown(card))
            content_parts.append("")

        # Write the file
        output_dir = self.vault_path / output_folder
        output_dir.mkdir(parents=True, exist_ok=True)

        filename = sanitize_filename(metadata.title) + ".md"
        output_path = output_dir / filename

        output_path.write_text("\n".join(content_parts), encoding="utf-8")

        return output_path

    def create_moc(self, folder: Union[str, Path], topic: str,
                   note_titles: List[str]) -> Path:
        """Create or update a Map of Content for a topic folder.

        Args:
            folder: Folder path within vault
            topic: Topic name (e.g., "Cytology")
            note_titles: List of note titles to link

        Returns:
            Path to the MoC file
        """
        folder_path = self.vault_path / folder
        folder_path.mkdir(parents=True, exist_ok=True)

        moc_path = folder_path / f"{topic} - MoC.md"

        content = [
            "---",
            "type: moc",
            f"topic: {topic}",
            f"date_created: {date.today().isoformat()}",
            "---",
            "",
            f"# {topic}",
            "",
            "## Notes",
            "",
        ]

        for title in note_titles:
            content.append(f"- [[{title}]]")

        content.extend([
            "",
            "---",
            "",
            "## Review",
            "",
            f"To review all cards in this topic, use filtered deck: `topic:{topic}`",
        ])

        moc_path.write_text("\n".join(content), encoding="utf-8")
        return moc_path
