#!/bin/bash
# PH Launch Day Monitoring + LemonSqueezy Order Tracking
# Runs every 30 minutes on April 7, 2026 starting at 12:01 AM PST
# Alerts Manu when votes cross 50, 100, 200 thresholds

set -euo pipefail

# ============================================================================
# CONFIG
# ============================================================================

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE_FILE="/tmp/ph-launch-state.json"
LOG_FILE="/tmp/ph-launch-$(date +%Y%m%d).log"

# Thresholds to alert on
VOTE_MILESTONES=(50 100 200)

# ============================================================================
# INITIALIZE STATE
# ============================================================================

initialize_state() {
  if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" << 'EOF'
{
  "alerted_milestones": [],
  "last_check": null,
  "total_votes": 0,
  "total_comments": 0,
  "total_orders": 0
}
EOF
  fi
}

# ============================================================================
# FETCH PH DATA
# ============================================================================

fetch_ph_data() {
  # Get fresh token
  local token_response=$(curl -s -X POST https://api.producthunt.com/v2/oauth/token \
    -H "Content-Type: application/json" \
    -d "{
      \"client_id\": \"$PH_CLIENT_ID\",
      \"client_secret\": \"$PH_CLIENT_SECRET\",
      \"grant_type\": \"client_credentials\"
    }")

  local ph_token=$(echo "$token_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null || echo "")

  if [ -z "$ph_token" ]; then
    echo "[$TIMESTAMP] ERROR: Failed to get PH token" >> "$LOG_FILE"
    return 1
  fi

  # Query post by slug (handles case where post ID changes or is unknown)
  local ph_response=$(curl -s -X POST https://api.producthunt.com/v2/api/graphql \
    -H "Authorization: Bearer $ph_token" \
    -H "Content-Type: application/json" \
    -d '{"query":"{post(slug:\"proposallock\"){id name votesCount commentsCount}}"}')

  # Parse votes and comments
  local votes=$(echo "$ph_response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data', {}).get('post', {}).get('votesCount', 0))" 2>/dev/null || echo "0")
  local comments=$(echo "$ph_response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data', {}).get('post', {}).get('commentsCount', 0))" 2>/dev/null || echo "0")

  echo "$votes|$comments"
}

# ============================================================================
# FETCH LEMONSQUEEZY DATA
# ============================================================================

fetch_lemonsqueezy_data() {
  local orders=$(curl -s "https://api.lemonsqueezy.com/v1/orders?filter[status]=paid" \
    -H "Accept: application/vnd.api+json" \
    -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data', [])))" 2>/dev/null || echo "0")

  echo "$orders"
}

# ============================================================================
# CHECK VOTE MILESTONES
# ============================================================================

check_milestones() {
  local votes=$1
  local comments=$2

  # Read current state
  local alerted=$(python3 -c "import sys,json; d=json.load(open('$STATE_FILE')); print(','.join(map(str, d.get('alerted_milestones', []))))" 2>/dev/null || echo "")

  # Check each milestone
  for milestone in "${VOTE_MILESTONES[@]}"; do
    if [ "$votes" -ge "$milestone" ] && [[ ! " $alerted " =~ " $milestone " ]]; then
      # Alert!
      send_alert "$milestone" "$votes" "$comments"

      # Update state to mark this milestone as alerted
      python3 << PYTHON
import json
with open('$STATE_FILE', 'r') as f:
  state = json.load(f)
state['alerted_milestones'].append($milestone)
state['alerted_milestones'] = sorted(list(set(state['alerted_milestones'])))
with open('$STATE_FILE', 'w') as f:
  json.dump(state, f, indent=2)
PYTHON
    fi
  done
}

# ============================================================================
# SEND ALERT EMAIL
# ============================================================================

send_alert() {
  local milestone=$1
  local votes=$2
  local comments=$3

  curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"ProposalLock <bytewiseai.info@gmail.com>\",
      \"to\": [\"manu.marri@gmail.com\"],
      \"subject\": \"🎉 ProposalLock hit $milestone votes on Product Hunt!\",
      \"html\": \"<p><strong>Milestone reached: $votes votes!</strong></p><p>Comments: $comments</p><p>Post: <a href='https://www.producthunt.com/posts/proposallock'>View on Product Hunt</a></p>\"
    }" > /dev/null

  echo "[$TIMESTAMP] ALERT: Sent milestone alert for $milestone votes" >> "$LOG_FILE"
}

# ============================================================================
# MAIN
# ============================================================================

main() {
  initialize_state

  echo "[$TIMESTAMP] Starting PH + LS monitoring check..." >> "$LOG_FILE"

  # Fetch data
  local ph_data=$(fetch_ph_data)
  IFS='|' read -r votes comments <<< "$ph_data"

  local orders=$(fetch_lemonsqueezy_data)

  echo "[$TIMESTAMP] PH Votes: $votes | Comments: $comments | LS Orders: $orders" >> "$LOG_FILE"

  # Check milestones and alert
  check_milestones "$votes" "$comments"

  # Update state
  python3 << PYTHON
import json
with open('$STATE_FILE', 'r') as f:
  state = json.load(f)
state['last_check'] = '$TIMESTAMP'
state['total_votes'] = $votes
state['total_comments'] = $comments
state['total_orders'] = $orders
with open('$STATE_FILE', 'w') as f:
  json.dump(state, f, indent=2)
PYTHON

  echo "[$TIMESTAMP] Check complete." >> "$LOG_FILE"
}

main
