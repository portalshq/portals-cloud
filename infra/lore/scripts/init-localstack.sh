#!/bin/bash
# =============================================================================
# LocalStack Init Script — creates DynamoDB tables for Lore fragment metadata
# =============================================================================
#
# This script runs when LocalStack starts (via /etc/localstack/init/ready.d/)
# and creates the infrastructure needed by the Lore AWS immutable store.
#
# Uses LocalStack HTTP API instead of AWS CLI (not available in container).
#
# It is idempotent — safe to re-run.
#
# =============================================================================

set -euo pipefail

AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
export AWS_DEFAULT_REGION

echo "=== LocalStack init: Creating Lore infrastructure (region: ${AWS_DEFAULT_REGION}) ==="

LOCALSTACK_URL="http://localhost:4566"

# ---------------------------------------------------------------------------
# Helper function to create DynamoDB table via LocalStack HTTP API
# ---------------------------------------------------------------------------
create_table() {
    local table_name="$1"
    local key_schema="$2"
    local attribute_definitions="$3"

    # Check if table exists via ListTables
    if curl -sf "${LOCALSTACK_URL}/" \
        -H "Content-Type: application/x-amz-json-1.1" \
        -H "X-Amz-Target: DynamoDB_20120810.ListTables" \
        -d '{}' 2>/dev/null | grep -q "\"${table_name}\""; then
        echo "DynamoDB table already exists: ${table_name}"
        return 0
    fi

    echo "Creating DynamoDB table: ${table_name}"
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "${LOCALSTACK_URL}/" \
        -H "Content-Type: application/x-amz-json-1.1" \
        -H "X-Amz-Target: DynamoDB_20120810.CreateTable" \
        -d "{
            \"TableName\": \"${table_name}\",
            \"KeySchema\": ${key_schema},
            \"AttributeDefinitions\": ${attribute_definitions},
            \"BillingMode\": \"PAY_PER_REQUEST\"
        }")
    local http_code
    http_code=$(echo "$response" | tail -1)
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo "Created table: ${table_name}"
    else
        echo "ERROR: Failed to create table ${table_name} (HTTP ${http_code})"
        echo "$response" | head -n -1
        return 1
    fi
}

# ---------------------------------------------------------------------------
# DynamoDB Table 1: Fragment Index
#   Partition key:  hash (Binary)  — fragment content hash (SHA-256)
#   Sort key:       repository_context (Binary) — repository + address context
#
# This table maps fragment hashes to their repository context. It enables
# querying all fragments belonging to a repository, or by hash alone.
# See: lore-aws/src/store/immutable_store.rs, struct FragmentsEntry
# ---------------------------------------------------------------------------
FRAGMENTS_TABLE="lore-fragments-dev"
create_table "${FRAGMENTS_TABLE}" \
    '[{"AttributeName":"hash","KeyType":"HASH"},{"AttributeName":"repository_context","KeyType":"RANGE"}]' \
    '[{"AttributeName":"hash","AttributeType":"B"},{"AttributeName":"repository_context","AttributeType":"B"}]'

# ---------------------------------------------------------------------------
# DynamoDB Table 2: Fragment Metadata
#   Partition key:  hash (Binary)  — fragment content hash (SHA-256)
#   No sort key  (each hash has at most one metadata entry)
#
# This table stores fragment metadata (size, flags, compression, etc.).
# See: lore-aws/src/store/immutable_store.rs, struct FragmentMetadataEntry
# ---------------------------------------------------------------------------
METADATA_TABLE="lore-fragment-metadata-dev"
create_table "${METADATA_TABLE}" \
    '[{"AttributeName":"hash","KeyType":"HASH"}]' \
    '[{"AttributeName":"hash","AttributeType":"B"}]'

echo "=== LocalStack init complete ==="
