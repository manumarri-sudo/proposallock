#!/usr/bin/env bash
# reddit-comment.sh — Post a comment reply to an existing Reddit post
#
# Usage:
#   POST_ID=1rirozj COMMENT="Your comment text here" ./scripts/reddit-comment.sh
#
# Required env vars:
#   REDDIT_CLIENT_ID      — from reddit.com/prefs/apps
#   REDDIT_CLIENT_SECRET  — "secret" field from the app
#   REDDIT_USERNAME       — your Reddit account username
#   REDDIT_PASSWORD       — your Reddit account password
#   POST_ID               — Reddit post ID (e.g. "1rirozj")
#   COMMENT               — Comment text (markdown supported)
#
# Exit codes:
#   0 — success (prints comment URL)
#   1 — missing env vars
#   2 — auth failure
#   3 — comment failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../../agentOS-sim/lattice/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

MISSING=()
for var in REDDIT_CLIENT_ID REDDIT_CLIENT_SECRET REDDIT_USERNAME REDDIT_PASSWORD POST_ID COMMENT; do
  [[ -z "${!var:-}" ]] && MISSING+=("$var")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Missing required env vars: ${MISSING[*]}" >&2
  echo "To fix: go to https://www.reddit.com/prefs/apps and create a 'script' app" >&2
  exit 1
fi

USER_AGENT="LaunchBot/1.0 by $REDDIT_USERNAME"

# Step 1: Get OAuth token
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
echo "Auth OK. Posting comment..." >&2

# Step 2: Post comment (thing_id = t3_<post_id> for top-level comment)
THING_ID="t3_${POST_ID}"
COMMENT_RESPONSE=$(curl -s -X POST 'https://oauth.reddit.com/api/comment' \
  -H "Authorization: bearer $TOKEN" \
  -A "$USER_AGENT" \
  --data-urlencode "api_type=json" \
  --data-urlencode "thing_id=$THING_ID" \
  --data-urlencode "text=$COMMENT")

# Parse response
COMMENT_ID=$(echo "$COMMENT_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
try:
    print(d['json']['data']['things'][0]['data']['id'])
except (KeyError, TypeError, IndexError):
    print('')
" 2>/dev/null || true)

ERRORS=$(echo "$COMMENT_RESPONSE" | python3 -c "
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
  echo "Full response: $COMMENT_RESPONSE" >&2
  exit 3
fi

if [[ -z "$COMMENT_ID" || "$COMMENT_ID" == "null" ]]; then
  echo "ERROR: Could not extract comment ID. Full response: $COMMENT_RESPONSE" >&2
  exit 3
fi

SUBREDDIT="freelance"
echo "SUCCESS: https://www.reddit.com/r/$SUBREDDIT/comments/$POST_ID/_/$COMMENT_ID/"
