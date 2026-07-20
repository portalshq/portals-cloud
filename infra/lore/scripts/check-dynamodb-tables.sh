#!/bin/sh
# =============================================================================
# DynamoDB Table Health Check Script
# =============================================================================
#
# This script checks if the required DynamoDB tables exist in LocalStack.
# Used as a healthcheck for lore-server to ensure tables are ready before startup.
#
# Exit codes:
#   0 - All tables exist and are ready
#   1 - One or more tables missing
#   2 - LocalStack not accessible
#
# =============================================================================

set -euo pipefail

LOCALSTACK_URL="${LOCALSTACK_URL:-http://localhost:4566}"
FRAGMENTS_TABLE="${FRAGMENTS_TABLE:-lore-fragments-dev}"
METADATA_TABLE="${METADATA_TABLE:-lore-fragment-metadata-dev}"
MAX_RETRIES="${MAX_RETRIES:-60}"
RETRY_DELAY="${RETRY_DELAY:-5}"

echo "=== Checking DynamoDB tables ==="
echo "LocalStack URL: ${LOCALSTACK_URL}"
echo "Fragments table: ${FRAGMENTS_TABLE}"
echo "Metadata table: ${METADATA_TABLE}"

# Wait for LocalStack to be accessible with retries
retry_count=0
while [ $retry_count -lt $MAX_RETRIES ]; do
    if curl -sf "${LOCALSTACK_URL}/_localstack/health" > /dev/null 2>&1; then
        echo "LocalStack is accessible"
        break
    fi
    retry_count=$((retry_count + 1))
    echo "Waiting for LocalStack to be ready... (${retry_count}/${MAX_RETRIES})"
    sleep $RETRY_DELAY
done

if [ $retry_count -eq $MAX_RETRIES ]; then
    echo "ERROR: LocalStack not accessible at ${LOCALSTACK_URL} after ${MAX_RETRIES} retries"
    exit 2
fi

# Function to check if table exists
table_exists() {
    local table_name="$1"
    local response
    response=$(curl -s -X POST "${LOCALSTACK_URL}/" \
        -H "Content-Type: application/x-amz-json-1.1" \
        -H "X-Amz-Target: DynamoDB_20120810.DescribeTable" \
        -d "{\"TableName\":\"${table_name}\"}" 2>/dev/null)
    
    if echo "$response" | grep -q "\"Table\""; then
        echo "✓ Table exists: ${table_name}"
        return 0
    else
        echo "✗ Table missing: ${table_name}"
        return 1
    fi
}

# Wait for tables to be created with retries
table_retry_count=0
while [ $table_retry_count -lt $MAX_RETRIES ]; do
    missing_tables=0
    
    if ! table_exists "${FRAGMENTS_TABLE}"; then
        missing_tables=$((missing_tables + 1))
    fi
    
    if ! table_exists "${METADATA_TABLE}"; then
        missing_tables=$((missing_tables + 1))
    fi
    
    if [ "$missing_tables" -eq 0 ]; then
        echo "=== All DynamoDB tables ready ==="
        exit 0
    fi
    
    table_retry_count=$((table_retry_count + 1))
    echo "Waiting for tables to be created... (${table_retry_count}/${MAX_RETRIES})"
    sleep $RETRY_DELAY
done

echo "=== ${missing_tables} table(s) missing after ${MAX_RETRIES} retries ==="
exit 1
