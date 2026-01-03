#!/bin/bash
# Phase 1 API Tests
# Run with: ./test_phase1.sh

BASE_URL="${BASE_URL:-http://localhost:8000}"
PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Helper function
test_endpoint() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  if echo "$actual" | grep -q "$expected"; then
    echo -e "${GREEN}✓${NC} $name"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $name"
    echo "  Expected to contain: $expected"
    echo "  Got: $actual"
    ((FAILED++))
  fi
}

echo "=== Phase 1 API Tests ==="
echo "Base URL: $BASE_URL"
echo ""

# Test 0: Health check
RESP=$(curl -s "$BASE_URL/health" 2>/dev/null)
if [ -z "$RESP" ]; then
  echo -e "${RED}✗${NC} Server not running at $BASE_URL"
  echo "  Start with: uvicorn src.main:app --port 8000"
  exit 1
fi
test_endpoint "Health check" '"status":"healthy"' "$RESP"

# Test 1: Empty list
RESP=$(curl -s "$BASE_URL/api/documents")
test_endpoint "Empty document list" '"count":0' "$RESP"

# Test 2: Create document
RESP=$(curl -s -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Doc", "content": "# Test\n\nHello world.", "metadata": {"source": "test", "tags": ["automated"]}}')
test_endpoint "Create document" '"status":"active"' "$RESP"

# Extract ID
DOC_ID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$DOC_ID" ]; then
  echo -e "${RED}✗${NC} Failed to extract document ID"
  exit 1
fi
echo "  Document ID: $DOC_ID"

# Test 3: List shows document
RESP=$(curl -s "$BASE_URL/api/documents")
test_endpoint "List shows document" '"count":1' "$RESP"

# Test 4: Get document
RESP=$(curl -s "$BASE_URL/api/documents/$DOC_ID")
test_endpoint "Get document content" '"content":"# Test' "$RESP"

# Test 5: Get document metadata
test_endpoint "Get document metadata" '"source":"test"' "$RESP"

# Test 6: 404 for missing
RESP=$(curl -s -w "%{http_code}" "$BASE_URL/api/documents/nonexistent")
test_endpoint "404 for missing document" "404" "$RESP"

# Test 7: Complete document
RESP=$(curl -s -X POST "$BASE_URL/api/documents/$DOC_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{"commit_message": "test"}')
test_endpoint "Complete document" '"status":"complete"' "$RESP"

# Test 8: Filter by status (complete)
RESP=$(curl -s "$BASE_URL/api/documents?status=complete")
test_endpoint "Filter by status=complete" '"count":1' "$RESP"

# Test 9: Filter by status (active - should be empty now)
RESP=$(curl -s "$BASE_URL/api/documents?status=active")
test_endpoint "Filter by status=active" '"count":0' "$RESP"

# Test 10: Delete document
RESP=$(curl -s -w "%{http_code}" -X DELETE "$BASE_URL/api/documents/$DOC_ID" -o /dev/null)
test_endpoint "Delete document (204)" "204" "$RESP"

# Test 11: Verify deleted
RESP=$(curl -s "$BASE_URL/api/documents")
test_endpoint "Document deleted" '"count":0' "$RESP"

# Test 12: Delete non-existent (404)
RESP=$(curl -s -w "%{http_code}" -X DELETE "$BASE_URL/api/documents/nonexistent" -o /dev/null)
test_endpoint "Delete non-existent (404)" "404" "$RESP"

echo ""
echo "=== Results ==="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
