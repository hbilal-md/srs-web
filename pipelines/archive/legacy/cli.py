"""CLI entry point for SRS tool."""

import argparse
import logging
import sys
import time
from pathlib import Path

import uvicorn

from .config import Config
from .database import Database
from .filtered import FilterConfig, FilteredDeckManager
from .fsrs import FSRS, Rating, format_interval
from .watcher import VaultWatcher, add_missing_ids

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def cmd_serve(args):
    """Start the web server."""
    config = Config.load(args.config)

    if args.port:
        config.port = args.port
    if args.host:
        config.host = args.host
    if args.vault:
        config.vault_path = args.vault

    if not config.vault_path:
        print("Error: vault_path not configured. Use --vault or set in config.")
        sys.exit(1)

    # Initialize database
    db = Database(config.database_path)

    # Start file watcher
    watcher = VaultWatcher(config.vault_path, db)

    # Initial scan
    print(f"Scanning vault: {config.vault_path}")
    watcher.scan_all()

    # Start watching in background
    watcher.start()

    # Start server
    print(f"Starting server at http://{config.host}:{config.port}")

    # Import and initialize the app
    from .server import app, init_app
    init_app(config)

    try:
        uvicorn.run(app, host=config.host, port=config.port)
    finally:
        watcher.stop()


def cmd_scan(args):
    """Scan vault for cards."""
    config = Config.load(args.config)

    vault_path = args.path or config.vault_path
    if not vault_path:
        print("Error: No vault path specified")
        sys.exit(1)

    db = Database(config.database_path)
    watcher = VaultWatcher(vault_path, db)

    print(f"Scanning: {vault_path}")
    count = watcher.scan_all()
    print(f"Scanned {count} files")

    # Show stats
    stats = db.get_stats()
    print(f"\nCards by state:")
    print(f"  New:        {stats['new']}")
    print(f"  Learning:   {stats['learning']}")
    print(f"  Review:     {stats['review']}")
    print(f"  Relearning: {stats['relearning']}")
    print(f"\nDue today: {stats['due_today']}")


def cmd_stats(args):
    """Show statistics."""
    config = Config.load(args.config)
    db = Database(config.database_path)

    stats = db.get_stats()

    print("=== SRS Statistics ===\n")
    print(f"Due today:      {stats['due_today']}")
    print(f"Reviewed today: {stats['reviewed_today']}")
    print(f"\nCards by state:")
    print(f"  New:        {stats['new']}")
    print(f"  Learning:   {stats['learning']}")
    print(f"  Review:     {stats['review']}")
    print(f"  Relearning: {stats['relearning']}")
    print(f"\nRetention rate (30d): {stats['retention_rate']:.0%}")


def cmd_due(args):
    """List due cards."""
    config = Config.load(args.config)
    db = Database(config.database_path)

    # Build query filters
    tags = args.tags.split(",") if args.tags else None
    count = args.count or 10

    if tags:
        cards = db.query_cards(tags=tags)
        # Filter to due cards
        from datetime import datetime
        now = datetime.now()
        cards = [c for c in cards if c.due_date is None or c.due_date <= now]
    else:
        cards = db.get_due_cards(limit=count)

    if not cards:
        print("No cards due!")
        return

    print(f"Due cards ({len(cards)}):\n")
    for card in cards[:count]:
        print(f"  [{card.card_id}] {card.topic or 'No topic'}")
        print(f"    State: {card.state.name.lower()}, Reviews: {card.review_count}")
        if card.tags:
            print(f"    Tags: {', '.join(card.tags)}")
        print()


def cmd_reset(args):
    """Reset a card's state."""
    config = Config.load(args.config)
    db = Database(config.database_path)

    card = db.get_card(args.card_id)
    if not card:
        print(f"Card not found: {args.card_id}")
        sys.exit(1)

    from .fsrs import CardState, State
    new_state = CardState()  # Fresh state

    db.update_card_state(args.card_id, new_state)
    print(f"Reset card: {args.card_id}")


def cmd_add_ids(args):
    """Add missing card IDs to vault files."""
    config = Config.load(args.config)

    vault_path = args.path or config.vault_path
    if not vault_path:
        print("Error: No vault path specified")
        sys.exit(1)

    print(f"Adding missing card IDs in: {vault_path}")
    added = add_missing_ids(vault_path)
    print(f"Added {added} card IDs")


def cmd_export(args):
    """Export review history to CSV."""
    config = Config.load(args.config)
    db = Database(config.database_path)

    output = args.output or "reviews.csv"

    with db._connection() as conn:
        rows = conn.execute(
            """
            SELECT
                r.card_id,
                r.reviewed_at,
                r.rating,
                r.time_taken_ms,
                r.prev_stability,
                r.prev_difficulty,
                r.prev_interval_days,
                c.topic,
                c.card_type
            FROM reviews r
            LEFT JOIN cards c ON r.card_id = c.card_id
            ORDER BY r.reviewed_at
            """
        ).fetchall()

    with open(output, "w") as f:
        f.write("card_id,reviewed_at,rating,time_taken_ms,prev_stability,prev_difficulty,prev_interval_days,topic,card_type\n")
        for row in rows:
            f.write(",".join(str(v) if v is not None else "" for v in row) + "\n")

    print(f"Exported {len(rows)} reviews to {output}")


def cmd_init(args):
    """Initialize a new SRS configuration."""
    config_path = args.output or "srs.yaml"

    if Path(config_path).exists() and not args.force:
        print(f"Config already exists: {config_path}")
        print("Use --force to overwrite")
        sys.exit(1)

    config = Config(
        vault_path=args.vault or "",
        database_path="./srs.db",
    )
    config.save(config_path)
    print(f"Created config: {config_path}")
    print(f"\nEdit the file to set your vault_path, then run:")
    print(f"  srs scan")
    print(f"  srs serve")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="SRS Tool - Markdown-first spaced repetition"
    )
    parser.add_argument(
        "--config", "-c",
        help="Path to config file (default: ./srs.yaml)",
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # serve
    serve_parser = subparsers.add_parser("serve", help="Start the web server")
    serve_parser.add_argument("--port", "-p", type=int, help="Server port")
    serve_parser.add_argument("--host", "-H", help="Server host")
    serve_parser.add_argument("--vault", "-v", help="Vault path")

    # scan
    scan_parser = subparsers.add_parser("scan", help="Scan vault for cards")
    scan_parser.add_argument("--path", "-p", help="Vault path to scan")

    # stats
    stats_parser = subparsers.add_parser("stats", help="Show statistics")

    # due
    due_parser = subparsers.add_parser("due", help="List due cards")
    due_parser.add_argument("--tags", "-t", help="Filter by tags (comma-separated)")
    due_parser.add_argument("--count", "-n", type=int, help="Number of cards to show")

    # reset
    reset_parser = subparsers.add_parser("reset", help="Reset a card's state")
    reset_parser.add_argument("card_id", help="Card ID to reset")

    # add-ids
    addids_parser = subparsers.add_parser("add-ids", help="Add missing card IDs")
    addids_parser.add_argument("--path", "-p", help="Vault path")

    # export
    export_parser = subparsers.add_parser("export-reviews", help="Export reviews to CSV")
    export_parser.add_argument("--output", "-o", help="Output file path")

    # init
    init_parser = subparsers.add_parser("init", help="Initialize configuration")
    init_parser.add_argument("--vault", "-v", help="Vault path")
    init_parser.add_argument("--output", "-o", help="Config file path")
    init_parser.add_argument("--force", "-f", action="store_true", help="Overwrite existing")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "serve": cmd_serve,
        "scan": cmd_scan,
        "stats": cmd_stats,
        "due": cmd_due,
        "reset": cmd_reset,
        "add-ids": cmd_add_ids,
        "export-reviews": cmd_export,
        "init": cmd_init,
    }

    cmd_func = commands.get(args.command)
    if cmd_func:
        cmd_func(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
