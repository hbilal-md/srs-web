"""Set up Supabase database schema for SRS Tool.

Run this script to create all required tables in your Supabase project.
"""

import os
from pathlib import Path

# Try to use supabase-py if available, otherwise use REST API
try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    import urllib.request
    import json

# Supabase credentials
SUPABASE_URL = "https://utmowoesnbbkqgdggvjb.supabase.co"
SUPABASE_KEY = "sb_secret_JlAjuep3Mk2CRJCY2X9SYg_cHBOmx0f"  # Service role key for admin operations

def run_sql_via_rest(sql: str) -> dict:
    """Execute SQL via Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"

    # For raw SQL, we need to use the SQL editor endpoint
    # Actually, Supabase doesn't expose raw SQL via REST
    # We need to use the Management API or run manually

    print("⚠️  Supabase REST API doesn't support raw SQL execution.")
    print("   Please run the SQL manually in the Supabase Dashboard:")
    print(f"   1. Go to {SUPABASE_URL.replace('.supabase.co', '')}")
    print("   2. Navigate to SQL Editor")
    print("   3. Paste and run the contents of supabase-schema.sql")
    return {"error": "Manual execution required"}


def main():
    schema_file = Path(__file__).parent / "supabase-schema.sql"

    if not schema_file.exists():
        print("❌ supabase-schema.sql not found!")
        return

    sql = schema_file.read_text()

    print("=" * 60)
    print("SRS Tool - Supabase Schema Setup")
    print("=" * 60)
    print(f"\nProject URL: {SUPABASE_URL}")
    print(f"Schema file: {schema_file}")
    print()

    # The best way to run this is through Supabase Dashboard SQL Editor
    # or using the Supabase CLI

    print("📋 To set up the database schema:")
    print()
    print("Option 1: Supabase Dashboard (Recommended)")
    print("-" * 40)
    print("1. Open: https://supabase.com/dashboard")
    print("2. Select your project")
    print("3. Go to 'SQL Editor' in the left sidebar")
    print("4. Click 'New query'")
    print("5. Paste the contents of supabase-schema.sql")
    print("6. Click 'Run' (or Cmd+Enter)")
    print()
    print("Option 2: Supabase CLI")
    print("-" * 40)
    print("1. Install: npm install -g supabase")
    print("2. Login: supabase login")
    print("3. Link: supabase link --project-ref utmowoesnbbkqgdggvjb")
    print("4. Run: supabase db push")
    print()

    # Copy SQL to clipboard if possible
    try:
        import subprocess
        process = subprocess.Popen(['pbcopy'], stdin=subprocess.PIPE)
        process.communicate(sql.encode('utf-8'))
        print("✅ SQL schema copied to clipboard!")
        print("   Just paste it in the Supabase SQL Editor.")
    except Exception:
        print("💡 SQL schema is in: supabase-schema.sql")

    print()
    print("=" * 60)


if __name__ == "__main__":
    main()
