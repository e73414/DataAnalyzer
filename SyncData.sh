#!/usr/bin/env bash
# SyncData.sh
# Copies production postgres table data into local Docker postgres.
# Deletes local data first, then loads from server.
#
# Tables synced:
#   dataset_record_manager, profile_business_units, profile_companies,
#   profile_teams, template_profiles, users
#
# Usage: bash SyncData.sh

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
SSH_HOST="elee@elee-AG2"
SERVER_PG_CONTAINER="mcp-n8n-postgres-1"
LOCAL_PG_CONTAINER="mcp-n8n-postgres-1"
PG_USER="n8n"
PG_DB="n8n"
DUMP_FILE="/tmp/n8n_sync_$$.sql"
# ─────────────────────────────────────────────────────────────────────────────

echo "→ Dumping data from server..."
ssh "$SSH_HOST" \
  "docker exec $SERVER_PG_CONTAINER pg_dump \
    -U $PG_USER -d $PG_DB \
    --data-only --no-privileges \
    -t n8n_data.dataset_record_manager \
    -t n8n_data.profile_business_units \
    -t n8n_data.profile_companies \
    -t n8n_data.profile_teams \
    -t n8n_data.template_profiles \
    -t n8n_data.users" \
  > "$DUMP_FILE"

echo "→ Deleting local table data..."
docker exec -i "$LOCAL_PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 << 'SQL'
-- Disable FK checks so we can delete in any order
SET session_replication_role = replica;
DELETE FROM n8n_data.template_profiles;
DELETE FROM n8n_data.profile_teams;
DELETE FROM n8n_data.profile_business_units;
DELETE FROM n8n_data.profile_companies;
DELETE FROM n8n_data.dataset_record_manager;
DELETE FROM n8n_data.users;
SET session_replication_role = DEFAULT;
SQL

echo "→ Loading into local postgres..."
docker exec -i "$LOCAL_PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
  -v ON_ERROR_STOP=1 -q < "$DUMP_FILE"

rm -f "$DUMP_FILE"

echo "✓ Done. Local postgres tables synced from production."
