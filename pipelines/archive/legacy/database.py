"""SQLite database operations for SRS state management."""

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterator, List, Optional, Union

from .fsrs import CardState, State
from .parser import Card


@dataclass
class DBCard:
    """Card record from the database."""

    card_id: str
    file_path: str
    content_hash: str
    card_type: str

    # FSRS state
    stability: float
    difficulty: float
    due_date: Optional[datetime]
    last_review: Optional[datetime]
    review_count: int
    lapses: int
    state: State

    # Metadata
    topic: Optional[str]
    subtopic: Optional[str]
    tags: List[str]

    created_at: datetime
    updated_at: datetime

    def to_card_state(self) -> CardState:
        """Convert to FSRS CardState."""
        return CardState(
            stability=self.stability,
            difficulty=self.difficulty,
            due_date=self.due_date,
            last_review=self.last_review,
            review_count=self.review_count,
            lapses=self.lapses,
            state=self.state,
        )


@dataclass
class Review:
    """Review history record."""

    id: int
    card_id: str
    reviewed_at: datetime
    rating: int
    time_taken_ms: Optional[int]
    prev_stability: Optional[float]
    prev_difficulty: Optional[float]
    prev_interval_days: Optional[float]


@dataclass
class FilteredDeck:
    """Filtered deck configuration and progress."""

    deck_id: str
    name: str
    created_at: datetime
    updated_at: datetime

    # Filter config
    filter_tags: List[str]
    filter_folders: List[str]
    filter_states: List[str]
    filter_difficulty: Optional[str]
    filter_last_wrong: bool
    card_count: Optional[int]
    sort_order: str

    # Progress
    card_queue: List[str]
    current_position: int
    completed: bool


@dataclass
class SyncState:
    """File sync tracking record."""

    file_path: str
    last_modified: datetime
    last_scanned: datetime
    card_count: int


class Database:
    """SQLite database for SRS state."""

    def __init__(self, db_path: Union[str, Path]):
        self.db_path = Path(db_path)
        self._init_db()

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        """Context manager for database connections."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        """Initialize database schema."""
        with self._connection() as conn:
            conn.executescript(
                """
                -- Card state (FSRS parameters)
                CREATE TABLE IF NOT EXISTS cards (
                    card_id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    content_hash TEXT NOT NULL,
                    card_type TEXT NOT NULL,

                    -- FSRS state
                    stability REAL DEFAULT 0.0,
                    difficulty REAL DEFAULT 0.0,
                    due_date TEXT,
                    last_review TEXT,
                    review_count INTEGER DEFAULT 0,
                    lapses INTEGER DEFAULT 0,
                    state TEXT DEFAULT 'new',

                    -- Inherited metadata
                    topic TEXT,
                    subtopic TEXT,
                    tags TEXT,

                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_date);
                CREATE INDEX IF NOT EXISTS idx_cards_state ON cards(state);
                CREATE INDEX IF NOT EXISTS idx_cards_file ON cards(file_path);

                -- Review history
                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id TEXT NOT NULL,
                    reviewed_at TEXT NOT NULL,
                    rating INTEGER NOT NULL,
                    time_taken_ms INTEGER,

                    -- State snapshot before review
                    prev_stability REAL,
                    prev_difficulty REAL,
                    prev_interval_days REAL,

                    FOREIGN KEY (card_id) REFERENCES cards(card_id)
                );

                CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id);
                CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(reviewed_at);

                -- Filtered decks
                CREATE TABLE IF NOT EXISTS filtered_decks (
                    deck_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,

                    -- Filter config
                    filter_tags TEXT,
                    filter_folders TEXT,
                    filter_states TEXT,
                    filter_difficulty TEXT,
                    filter_last_wrong BOOLEAN DEFAULT FALSE,
                    card_count INTEGER,
                    sort_order TEXT DEFAULT 'random',

                    -- Progress
                    card_queue TEXT,
                    current_position INTEGER DEFAULT 0,
                    completed BOOLEAN DEFAULT FALSE
                );

                -- File sync tracking
                CREATE TABLE IF NOT EXISTS sync_state (
                    file_path TEXT PRIMARY KEY,
                    last_modified TEXT NOT NULL,
                    last_scanned TEXT NOT NULL,
                    card_count INTEGER DEFAULT 0
                );
                """
            )

    # Card operations

    def get_card(self, card_id: str) -> Optional[DBCard]:
        """Get a card by ID."""
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM cards WHERE card_id = ?", (card_id,)
            ).fetchone()

            if row is None:
                return None

            return self._row_to_card(row)

    def get_cards_by_file(self, file_path: str) -> List[DBCard]:
        """Get all cards from a specific file."""
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT * FROM cards WHERE file_path = ?", (file_path,)
            ).fetchall()

            return [self._row_to_card(row) for row in rows]

    def get_due_cards(
        self, limit: Optional[int] = None, now: Optional[datetime] = None
    ) -> List[DBCard]:
        """Get cards due for review."""
        if now is None:
            now = datetime.now()

        query = """
            SELECT * FROM cards
            WHERE due_date IS NULL OR due_date <= ?
            ORDER BY
                CASE state
                    WHEN 'new' THEN 0
                    WHEN 'learning' THEN 1
                    WHEN 'relearning' THEN 2
                    ELSE 3
                END,
                due_date
        """
        params: list = [now.isoformat()]

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_card(row) for row in rows]

    def get_due_count(self, now: Optional[datetime] = None) -> int:
        """Get count of cards due for review."""
        if now is None:
            now = datetime.now()

        with self._connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM cards WHERE due_date IS NULL OR due_date <= ?",
                (now.isoformat(),),
            ).fetchone()
            return row[0]

    def insert_card(self, card: Card) -> None:
        """Insert a new card into the database."""
        now = datetime.now().isoformat()

        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO cards (
                    card_id, file_path, content_hash, card_type,
                    stability, difficulty, due_date, last_review,
                    review_count, lapses, state,
                    topic, subtopic, tags,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    card.card_id,
                    card.file_path,
                    card.content_hash,
                    card.card_type,
                    0.0,  # stability
                    0.0,  # difficulty
                    None,  # due_date
                    None,  # last_review
                    0,  # review_count
                    0,  # lapses
                    "new",  # state
                    card.topic,
                    card.subtopic,
                    json.dumps(card.tags),
                    now,
                    now,
                ),
            )

    def update_card_content(self, card: Card) -> None:
        """Update card content (preserves FSRS state)."""
        now = datetime.now().isoformat()

        with self._connection() as conn:
            conn.execute(
                """
                UPDATE cards SET
                    file_path = ?,
                    content_hash = ?,
                    card_type = ?,
                    topic = ?,
                    subtopic = ?,
                    tags = ?,
                    updated_at = ?
                WHERE card_id = ?
                """,
                (
                    card.file_path,
                    card.content_hash,
                    card.card_type,
                    card.topic,
                    card.subtopic,
                    json.dumps(card.tags),
                    now,
                    card.card_id,
                ),
            )

    def update_card_state(self, card_id: str, state: CardState) -> None:
        """Update card FSRS state after review."""
        now = datetime.now().isoformat()

        with self._connection() as conn:
            conn.execute(
                """
                UPDATE cards SET
                    stability = ?,
                    difficulty = ?,
                    due_date = ?,
                    last_review = ?,
                    review_count = ?,
                    lapses = ?,
                    state = ?,
                    updated_at = ?
                WHERE card_id = ?
                """,
                (
                    state.stability,
                    state.difficulty,
                    state.due_date.isoformat() if state.due_date else None,
                    state.last_review.isoformat() if state.last_review else None,
                    state.review_count,
                    state.lapses,
                    state.state.name.lower(),
                    now,
                    card_id,
                ),
            )

    def delete_card(self, card_id: str) -> None:
        """Delete a card from the database."""
        with self._connection() as conn:
            conn.execute("DELETE FROM cards WHERE card_id = ?", (card_id,))

    def suspend_card(self, card_id: str) -> None:
        """Suspend a card (won't appear in reviews).

        Sets due_date far in the future and marks state as 'suspended'.
        """
        now = datetime.now().isoformat()
        # Set due date 100 years in future
        far_future = datetime(2125, 1, 1).isoformat()

        with self._connection() as conn:
            conn.execute(
                """
                UPDATE cards SET
                    state = 'suspended',
                    due_date = ?,
                    updated_at = ?
                WHERE card_id = ?
                """,
                (far_future, now, card_id),
            )

    def flag_card(self, card_id: str) -> None:
        """Flag a card for editing.

        Adds 'flagged' to the tags list.
        """
        now = datetime.now().isoformat()

        with self._connection() as conn:
            # Get current tags
            row = conn.execute(
                "SELECT tags FROM cards WHERE card_id = ?", (card_id,)
            ).fetchone()

            if row:
                tags = json.loads(row["tags"]) if row["tags"] else []
                if "flagged" not in tags:
                    tags.append("flagged")

                conn.execute(
                    """
                    UPDATE cards SET
                        tags = ?,
                        updated_at = ?
                    WHERE card_id = ?
                    """,
                    (json.dumps(tags), now, card_id),
                )

    # Review operations

    def log_review(
        self,
        card_id: str,
        rating: int,
        time_taken_ms: Optional[int] = None,
        prev_state: Optional[CardState] = None,
    ) -> None:
        """Log a review to history."""
        now = datetime.now().isoformat()

        prev_interval = None
        if prev_state and prev_state.due_date and prev_state.last_review:
            prev_interval = (
                prev_state.due_date - prev_state.last_review
            ).total_seconds() / 86400

        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO reviews (
                    card_id, reviewed_at, rating, time_taken_ms,
                    prev_stability, prev_difficulty, prev_interval_days
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    card_id,
                    now,
                    rating,
                    time_taken_ms,
                    prev_state.stability if prev_state else None,
                    prev_state.difficulty if prev_state else None,
                    prev_interval,
                ),
            )

    def get_reviews_today(self, now: Optional[datetime] = None) -> int:
        """Get count of reviews done today."""
        if now is None:
            now = datetime.now()

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        with self._connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE reviewed_at >= ?",
                (today_start.isoformat(),),
            ).fetchone()
            return row[0]

    # Filtered deck operations

    def get_filtered_decks(self) -> List[FilteredDeck]:
        """Get all filtered decks."""
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT * FROM filtered_decks ORDER BY updated_at DESC"
            ).fetchall()
            return [self._row_to_deck(row) for row in rows]

    def get_filtered_deck(self, deck_id: str) -> Optional[FilteredDeck]:
        """Get a filtered deck by ID."""
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM filtered_decks WHERE deck_id = ?", (deck_id,)
            ).fetchone()

            if row is None:
                return None

            return self._row_to_deck(row)

    def create_filtered_deck(
        self,
        deck_id: str,
        name: str,
        card_ids: List[str],
        filter_tags: Optional[List[str]] = None,
        filter_folders: Optional[List[str]] = None,
        filter_states: Optional[List[str]] = None,
        filter_difficulty: Optional[str] = None,
        filter_last_wrong: bool = False,
        sort_order: str = "random",
    ) -> None:
        """Create a new filtered deck."""
        now = datetime.now().isoformat()

        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO filtered_decks (
                    deck_id, name, created_at, updated_at,
                    filter_tags, filter_folders, filter_states,
                    filter_difficulty, filter_last_wrong,
                    card_count, sort_order,
                    card_queue, current_position, completed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    deck_id,
                    name,
                    now,
                    now,
                    json.dumps(filter_tags or []),
                    json.dumps(filter_folders or []),
                    json.dumps(filter_states or []),
                    filter_difficulty,
                    filter_last_wrong,
                    len(card_ids),
                    sort_order,
                    json.dumps(card_ids),
                    0,
                    False,
                ),
            )

    def update_deck_progress(
        self, deck_id: str, position: int, completed: bool = False
    ) -> None:
        """Update filtered deck progress."""
        now = datetime.now().isoformat()

        with self._connection() as conn:
            conn.execute(
                """
                UPDATE filtered_decks SET
                    current_position = ?,
                    completed = ?,
                    updated_at = ?
                WHERE deck_id = ?
                """,
                (position, completed, now, deck_id),
            )

    def delete_filtered_deck(self, deck_id: str) -> None:
        """Delete a filtered deck."""
        with self._connection() as conn:
            conn.execute("DELETE FROM filtered_decks WHERE deck_id = ?", (deck_id,))

    # Sync state operations

    def get_sync_state(self, file_path: str) -> Optional[SyncState]:
        """Get sync state for a file."""
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM sync_state WHERE file_path = ?", (file_path,)
            ).fetchone()

            if row is None:
                return None

            return SyncState(
                file_path=row["file_path"],
                last_modified=datetime.fromisoformat(row["last_modified"]),
                last_scanned=datetime.fromisoformat(row["last_scanned"]),
                card_count=row["card_count"],
            )

    def update_sync_state(
        self, file_path: str, last_modified: datetime, card_count: int
    ) -> None:
        """Update sync state for a file."""
        now = datetime.now().isoformat()

        with self._connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sync_state
                    (file_path, last_modified, last_scanned, card_count)
                VALUES (?, ?, ?, ?)
                """,
                (file_path, last_modified.isoformat(), now, card_count),
            )

    def delete_sync_state(self, file_path: str) -> None:
        """Delete sync state for a file."""
        with self._connection() as conn:
            conn.execute("DELETE FROM sync_state WHERE file_path = ?", (file_path,))

    # Statistics

    def get_stats(self) -> dict:
        """Get review statistics."""
        now = datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        with self._connection() as conn:
            # Due today
            due_today = conn.execute(
                "SELECT COUNT(*) FROM cards WHERE due_date IS NULL OR due_date <= ?",
                (now.isoformat(),),
            ).fetchone()[0]

            # Reviewed today
            reviewed_today = conn.execute(
                "SELECT COUNT(*) FROM reviews WHERE reviewed_at >= ?",
                (today_start.isoformat(),),
            ).fetchone()[0]

            # Cards by state
            state_counts = {}
            for row in conn.execute(
                "SELECT state, COUNT(*) as count FROM cards GROUP BY state"
            ):
                state_counts[row["state"]] = row["count"]

            # Retention rate (last 30 days)
            thirty_days_ago = (now - __import__("datetime").timedelta(days=30)).isoformat()
            retention_row = conn.execute(
                """
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) as correct
                FROM reviews WHERE reviewed_at >= ?
                """,
                (thirty_days_ago,),
            ).fetchone()

            retention_rate = 0.0
            if retention_row["total"] > 0:
                retention_rate = retention_row["correct"] / retention_row["total"]

            return {
                "due_today": due_today,
                "reviewed_today": reviewed_today,
                "new": state_counts.get("new", 0),
                "learning": state_counts.get("learning", 0),
                "review": state_counts.get("review", 0),
                "relearning": state_counts.get("relearning", 0),
                "retention_rate": round(retention_rate, 2),
            }

    # Query helpers

    def query_cards(
        self,
        tags: Optional[List[str]] = None,
        folders: Optional[List[str]] = None,
        states: Optional[List[str]] = None,
        limit: Optional[int] = None,
    ) -> List[DBCard]:
        """Query cards by filters."""
        conditions = []
        params: list = []

        if tags:
            # Check if any tag matches
            tag_conditions = []
            for tag in tags:
                tag_conditions.append("tags LIKE ?")
                params.append(f'%"{tag}"%')
            conditions.append(f"({' OR '.join(tag_conditions)})")

        if folders:
            folder_conditions = []
            for folder in folders:
                folder_conditions.append("file_path LIKE ?")
                params.append(f"{folder}%")
            conditions.append(f"({' OR '.join(folder_conditions)})")

        if states:
            placeholders = ",".join("?" * len(states))
            conditions.append(f"state IN ({placeholders})")
            params.extend(states)

        query = "SELECT * FROM cards"
        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_card(row) for row in rows]

    # Conversion helpers

    def _row_to_card(self, row: sqlite3.Row) -> DBCard:
        """Convert a database row to a DBCard."""
        return DBCard(
            card_id=row["card_id"],
            file_path=row["file_path"],
            content_hash=row["content_hash"],
            card_type=row["card_type"],
            stability=row["stability"],
            difficulty=row["difficulty"],
            due_date=datetime.fromisoformat(row["due_date"])
            if row["due_date"]
            else None,
            last_review=datetime.fromisoformat(row["last_review"])
            if row["last_review"]
            else None,
            review_count=row["review_count"],
            lapses=row["lapses"],
            state=State[row["state"].upper()],
            topic=row["topic"],
            subtopic=row["subtopic"],
            tags=json.loads(row["tags"]) if row["tags"] else [],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def _row_to_deck(self, row: sqlite3.Row) -> FilteredDeck:
        """Convert a database row to a FilteredDeck."""
        return FilteredDeck(
            deck_id=row["deck_id"],
            name=row["name"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            filter_tags=json.loads(row["filter_tags"]) if row["filter_tags"] else [],
            filter_folders=json.loads(row["filter_folders"])
            if row["filter_folders"]
            else [],
            filter_states=json.loads(row["filter_states"])
            if row["filter_states"]
            else [],
            filter_difficulty=row["filter_difficulty"],
            filter_last_wrong=bool(row["filter_last_wrong"]),
            card_count=row["card_count"],
            sort_order=row["sort_order"],
            card_queue=json.loads(row["card_queue"]) if row["card_queue"] else [],
            current_position=row["current_position"],
            completed=bool(row["completed"]),
        )
