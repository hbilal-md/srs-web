"""Obsidian reference note and MoC generation for Kurt's Notes pipeline."""

from datetime import date
from pathlib import Path
from typing import List


def create_reference_note(
    output_dir: Path,
    topic: str,
    subtopic: str,
    source_pdf: str,
    slides: List[dict],
) -> Path:
    """Create an Obsidian reference note with slide images."""
    lines = [
        "---",
        "type: reference-note",
        f"topic: {topic}",
        f"subtopic: {subtopic}",
        f'source: "[[processed/{source_pdf}]]"',
        f"tags: [{topic.lower().replace(' ', '-')}]",
        f'MoC: "[[{topic} - MoC]]"',
        f"date_created: {date.today().isoformat()}",
        "---",
        f"# {subtopic}",
        "",
        f"Source: [[processed/{source_pdf}]]",
        "",
        "---",
        "",
        "## Slides",
        "",
    ]

    for slide in slides:
        lines.append(f"### {slide['topic']}")
        lines.append(f"![]({slide['image_url']})")
        lines.append("")

    lines.extend(
        [
            "---",
            "",
            "## Related",
            "",
            f"- [[{topic} - MoC]]",
            "",
        ]
    )

    filename = f"{subtopic}.md"
    note_path = output_dir / filename
    note_path.write_text("\n".join(lines), encoding="utf-8")

    return note_path


def update_moc(
    topic_dir: Path,
    topic: str,
    reference_notes: List[str],
) -> Path:
    """Create or update the topic MoC."""
    moc_path = topic_dir / f"{topic} - MoC.md"

    lines = [
        "---",
        "type: moc",
        f"topic: {topic}",
        f"tags: [{topic.lower().replace(' ', '-')}]",
        f"date_created: {date.today().isoformat()}",
        "---",
        f"# {topic}",
        "",
        "---",
        "",
        "## Reference Notes",
        "",
    ]

    for note in sorted(reference_notes):
        lines.append(f"- [[{note}]]")

    lines.extend(
        [
            "",
            "---",
            "",
            "## Review",
            "",
            f"To review all cards in this topic, create a filtered deck with topic: `{topic}`",
            "",
        ]
    )

    moc_path.write_text("\n".join(lines), encoding="utf-8")
    return moc_path
