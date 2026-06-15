#!/bin/bash
#
# Creates the local SQLite database (./database/local.db) and applies all
# pending migrations. Use --reset to truncate all user tables (preserving the
# file and schema) instead of deleting the database.
#
# Usage:
#   ./scripts/createLocalDB.sh
#   ./scripts/createLocalDB.sh --reset
#
set -e

cd "$(dirname "$0")/.."

DB_FILE="./database/local.db"

if [ "$1" == "--reset" ] && [ -f "$DB_FILE" ]; then
  echo "Cleaning all tables in $DB_FILE ..."

  # Query all user-defined tables (excluding SQLite internals and the migrations
  # tracker), then DELETE every row — with FK checks off so order doesn't matter.
  TABLES_SQL=$(sqlite3 "$DB_FILE" \
    "SELECT 'DELETE FROM \"' || name || '\";' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations' ORDER BY name;")

  sqlite3 "$DB_FILE" <<SQL
PRAGMA foreign_keys = OFF;
${TABLES_SQL}
PRAGMA foreign_keys = ON;
SQL

  echo "All tables cleared."
fi

export DB_DRIVER=sqlite
export DB_FILE

npx tsx scripts/migrate.ts

echo "Local SQLite database ready at $DB_FILE"
