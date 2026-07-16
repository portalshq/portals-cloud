#!/bin/bash
set -e

# Migration script for control-plane database
# Usage: ./scripts/migrate.sh [DATABASE_URL]

DATABASE_URL="${1:-${DATABASE_URL:-postgresql://portals_admin:portals_password@localhost:5432/portals}}"

echo "Running migrations for control-plane..."
echo "DATABASE_URL: $DATABASE_URL"

# Run sqlx migrations
cd "$(dirname "$0")/.."
sqlx migrate run --database-url "$DATABASE_URL" --source persistence/migrations

echo "Migrations completed successfully!"
