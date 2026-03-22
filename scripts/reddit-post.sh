#!/usr/bin/env bash
# reddit-post.sh — Post a text submission to Reddit via direct OAuth2
#
# Usage:
#   SUBREDDIT=freelance TITLE="My title" BODY="Post body" ./scripts/reddit-post.sh
#
# Required env vars (set in .env or export before calling):
#   REDDIT_CLIENT_ID      — from reddit.com/prefs/apps (string under app name)
#   REDDIT_CLIENT_SECRET  — "secret" field from the app
#   REDDIT_USERNAME       — your Reddit account username
#   REDDIT_PASSWORD       — your Reddit account password
#   SUBREDDIT             — subreddit name without r/ (e.g. "freelance")
#   TITLE                 — post title
#   BODY                  — post body text (markdown supported)
#
# Optional:
#   POST_KIND             — "self" (text post, default) or "link"
#   POST_URL              — URL for link posts (required when POST_KIND=link)
#
# Exit codes:
#   0 — success (prints post URL)
#   1 — missing env vars
#   2 — auth failure
#   3 — post failure

set -euo pipefail

# ── Load .env if present ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

# ── Validate required vars ──────────────────────────────────────────────────
MISSING=()
for var in REDDIT_CLIENT_ID REDDIT_CLIENT_SECRET REDDIT_USERNAME REDDIT_PASSWORD SUBREDDIT TITLE BODY; do
  [[ -z "${!var:-}" ]] && MISSING+=("$var")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Missing required env vars: ${MISSING[*]}" >&2
  echo "Set them in .env or export before calling this script." >&2
  exit 1
fi

POST_KIND="${POST_KIND:-self}"
USER_AGENT="AgentBot/1.0 by $REDDIT_USERNAME"

# ── Step 1: Get OAuth token ─────────────────────────────────────────────────
echo "Authenticating as $REDDIT_USERNAME..." >&2

AUTH_RESPONSE=$(curl -s -X POST 'https://www.reddit.com/api/v1/access_token' \
  -u "$REDDIT_CLIENT_ID:$REDDIT_CLIENT_SECRET" \
  -d "grant_type=password&username=$REDDIT_USERNAME&password=$REDDIT_PASSWORD" \
  -A "$USER_AGENT")

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || true)

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "ERROR: Auth failed. Response: $AUTH_RESPONSE" >&2
  exit 2
fi

echo "Auth OK. Token acquired." >&2

# ── Step 2: Submit post ─────────────────────────────────────────────────────
echo "Posting to r/$SUBREDDIT..." >&2

if [[ "$POST_KIND" == "link" ]]; then
  POST_URL_VAR="${POST_URL:-}"
  if [[ -z "$POST_URL_VAR" ]]; then
    echo "ERROR: POST_URL is required when POST_KIND=link" >&2
    exit 1
  fi
  SUBMIT_RESPONSE=$(curl -s -X POST 'https://oauth.reddit.com/api/submit' \
    -H "Authorization: bearer $TOKEN" \
    -A "$USER_AGENT" \
    --data-urlencode "api_type=json" \
    --data-urlencode "kind=link" \
    --data-urlencode "sr=$SUBREDDIT" \
    --data-urlencode "title=$TITLE" \
    --data-urlencode "url=$POST_URL_VAR")
else
  SUBMIT_RESPONSE=$(curl -s -X POST 'https://oauth.reddit.com/api/submit' \
    -H "Authorization: bearer $TOKEN" \
    -A "$USER_AGENT" \
    --data-urlencode "api_type=json" \
    --data-urlencode "kind=self" \
    --data-urlencode "sr=$SUBREDDIT" \
    --data-urlencode "title=$TITLE" \
    --data-urlencode "text=$BODY")
fi

# ── Parse response ──────────────────────────────────────────────────────────
POST_ID=$(echo "$SUBMIT_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
try:
    print(d['json']['data']['id'])
except (KeyError, TypeError):
    print('')
" 2>/dev/null || true)

ERRORS=$(echo "$SUBMIT_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
try:
    errs = d['json']['errors']
    print(errs if errs else '')
except (KeyError, TypeError):
    print('')
" 2>/dev/null || true)

if [[ -n "$ERRORS" && "$ERRORS" != "[]" ]]; then
  echo "ERROR: Reddit returned errors: $ERRORS" >&2
  echo "Full response: $SUBMIT_RESPONSE" >&2
  exit 3
fi

if [[ -z "$POST_ID" || "$POST_ID" == "null" ]]; then
  echo "ERROR: Could not extract post ID. Full response: $SUBMIT_RESPONSE" >&2
  exit 3
fi

POST_LINK="https://www.reddit.com/r/$SUBREDDIT/comments/$POST_ID/"
echo "SUCCESS: https://www.reddit.com/r/$SUBREDDIT/comments/$POST_ID/"
