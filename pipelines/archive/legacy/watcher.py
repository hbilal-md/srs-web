"""File watcher for Obsidian vault synchronization."""

import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional, Union

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .database import Database
from .parser import add_card_ids, parse_file

logger = logging.getLogger(__name__)


class VaultHandler(FileSystemEventHandler):
    """Handle file system events for the Obsidian vault."""

    def __init__(
        self,
        db: Database,
        on_change: Optional[Callable[[str], None]] = None,
    ):
        self.db = db
        self.on_change = on_change
        self._debounce: dict[str, float] = {}
        self._debounce_seconds = 1.0  # Wait 1 second before processing

    def _should_process(self, path: str) -> bool:
        """Check if we should process this file (debounce)."""
        now = time.time()
        last = self._debounce.get(path, 0)

        if now - last < self._debounce_seconds:
            return False

        self._debounce[path] = now
        return True

    def _is_markdown(self, path: str) -> bool:
        """Check if path is a markdown file."""
        return path.endswith('.md') and not path.startswith('.')

    def _process_file(self, file_path: str):
        """Process a changed markdown file."""
        path = Path(file_path)

        if not path.exists():
            # File was deleted
            self._handle_deletion(file_path)
            return

        if not self._is_markdown(file_path):
            return

        # Check modification time
        mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
        sync_state = self.db.get_sync_state(file_path)

        if sync_state and sync_state.last_modified >= mtime:
            # Already processed
            return

        logger.info(f"Processing: {file_path}")

        # Parse cards from file
        cards = parse_file(file_path)

        # Get existing cards for this file
        existing_cards = {c.card_id: c for c in self.db.get_cards_by_file(file_path)}
        parsed_ids = {c.card_id for c in cards}

        # Update or insert cards
        for card in cards:
            if card.card_id in existing_cards:
                existing = existing_cards[card.card_id]
                if card.content_hash != existing.content_hash:
                    # Card content changed, update metadata but preserve FSRS state
                    logger.info(f"Updated card: {card.card_id}")
                    self.db.update_card_content(card)
            else:
                # New card
                logger.info(f"New card: {card.card_id}")
                self.db.insert_card(card)

        # Delete removed cards
        for card_id in existing_cards:
            if card_id not in parsed_ids:
                logger.info(f"Deleted card: {card_id}")
                self.db.delete_card(card_id)

        # Update sync state
        self.db.update_sync_state(file_path, mtime, len(cards))

        if self.on_change:
            self.on_change(file_path)

    def _handle_deletion(self, file_path: str):
        """Handle file deletion."""
        # Remove all cards from this file
        cards = self.db.get_cards_by_file(file_path)
        for card in cards:
            logger.info(f"Deleted card (file removed): {card.card_id}")
            self.db.delete_card(card.card_id)

        # Remove sync state
        self.db.delete_sync_state(file_path)

    def on_modified(self, event: FileSystemEvent):
        """Handle file modification."""
        if event.is_directory:
            return

        if not self._should_process(event.src_path):
            return

        self._process_file(event.src_path)

    def on_created(self, event: FileSystemEvent):
        """Handle file creation."""
        if event.is_directory:
            return

        if not self._should_process(event.src_path):
            return

        self._process_file(event.src_path)

    def on_deleted(self, event: FileSystemEvent):
        """Handle file deletion."""
        if event.is_directory:
            return

        if self._is_markdown(event.src_path):
            self._handle_deletion(event.src_path)

    def on_moved(self, event: FileSystemEvent):
        """Handle file move/rename."""
        if event.is_directory:
            return

        # Delete from old path
        if self._is_markdown(event.src_path):
            self._handle_deletion(event.src_path)

        # Process at new path
        if hasattr(event, 'dest_path') and self._is_markdown(event.dest_path):
            self._process_file(event.dest_path)


class VaultWatcher:
    """Watch an Obsidian vault for changes."""

    def __init__(
        self,
        vault_path: Union[str, Path],
        db: Database,
        on_change: Optional[Callable[[str], None]] = None,
    ):
        self.vault_path = Path(vault_path)
        self.db = db
        self.handler = VaultHandler(db, on_change)
        self.observer = Observer()

    def start(self):
        """Start watching the vault."""
        logger.info(f"Starting watcher for: {self.vault_path}")
        self.observer.schedule(self.handler, str(self.vault_path), recursive=True)
        self.observer.start()

    def stop(self):
        """Stop watching the vault."""
        logger.info("Stopping watcher")
        self.observer.stop()
        self.observer.join()

    def scan_all(self):
        """Scan all markdown files in the vault."""
        logger.info(f"Scanning vault: {self.vault_path}")

        count = 0
        for md_file in self.vault_path.rglob('*.md'):
            # Skip hidden files and folders
            if any(part.startswith('.') for part in md_file.parts):
                continue

            self.handler._process_file(str(md_file))
            count += 1

        logger.info(f"Scanned {count} files")
        return count


def add_missing_ids(vault_path: Union[str, Path]) -> int:
    """Add missing card IDs to all files in the vault.

    Returns total number of IDs added.
    """
    vault_path = Path(vault_path)
    total_added = 0

    for md_file in vault_path.rglob('*.md'):
        # Skip hidden files and folders
        if any(part.startswith('.') for part in md_file.parts):
            continue

        added = add_card_ids(md_file)
        if added > 0:
            logger.info(f"Added {added} IDs to: {md_file}")
            total_added += added

    return total_added
