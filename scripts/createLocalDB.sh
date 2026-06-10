#!/bin/bash
#
# Creates the local SQLite database (./database/local.db) and applies all
# pending migrations. Use --reset to delete the existing database first.
#
# Usage:
#   ./scripts/createLocalDB.sh
#   ./scripts/createLocalDB.sh --reset
#
set -e

cd "$(dirname "$0")/.."

DB_FILE="./database/local.db"

if [ "$1" == "--reset" ] && [ -f "$DB_FILE" ]; then
  echo "Removing existing database at $DB_FILE"
  rm "$DB_FILE"
fi

export DB_DRIVER=sqlite
export DB_FILE

npx tsx scripts/migrate.ts

echo "Local SQLite database ready at $DB_FILE"
