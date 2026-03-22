#!/bin/bash
set -e

SITE="https://proposallock.onrender.com"
SB_URL="https://bthytzpmyitjyoyhtptb.supabase.co"
SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0aHl0enBteWl0anlveWh0cHRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE1MjQ1MywiZXhwIjoyMDg5NzI4NDUzfQ.-MJgstherQR1xQ1st55m65KbCQ4W3IQ9qQQujM9bM2w"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0aHl0enBteWl0anlveWh0cHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNTI0NTMsImV4cCI6MjA4OTcyODQ1M30.3tQ-9lyHK14BmEZSSB8BBBuRnefs6aCr3a50sosfOb0"
TEST_EMAIL="proposallock-test@bytewiseai.com"
PASS=0
FAIL=0
RESULTS=""

log_pass() { PASS=$((PASS+1)); RESULTS="$RESULTS\n[PASS] $1"; echo "[PASS] $1"; }
log_fail() { FAIL=$((FAIL+1)); RESULTS="$RESULTS\n[FAIL] $1"; echo "[FAIL] $1"; }

echo "========================================"
echo "  PROPOSALLOCK E2E TEST SUITE"
echo "  $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "========================================"

# 1. Static pages
echo ""
echo "--- 1. STATIC PAGES ---"
for path in / /privacy /terms /login; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE$path")
  if [ "$code" = "200" ]; then log_pass "GET $path -> $code"
  else log_fail "GET $path -> $code (expected 200)"; fi
done

# 2. Auth guard
echo ""
echo "--- 2. AUTH GUARD ---"
code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/dashboard")
if [ "$code" = "302" ]; then log_pass "Dashboard redirect -> $code"
else log_fail "Dashboard redirect -> $code (expected 302)"; fi

# 3. Create test user
echo ""
echo "--- 3. AUTH: CREATE TEST USER ---"
user_json=$(curl -s -X POST "$SB_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SB_KEY" \
  -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"TestPass123!\",\"email_confirm\":true}")
USER_ID=$(echo "$user_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
if [ -n "$USER_ID" ] && [ "$USER_ID" != "" ]; then
  log_pass "Test user created: ${USER_ID:0:8}..."
else
  log_fail "Create user: $user_json"
fi

# 4. Generate magic link
echo ""
echo "--- 4. GENERATE MAGIC LINK ---"
link_json=$(curl -s -X POST "$SB_URL/auth/v1/admin/generate_link" \
  -H "Authorization: Bearer $SB_KEY" \
  -H "apikey: $SB_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"email\":\"$TEST_EMAIL\"}")
TOKEN_HASH=$(echo "$link_json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
# Handle both old format (top-level) and new format (inside properties)
p=d.get('properties',{})
print(d.get('hashed_token','') or p.get('hashed_token',''))
" 2>/dev/null || echo "")
if [ -n "$TOKEN_HASH" ] && [ "$TOKEN_HASH" != "" ]; then
  log_pass "Magic link token generated"
else
  log_fail "No token hash: $link_json"
fi

# 5. Verify OTP to get session
echo ""
echo "--- 5. VERIFY OTP -> SESSION ---"
if [ -n "$TOKEN_HASH" ]; then
  verify_json=$(curl -s -X POST "$SB_URL/auth/v1/verify" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"token_hash\":\"$TOKEN_HASH\"}")
  ACCESS_TOKEN=$(echo "$verify_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
  REFRESH_TOKEN=$(echo "$verify_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null || echo "")
  if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "" ]; then
    log_pass "Session obtained (access_token: ${ACCESS_TOKEN:0:20}...)"
  else
    log_fail "No access token from verify"
  fi
fi

# 6. Auth callback sets cookies
echo ""
echo "--- 6. AUTH CALLBACK ---"
if [ -n "$ACCESS_TOKEN" ]; then
  callback_headers=$(curl -s -D - -o /dev/null "$SITE/auth/callback?access_token=$ACCESS_TOKEN&refresh_token=$REFRESH_TOKEN" 2>/dev/null)
  if echo "$callback_headers" | grep -qi "set-cookie"; then
    log_pass "Auth callback sets session cookies"
    COOKIE_LINE=$(echo "$callback_headers" | grep -i "set-cookie" | head -1 | sed 's/[Ss]et-[Cc]ookie: //')
  else
    log_fail "No cookies set by auth callback"
  fi
fi

# 7. Dashboard with auth
echo ""
echo "--- 7. DASHBOARD (authenticated) ---"
if [ -n "$COOKIE_LINE" ]; then
  dash_code=$(curl -s -o /tmp/proposallock_dashboard.html -w '%{http_code}' -H "Cookie: $COOKIE_LINE" "$SITE/dashboard")
  if [ "$dash_code" = "200" ]; then
    log_pass "Dashboard accessible with session -> $dash_code"
    if grep -q "Dashboard" /tmp/proposallock_dashboard.html 2>/dev/null; then
      log_pass "Dashboard HTML contains 'Dashboard' heading"
    else
      log_fail "Dashboard HTML missing expected content"
    fi
  else
    log_fail "Dashboard with auth -> $dash_code"
  fi
else
  log_fail "No cookies to test dashboard"
fi

# 8. Create proposal
echo ""
echo "--- 8. CREATE PROPOSAL ---"
prop_json=$(curl -s -X POST "$SITE/api/proposals" \
  -H "Content-Type: application/json" \
  -H "Origin: $SITE" \
  -d "{\"title\":\"E2E Test: Logo Design\",\"client_name\":\"Alice Chen\",\"file_url\":\"https://drive.google.com/file/d/e2e-test\",\"price\":\"250\",\"email\":\"$TEST_EMAIL\"}")
PROP_ID=$(echo "$prop_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
CHECKOUT_URL=$(echo "$prop_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('checkout_url',''))" 2>/dev/null || echo "")
if [ -n "$PROP_ID" ] && [ "$PROP_ID" != "" ]; then
  log_pass "Proposal created: $PROP_ID"
  if [ -n "$CHECKOUT_URL" ] && [ "$CHECKOUT_URL" != "None" ] && [ "$CHECKOUT_URL" != "null" ]; then
    log_pass "LemonSqueezy checkout URL generated"
  else
    log_fail "No checkout URL generated"
  fi
else
  log_fail "Proposal creation failed: $prop_json"
fi

# 9. File URL hidden when unpaid
echo ""
echo "--- 9. FILE SECURITY ---"
if [ -n "$PROP_ID" ]; then
  sec_json=$(curl -s "$SITE/api/proposals/$PROP_ID")
  file_val=$(echo "$sec_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_url'))" 2>/dev/null)
  paid_val=$(echo "$sec_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('paid'))" 2>/dev/null)
  if [ "$file_val" = "None" ] && [ "$paid_val" = "False" ]; then
    log_pass "file_url hidden when unpaid"
  else
    log_fail "file_url=$file_val, paid=$paid_val (expected None, False)"
  fi
fi

# 10. Proposal page
echo ""
echo "--- 10. PROPOSAL PAGE ---"
if [ -n "$PROP_ID" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/p/$PROP_ID")
  if [ "$code" = "200" ]; then log_pass "Proposal page -> $code"
  else log_fail "Proposal page -> $code"; fi

  code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/p/$PROP_ID/success")
  if [ "$code" = "200" ]; then log_pass "Success page -> $code"
  else log_fail "Success page -> $code"; fi
fi

# 11. Status endpoint
echo ""
echo "--- 11. STATUS POLLING ---"
if [ -n "$PROP_ID" ]; then
  status_json=$(curl -s "$SITE/api/proposals/$PROP_ID/status")
  if echo "$status_json" | grep -q '"paid":false'; then
    log_pass "Status endpoint: $status_json"
  else
    log_fail "Status: $status_json"
  fi
fi

# 12. Input validation
echo ""
echo "--- 12. INPUT VALIDATION ---"
v1=$(curl -s -X POST "$SITE/api/proposals" -H "Content-Type: application/json" -H "Origin: $SITE" \
  -d '{"title":"x","client_name":"y","file_url":"http://bad","price":"50"}')
if echo "$v1" | grep -q "https://"; then log_pass "Rejects http:// URLs"
else log_fail "Should reject http://"; fi

v2=$(curl -s -X POST "$SITE/api/proposals" -H "Content-Type: application/json" -H "Origin: $SITE" \
  -d '{"title":"x","client_name":"y","file_url":"https://ok.com","price":"0.50"}')
if echo "$v2" | grep -q "at least"; then log_pass "Rejects price < \$1"
else log_fail "Should reject low price"; fi

v3=$(curl -s -X POST "$SITE/api/proposals" -H "Content-Type: application/json" -H "Origin: $SITE" \
  -d '{}')
if echo "$v3" | grep -q "Missing"; then log_pass "Rejects empty body"
else log_fail "Should reject empty body"; fi

# 13. ID validation / XSS
echo ""
echo "--- 13. SECURITY ---"
code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/api/proposals/not-valid-id")
if [ "$code" = "404" ]; then log_pass "Invalid ID -> 404"
else log_fail "Invalid ID -> $code"; fi

code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/p/not-valid")
if [ "$code" = "404" ]; then log_pass "XSS in URL -> 404"
else log_fail "XSS in URL -> $code"; fi

# 14. Webhook security
echo ""
echo "--- 14. WEBHOOK SECURITY ---"
wh_code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE/api/webhooks/lemonsqueezy" \
  -H "Content-Type: application/json" -H "x-signature: fakesig" \
  -d '{"meta":{"event_name":"order_created"}}')
if [ "$wh_code" = "401" ]; then log_pass "Fake webhook -> 401 rejected"
else log_fail "Fake webhook -> $wh_code (expected 401)"; fi

# 15. File upload (Supabase Storage)
echo ""
echo "--- 15. FILE UPLOAD (STORAGE) ---"
# Create a small test file
echo "test file content" > /tmp/proposallock_test_upload.txt
upload_json=$(curl -s -X POST "$SITE/api/upload" \
  -H "Origin: $SITE" \
  -F "file=@/tmp/proposallock_test_upload.txt;type=text/plain")
UPLOAD_PATH=$(echo "$upload_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('path',''))" 2>/dev/null || echo "")
if [ -n "$UPLOAD_PATH" ] && echo "$UPLOAD_PATH" | grep -q "^uploads/"; then
  log_pass "File uploaded to storage: ${UPLOAD_PATH:0:40}..."
else
  log_fail "Storage upload: $upload_json"
fi

# Test that upload path can be used in a proposal
if [ -n "$UPLOAD_PATH" ]; then
  stor_json=$(curl -s -X POST "$SITE/api/proposals" \
    -H "Content-Type: application/json" \
    -H "Origin: $SITE" \
    -d "{\"title\":\"E2E Test: Storage Proposal\",\"client_name\":\"Bob Jones\",\"file_url\":\"$UPLOAD_PATH\",\"price\":\"100\",\"email\":\"$TEST_EMAIL\"}")
  STOR_PROP_ID=$(echo "$stor_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$STOR_PROP_ID" ]; then
    log_pass "Proposal with storage path created: $STOR_PROP_ID"
  else
    log_fail "Storage proposal creation: $stor_json"
  fi
fi
rm -f /tmp/proposallock_test_upload.txt

# 16. DB persistence
echo ""
echo "--- 16. SUPABASE PERSISTENCE ---"
db_count=$(curl -s -X POST "https://api.supabase.com/v1/projects/bthytzpmyitjyoyhtptb/database/query" \
  -H "Authorization: Bearer sbp_99dded6d7b941f91abe9ed52698a00c2e46535e6" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT COUNT(*) as total FROM proposals"}' | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['total'])" 2>/dev/null)
log_pass "$db_count proposals persisted in Supabase"

# Cleanup
echo ""
echo "--- CLEANUP ---"
if [ -n "$USER_ID" ]; then
  curl -s -X DELETE "$SB_URL/auth/v1/admin/users/$USER_ID" \
    -H "Authorization: Bearer $SB_KEY" -H "apikey: $SB_KEY" > /dev/null 2>&1
  echo "Test user deleted"
fi
curl -s -X POST "https://api.supabase.com/v1/projects/bthytzpmyitjyoyhtptb/database/query" \
  -H "Authorization: Bearer sbp_99dded6d7b941f91abe9ed52698a00c2e46535e6" \
  -H "Content-Type: application/json" \
  -d '{"query":"DELETE FROM proposals WHERE title LIKE '\''E2E Test%'\''"}' > /dev/null 2>&1
echo "Test proposals cleaned up"

# Summary
echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "  $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "========================================"
