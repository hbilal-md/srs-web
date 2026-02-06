"""Parse markdown files for cards and metadata."""

import hashlib
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple, Union

import yaml


@dataclass
class Card:
    """Represents a single flashcard."""

    card_id: str
    card_type: str  # 'qa' or 'cloze'
    content: str  # Raw content (Q/A block or cloze line)
    content_hash: str
    file_path: str

    # Parsed content
    question: Optional[str] = None
    answer: Optional[str] = None
    cloze_text: Optional[str] = None
    cloze_deletions: List[str] = field(default_factory=list)

    # Images embedded in the card
    question_images: List[str] = field(default_factory=list)
    answer_images: List[str] = field(default_factory=list)

    # Occlusion card images (blocked/reveal)
    blocked_image: Optional[str] = None
    reveal_image: Optional[str] = None

    # Inherited metadata
    topic: Optional[str] = None
    subtopic: Optional[str] = None
    tags: List[str] = field(default_factory=list)


@dataclass
class NoteMetadata:
    """YAML frontmatter from a note."""

    note_type: Optional[str] = None
    topic: Optional[str] = None
    subtopic: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    source: Optional[str] = None
    source_pages: List[int] = field(default_factory=list)
    status: Optional[str] = None


def generate_card_id() -> str:
    """Generate a new 8-character hex card ID."""
    return uuid.uuid4().hex[:8]


def compute_content_hash(content: str) -> str:
    """Compute SHA256 hash of card content for change detection."""
    return hashlib.sha256(content.strip().encode()).hexdigest()[:16]


def parse_frontmatter(content: str) -> Tuple[NoteMetadata, str]:
    """Extract YAML frontmatter from markdown content.

    Returns (metadata, remaining_content).
    """
    metadata = NoteMetadata()

    if not content.startswith('---'):
        return metadata, content

    # Find closing ---
    end_match = re.search(r'\n---\n', content[3:])
    if not end_match:
        return metadata, content

    yaml_end = end_match.start() + 3
    yaml_content = content[3:yaml_end]
    remaining = content[yaml_end + 4:]  # Skip past closing ---\n

    try:
        data = yaml.safe_load(yaml_content) or {}
    except yaml.YAMLError:
        return metadata, content

    metadata.note_type = data.get('type')
    metadata.topic = data.get('topic')
    metadata.subtopic = data.get('subtopic')
    metadata.tags = data.get('tags', [])
    if isinstance(metadata.tags, str):
        metadata.tags = [metadata.tags]
    metadata.source = data.get('source')
    metadata.source_pages = data.get('source_pages', [])
    if isinstance(metadata.source_pages, int):
        metadata.source_pages = [metadata.source_pages]
    metadata.status = data.get('status')

    return metadata, remaining


def extract_images(text: str) -> List[str]:
    """Extract image paths/URLs from markdown text.

    Handles both remote URLs and local paths.
    """
    # Match ![alt](path) where path can be URL or local path
    pattern = r'!\[.*?\]\(([^\)]+)\)'
    return re.findall(pattern, text)


def extract_occlusion_link(text: str, link_type: str) -> Optional[str]:
    """Extract [blocked](url) or [reveal](url) link from text.

    Args:
        text: The text to search in
        link_type: Either 'blocked' or 'reveal'

    Returns:
        The URL/path if found, None otherwise
    """
    pattern = rf'\[{link_type}\]\(([^\)]+)\)'
    match = re.search(pattern, text)
    return match.group(1) if match else None


def parse_qa_card(content: str, card_id: str, file_path: str, metadata: NoteMetadata) -> Card:
    """Parse a Q/A format card."""
    lines = content.strip().split('\n')

    question_lines = []
    answer_lines = []
    current_section = None

    for line in lines:
        if line.startswith('Q:'):
            current_section = 'q'
            question_lines.append(line[2:].strip())
        elif line.startswith('A:'):
            current_section = 'a'
            answer_lines.append(line[2:].strip())
        elif current_section == 'q':
            question_lines.append(line)
        elif current_section == 'a':
            answer_lines.append(line)

    question = '\n'.join(question_lines).strip()
    answer = '\n'.join(answer_lines).strip()

    # Extract occlusion links (for image occlusion cards)
    blocked_image = extract_occlusion_link(content, 'blocked')
    reveal_image = extract_occlusion_link(content, 'reveal')

    return Card(
        card_id=card_id,
        card_type='qa',
        content=content,
        content_hash=compute_content_hash(content),
        file_path=file_path,
        question=question,
        answer=answer,
        question_images=extract_images(question),
        answer_images=extract_images(answer),
        blocked_image=blocked_image,
        reveal_image=reveal_image,
        topic=metadata.topic,
        subtopic=metadata.subtopic,
        tags=metadata.tags.copy(),
    )


def parse_cloze_card(content: str, card_id: str, file_path: str, metadata: NoteMetadata) -> Card:
    """Parse a cloze deletion card."""
    # Remove C: prefix
    text = content.strip()
    if text.startswith('C:'):
        text = text[2:].strip()

    # Find all [bracketed] deletions
    deletions = re.findall(r'\[([^\]]+)\]', text)

    return Card(
        card_id=card_id,
        card_type='cloze',
        content=content,
        content_hash=compute_content_hash(content),
        file_path=file_path,
        cloze_text=text,
        cloze_deletions=deletions,
        question_images=extract_images(text),
        topic=metadata.topic,
        subtopic=metadata.subtopic,
        tags=metadata.tags.copy(),
    )


def parse_cards_section(content: str, file_path: str, metadata: NoteMetadata) -> List[Card]:
    """Parse all cards from a ## Cards section."""
    cards = []

    # Find ## Cards section
    cards_match = re.search(r'^## Cards\s*$', content, re.MULTILINE)
    if not cards_match:
        return cards

    cards_content = content[cards_match.end():]

    # Split by card ID comments
    # Pattern: <!-- card:xxxxxxxx -->
    card_pattern = r'<!--\s*card:([a-f0-9]{8})\s*-->'

    # Find all card markers
    markers = list(re.finditer(card_pattern, cards_content))

    for i, marker in enumerate(markers):
        card_id = marker.group(1)
        start = marker.end()

        # Get content until next marker or end
        if i + 1 < len(markers):
            end = markers[i + 1].start()
        else:
            end = len(cards_content)

        card_content = cards_content[start:end].strip()

        if not card_content:
            continue

        # Determine card type and parse
        if card_content.startswith('Q:'):
            card = parse_qa_card(card_content, card_id, file_path, metadata)
        elif card_content.startswith('C:'):
            card = parse_cloze_card(card_content, card_id, file_path, metadata)
        else:
            # Unknown format, skip
            continue

        cards.append(card)

    return cards


def parse_file(file_path: Union[str, Path]) -> List[Card]:
    """Parse a markdown file and extract all cards.

    Args:
        file_path: Path to the markdown file

    Returns:
        List of Card objects found in the file
    """
    file_path = Path(file_path)

    if not file_path.exists():
        return []

    if not file_path.suffix == '.md':
        return []

    content = file_path.read_text(encoding='utf-8')
    metadata, _ = parse_frontmatter(content)

    return parse_cards_section(content, str(file_path), metadata)


def add_card_ids(file_path: Union[str, Path]) -> int:
    """Add missing card IDs to a file.

    Returns the number of IDs added.
    """
    file_path = Path(file_path)
    content = file_path.read_text(encoding='utf-8')

    # Find ## Cards section
    cards_match = re.search(r'^## Cards\s*$', content, re.MULTILINE)
    if not cards_match:
        return 0

    cards_start = cards_match.end()
    before_cards = content[:cards_start]
    cards_content = content[cards_start:]

    # Find Q: or C: lines without preceding card ID
    # A card ID should be on the line before
    lines = cards_content.split('\n')
    new_lines = []
    ids_added = 0

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Check if this is a card start without ID
        if (stripped.startswith('Q:') or stripped.startswith('C:')):
            # Check if previous non-empty line is a card ID
            has_id = False
            for j in range(len(new_lines) - 1, -1, -1):
                prev = new_lines[j].strip()
                if prev:
                    if re.match(r'<!--\s*card:[a-f0-9]{8}\s*-->', prev):
                        has_id = True
                    break

            if not has_id:
                # Add a new ID
                new_id = generate_card_id()
                new_lines.append(f'<!-- card:{new_id} -->')
                ids_added += 1

        new_lines.append(line)
        i += 1

    if ids_added > 0:
        new_content = before_cards + '\n'.join(new_lines)
        file_path.write_text(new_content, encoding='utf-8')

    return ids_added
