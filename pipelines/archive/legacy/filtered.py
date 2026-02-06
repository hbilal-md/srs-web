"""Filtered deck logic."""

import random
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from .database import Database, DBCard, FilteredDeck


@dataclass
class FilterConfig:
    """Configuration for creating a filtered deck."""

    name: str
    tags: Optional[List[str]] = None
    folders: Optional[List[str]] = None
    states: Optional[List[str]] = None
    difficulty: Optional[str] = None  # "hard" for high difficulty
    last_wrong: bool = False
    count: Optional[int] = None
    sort_order: str = "random"  # random, due, difficulty


def generate_deck_id() -> str:
    """Generate a unique deck ID."""
    return uuid.uuid4().hex[:12]


class FilteredDeckManager:
    """Manage filtered deck creation and review."""

    def __init__(self, db: Database):
        self.db = db

    def create_deck(self, config: FilterConfig) -> FilteredDeck:
        """Create a new filtered deck based on config."""
        # Query matching cards
        cards = self.db.query_cards(
            tags=config.tags,
            folders=config.folders,
            states=config.states,
        )

        # Additional filters
        if config.difficulty == "hard":
            cards = [c for c in cards if c.difficulty >= 7.0]

        if config.last_wrong:
            # Filter to cards where last review was Again
            # This requires checking review history
            filtered = []
            for card in cards:
                # Simple check: high lapse count suggests recent failures
                if card.lapses > 0:
                    filtered.append(card)
            cards = filtered

        # Sort cards
        if config.sort_order == "random":
            random.shuffle(cards)
        elif config.sort_order == "due":
            cards.sort(key=lambda c: c.due_date or datetime.min)
        elif config.sort_order == "difficulty":
            cards.sort(key=lambda c: c.difficulty, reverse=True)

        # Limit count
        if config.count and config.count < len(cards):
            cards = cards[: config.count]

        # Create deck
        deck_id = generate_deck_id()
        card_ids = [c.card_id for c in cards]

        self.db.create_filtered_deck(
            deck_id=deck_id,
            name=config.name,
            card_ids=card_ids,
            filter_tags=config.tags,
            filter_folders=config.folders,
            filter_states=config.states,
            filter_difficulty=config.difficulty,
            filter_last_wrong=config.last_wrong,
            sort_order=config.sort_order,
        )

        return self.db.get_filtered_deck(deck_id)

    def get_next_card(self, deck: FilteredDeck) -> Optional[DBCard]:
        """Get the next card in a filtered deck."""
        if deck.completed or deck.current_position >= len(deck.card_queue):
            return None

        card_id = deck.card_queue[deck.current_position]
        return self.db.get_card(card_id)

    def advance_deck(self, deck_id: str) -> Optional[FilteredDeck]:
        """Advance deck position after a review."""
        deck = self.db.get_filtered_deck(deck_id)
        if not deck:
            return None

        new_position = deck.current_position + 1
        completed = new_position >= len(deck.card_queue)

        self.db.update_deck_progress(deck_id, new_position, completed)

        return self.db.get_filtered_deck(deck_id)

    def reset_deck(self, deck_id: str) -> Optional[FilteredDeck]:
        """Reset deck to beginning."""
        deck = self.db.get_filtered_deck(deck_id)
        if not deck:
            return None

        self.db.update_deck_progress(deck_id, 0, False)
        return self.db.get_filtered_deck(deck_id)

    def get_deck_stats(self, deck: FilteredDeck) -> dict:
        """Get statistics for a filtered deck."""
        return {
            "deck_id": deck.deck_id,
            "name": deck.name,
            "total": len(deck.card_queue),
            "position": deck.current_position,
            "remaining": len(deck.card_queue) - deck.current_position,
            "completed": deck.completed,
            "progress_percent": round(
                100 * deck.current_position / max(len(deck.card_queue), 1)
            ),
        }
