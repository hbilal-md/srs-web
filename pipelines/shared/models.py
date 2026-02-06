"""Shared data models for card creation pipelines."""

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class CardData:
    """Card data for insertion into Supabase."""
    card_type: str  # 'qa', 'cloze', 'occlusion'
    question: Optional[str] = None
    answer: Optional[str] = None
    cloze_text: Optional[str] = None
    blocked_image: Optional[str] = None
    reveal_image: Optional[str] = None
    topic: Optional[str] = None
    subtopic: Optional[str] = None
    source_pdf: Optional[str] = None
    obsidian_note: Optional[str] = None
    tags: Optional[List[str]] = None
    difficulty: str = "medium"
    importance: str = "core"
    quality: str = "A"
