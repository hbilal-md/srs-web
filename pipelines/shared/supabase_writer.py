"""Supabase card writer for card creation pipelines.

Handles inserting cards into the Supabase database.
Credentials are read from environment variables only — never hardcoded.
"""

import os
import secrets
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()

try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False

from shared.models import CardData


def generate_card_id() -> str:
    """Generate an 8-character hex card ID."""
    return secrets.token_hex(4)


class SupabaseCardWriter:
    """Writes cards to Supabase database."""

    def __init__(self, url: Optional[str] = None, key: Optional[str] = None):
        if not HAS_SUPABASE:
            raise ImportError("supabase-py not installed. Run: pip install supabase")

        self.url = url or os.getenv("SUPABASE_URL")
        self.key = key or os.getenv("SUPABASE_SERVICE_KEY")

        if not self.url or not self.key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env"
            )

        self.client: Client = create_client(self.url, self.key)

    def insert_card(self, card: CardData) -> dict:
        """Insert a single card into the database."""
        data = self._card_to_row(card)
        result = self.client.table("cards").insert(data).execute()
        if result.data:
            return result.data[0]
        raise Exception(f"Failed to insert card: {result}")

    def insert_cards(self, cards: List[CardData]) -> List[dict]:
        """Insert multiple cards into the database."""
        data = [self._card_to_row(card) for card in cards]
        result = self.client.table("cards").insert(data).execute()
        if result.data:
            return result.data
        raise Exception(f"Failed to insert cards: {result}")

    def get_card_count(self) -> int:
        """Get total number of cards in the database."""
        result = self.client.table("cards").select("id", count="exact").execute()
        return result.count or 0

    def get_topics(self) -> List[str]:
        """Get list of unique topics."""
        result = self.client.table("cards").select("topic").execute()
        topics = set()
        for card in result.data or []:
            if card.get("topic"):
                topics.add(card["topic"])
        return sorted(topics)

    @staticmethod
    def _card_to_row(card: CardData) -> dict:
        return {
            "card_id": generate_card_id(),
            "card_type": card.card_type,
            "question": card.question,
            "answer": card.answer,
            "cloze_text": card.cloze_text,
            "blocked_image": card.blocked_image,
            "reveal_image": card.reveal_image,
            "topic": card.topic,
            "subtopic": card.subtopic,
            "source_pdf": card.source_pdf,
            "obsidian_note": card.obsidian_note,
            "tags": card.tags or [],
            "state": "new",
            "stability": 0,
            "difficulty": 0,
            "review_count": 0,
            "lapses": 0,
            "due_date": datetime.now().isoformat(),
            "importance": card.importance,
            "quality": card.quality,
        }


def test_connection():
    """Test the Supabase connection."""
    try:
        writer = SupabaseCardWriter()
        count = writer.get_card_count()
        print(f"Connected to Supabase. {count} cards in database.")
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        return False


if __name__ == "__main__":
    test_connection()
