#!/bin/bash
# ph-monitor-wrapper.sh
# Persistent cron-safe wrapper for ph-monitor-launch.sh
# Sources .env, validates required vars, then runs the monitor
# Crontab: */30 * 7 4 * /bin/bash /Users/manaswimarri/lattice-workspace/proposallock/scripts/ph-monitor-wrapper.sh

set -euo pipefail

SCRIPT_DIR="/Users/manaswimarri/lattice-workspace/proposallock/scripts"
ENV_FILE="/Users/manaswimarri/lattice-workspace/proposallock/.env"
LOG_FILE="/tmp/ph-launch-$(date +%Y%m%d).log"

# Load .env (skip comments and multi-line blocks)
while IFS='=' read -r key val; do
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  key="${key// /}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  export "$key=$val" 2>/dev/null || true
done < <(grep -E '^[A-Z_]+=.+' "$ENV_FILE" 2>/dev/null || true)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Validate required vars
MISSING=()
for var in PH_CLIENT_ID PH_CLIENT_SECRET RESEND_API_KEY LEMONSQUEEZY_API_KEY; do
  if [ -z "${!var:-}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "[$TIMESTAMP] ERROR: Missing env vars: ${MISSING[*]}" >> "$LOG_FILE"
  echo "[$TIMESTAMP] Add them to $ENV_FILE and retry." >> "$LOG_FILE"
  exit 1
fi

echo "[$TIMESTAMP] All env vars present. Running monitor..." >> "$LOG_FILE"
bash "$SCRIPT_DIR/ph-monitor-launch.sh"
