"""FastAPI server for SRS web interface."""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from .config import Config
from .database import Database, DBCard
from .filtered import FilterConfig, FilteredDeckManager
from .fsrs import FSRS, FSRSParams, Rating
from .parser import parse_file

# Initialize app
app = FastAPI(title="SRS Tool", version="0.1.0")

# Will be set on startup
db: Database = None
config: Config = None
fsrs: FSRS = None
deck_manager: FilteredDeckManager = None

# Templates and static files
BASE_DIR = Path(__file__).parent.parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def init_app(cfg: Config):
    """Initialize the application with config."""
    global db, config, fsrs, deck_manager

    config = cfg
    db = Database(config.database_path)
    fsrs = FSRS(FSRSParams(
        weights=None,  # Use defaults
        request_retention=config.target_retention,
        maximum_interval=config.maximum_interval,
    ))
    fsrs.params.weights = fsrs.params.weights or []  # Handle None case
    fsrs = FSRS()  # Use full defaults for now
    deck_manager = FilteredDeckManager(db)

    # Mount static files if they exist
    static_dir = BASE_DIR / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# Pydantic models for API

class ReviewRequest(BaseModel):
    card_id: str
    rating: int  # 1-4
    time_taken_ms: Optional[int] = None
    deck_id: Optional[str] = None


class ReviewResponse(BaseModel):
    next_card: Optional[dict] = None
    remaining: int
    deck_stats: Optional[dict] = None


class CreateDeckRequest(BaseModel):
    name: str
    tags: Optional[List[str]] = None
    folders: Optional[List[str]] = None
    states: Optional[List[str]] = None
    difficulty: Optional[str] = None
    last_wrong: bool = False
    count: Optional[int] = None
    sort: str = "random"


class DeckResponse(BaseModel):
    deck_id: str
    matching_cards: int


# Helper functions

def card_to_dict(db_card: DBCard) -> dict:
    """Convert a database card to API response dict."""
    # Need to parse the file to get actual card content
    cards = parse_file(db_card.file_path)
    card = next((c for c in cards if c.card_id == db_card.card_id), None)

    if not card:
        raise HTTPException(status_code=404, detail="Card content not found in file")

    result = {
        "card_id": db_card.card_id,
        "type": db_card.card_type,
        "topic": db_card.topic,
        "subtopic": db_card.subtopic,
        "tags": db_card.tags,
        "file_path": db_card.file_path,
        "state": db_card.state.name.lower(),
        "review_count": db_card.review_count,
        "lapses": db_card.lapses,
    }

    if card.card_type == "qa":
        result["question"] = card.question
        result["question_images"] = card.question_images
        result["answer"] = card.answer
        result["answer_images"] = card.answer_images
        # Occlusion card images
        if card.blocked_image:
            result["blocked_image"] = card.blocked_image
        if card.reveal_image:
            result["reveal_image"] = card.reveal_image
    else:  # cloze
        result["cloze_text"] = card.cloze_text
        result["cloze_deletions"] = card.cloze_deletions
        result["question_images"] = card.question_images

    return result


def render_cloze_question(text: str) -> str:
    """Render cloze text with deletions hidden."""
    return re.sub(r'\[([^\]]+)\]', '[...]', text)


def render_cloze_answer(text: str) -> str:
    """Render cloze text with deletions highlighted."""
    return re.sub(r'\[([^\]]+)\]', r'<strong>\1</strong>', text)


# API Routes

@app.get("/api/due")
async def get_due_count():
    """Get count of cards due for review."""
    count = db.get_due_count()
    return {"count": count}


@app.get("/api/next")
async def get_next_card(deck_id: Optional[str] = None):
    """Get the next card for review."""
    if deck_id:
        # Get from filtered deck
        deck = db.get_filtered_deck(deck_id)
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")

        db_card = deck_manager.get_next_card(deck)
        if not db_card:
            return {"card": None, "remaining": 0, "deck_completed": True}

        return {
            "card": card_to_dict(db_card),
            "remaining": len(deck.card_queue) - deck.current_position,
            "deck_stats": deck_manager.get_deck_stats(deck),
        }
    else:
        # Get from SRS queue
        due_cards = db.get_due_cards(limit=1)
        if not due_cards:
            return {"card": None, "remaining": 0}

        return {
            "card": card_to_dict(due_cards[0]),
            "remaining": db.get_due_count(),
        }


@app.post("/api/review", response_model=ReviewResponse)
async def submit_review(request: ReviewRequest):
    """Submit a card review."""
    if request.rating < 1 or request.rating > 4:
        raise HTTPException(status_code=400, detail="Rating must be 1-4")

    db_card = db.get_card(request.card_id)
    if not db_card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Get current state and log review
    prev_state = db_card.to_card_state()
    db.log_review(
        card_id=request.card_id,
        rating=request.rating,
        time_taken_ms=request.time_taken_ms,
        prev_state=prev_state,
    )

    # Calculate new state
    result = fsrs.review(prev_state, Rating(request.rating))
    db.update_card_state(request.card_id, result.new_state)

    # Advance deck if applicable
    deck_stats = None
    if request.deck_id:
        deck = deck_manager.advance_deck(request.deck_id)
        if deck:
            deck_stats = deck_manager.get_deck_stats(deck)

    # Get next card
    next_card = None
    remaining = 0

    if request.deck_id:
        deck = db.get_filtered_deck(request.deck_id)
        if deck:
            next_db_card = deck_manager.get_next_card(deck)
            if next_db_card:
                next_card = card_to_dict(next_db_card)
            remaining = len(deck.card_queue) - deck.current_position
    else:
        due_cards = db.get_due_cards(limit=1)
        if due_cards:
            next_card = card_to_dict(due_cards[0])
        remaining = db.get_due_count()

    return ReviewResponse(
        next_card=next_card,
        remaining=remaining,
        deck_stats=deck_stats,
    )


@app.get("/api/stats")
async def get_stats():
    """Get review statistics."""
    return db.get_stats()


@app.get("/api/tags")
async def get_tags():
    """Get all unique tags from cards."""
    cards = db.query_cards()
    all_tags = set()
    for card in cards:
        all_tags.update(card.tags)
    return {"tags": sorted(all_tags)}


@app.get("/api/folders")
async def get_folders():
    """Get all unique folder paths from cards."""
    cards = db.query_cards()
    folders = set()
    for card in cards:
        path = Path(card.file_path)
        # Get folder relative to vault
        if config and config.vault_path:
            try:
                rel = path.relative_to(config.vault_path)
                folders.add(str(rel.parent))
            except ValueError:
                folders.add(str(path.parent))
        else:
            folders.add(str(path.parent))
    return {"folders": sorted(folders)}


# Filtered deck routes

@app.get("/api/decks")
async def get_decks():
    """Get all filtered decks."""
    decks = db.get_filtered_decks()
    return {
        "decks": [deck_manager.get_deck_stats(d) for d in decks]
    }


@app.post("/api/decks", response_model=DeckResponse)
async def create_deck(request: CreateDeckRequest):
    """Create a new filtered deck."""
    config = FilterConfig(
        name=request.name,
        tags=request.tags,
        folders=request.folders,
        states=request.states,
        difficulty=request.difficulty,
        last_wrong=request.last_wrong,
        count=request.count,
        sort_order=request.sort,
    )

    deck = deck_manager.create_deck(config)
    return DeckResponse(
        deck_id=deck.deck_id,
        matching_cards=len(deck.card_queue),
    )


@app.delete("/api/decks/{deck_id}")
async def delete_deck(deck_id: str):
    """Delete a filtered deck."""
    deck = db.get_filtered_deck(deck_id)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    db.delete_filtered_deck(deck_id)
    return {"status": "deleted"}


@app.post("/api/decks/{deck_id}/reset")
async def reset_deck(deck_id: str):
    """Reset a filtered deck to the beginning."""
    deck = deck_manager.reset_deck(deck_id)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    return deck_manager.get_deck_stats(deck)


# Card management routes

@app.post("/api/cards/{card_id}/suspend")
async def suspend_card(card_id: str):
    """Suspend a card (abandon) - won't appear in reviews."""
    card = db.get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    db.suspend_card(card_id)
    return {"status": "suspended", "card_id": card_id}


@app.post("/api/cards/{card_id}/flag")
async def flag_card(card_id: str):
    """Flag a card for editing."""
    card = db.get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    db.flag_card(card_id)
    return {"status": "flagged", "card_id": card_id}


# Web UI routes

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Main review interface."""
    stats = db.get_stats()
    decks = db.get_filtered_decks()

    return templates.TemplateResponse(
        "review.html",
        {
            "request": request,
            "stats": stats,
            "decks": [deck_manager.get_deck_stats(d) for d in decks],
        },
    )
