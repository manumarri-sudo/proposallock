#!/usr/bin/env bash
# test-testimonials.sh
# Run AFTER migration 001_testimonials.sql has been applied to Supabase.
# Usage: bash scripts/test-testimonials.sh
set -e

BASE="https://proposallock.vercel.app"
TEST_PROPOSAL_ID="ndbr3ll9mf6hofesq6wcp2zr5ey0z1s2"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS -- $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL -- $desc"
    echo "    got: $result"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "=== ProposalLock Testimonial Flow Tests ==="
echo ""

# 1. GET /testimonial?pid=... page loads
echo "[1] Testimonial form page loads"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/testimonial?pid=$TEST_PROPOSAL_ID")
check "GET /testimonial?pid=$TEST_PROPOSAL_ID returns 200" "$STATUS" "200"

# 2. POST /api/testimonials -- valid submission
echo ""
echo "[2] POST /api/testimonials -- valid submission"
RESULT=$(curl -s -X POST "$BASE/api/testimonials" \
  -H "Content-Type: application/json" \
  -d "{\"proposal_id\":\"$TEST_PROPOSAL_ID\",\"body\":\"ProposalLock saved me from chasing invoices. My client paid instantly and got their files. Worth every penny.\",\"rating\":5,\"display_name\":\"Freelance Designer\"}")
check "Returns {success:true}" "$RESULT" "success"

# 3. POST /api/testimonials -- invalid (body too short)
echo ""
echo "[3] POST /api/testimonials -- validation rejects short body"
RESULT=$(curl -s -X POST "$BASE/api/testimonials" \
  -H "Content-Type: application/json" \
  -d "{\"proposal_id\":\"$TEST_PROPOSAL_ID\",\"body\":\"Too short\",\"rating\":5}")
check "Returns error for short body" "$RESULT" "error"

# 4. POST /api/testimonials -- invalid proposal_id
echo ""
echo "[4] POST /api/testimonials -- rejects unknown proposal"
RESULT=$(curl -s -X POST "$BASE/api/testimonials" \
  -H "Content-Type: application/json" \
  -d "{\"proposal_id\":\"doesnotexist\",\"body\":\"This testimonial is long enough to pass validation rules.\",\"rating\":5}")
check "Returns 404 for unknown proposal" "$RESULT" "not found"

# 5. GET /api/testimonials/public -- returns the submitted testimonial
echo ""
echo "[5] GET /api/testimonials/public -- returns at least 1 testimonial"
RESULT=$(curl -s "$BASE/api/testimonials/public")
check "Returns non-empty array" "$RESULT" "Freelance Designer"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [ $FAIL -gt 0 ]; then
  echo "MIGRATION MAY NOT BE APPLIED -- run migrations/001_testimonials.sql in Supabase SQL editor first"
  echo "URL: https://supabase.com/dashboard/project/bthytzpmyitjyoyhtptb/sql/new"
  exit 1
else
  echo "All tests passed. Testimonial collection is live."
fi
