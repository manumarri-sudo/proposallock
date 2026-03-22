#!/bin/bash

# ProposalLock Launch Monitoring Script
# Purpose: Track Reddit engagement + LemonSqueezy conversions every 15-30 minutes
# Usage: bash monitor-launch.sh [reddit-post-url]

set -e

REDDIT_POST_URL="${1:-}"
MONITOR_INTERVAL=30  # minutes
ALERT_THRESHOLD_UPVOTES=5
ALERT_THRESHOLD_ORDERS=1

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log file
LOG_FILE="/Users/manaswimarri/lattice-workspace/proposallock/monitoring-log-$(date +%Y%m%d).txt"

function log() {
    local msg="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $msg" | tee -a "$LOG_FILE"
}

function check_reddit_engagement() {
    if [ -z "$REDDIT_POST_URL" ]; then
        log "⏳ Reddit post URL not provided. Waiting for post..."
        return
    fi

    log "📊 Checking Reddit engagement..."

    # Extract post ID from URL
    POST_ID=$(echo "$REDDIT_POST_URL" | grep -oP 'comments/\K[^/]+' || echo "")

    if [ -z "$POST_ID" ]; then
        log "❌ Could not extract post ID from URL: $REDDIT_POST_URL"
        return
    fi

    # Fetch Reddit API data
    local api_url="https://www.reddit.com/r/freelance/comments/${POST_ID}/.json"
    local response=$(curl -s -H "User-Agent: ProposalLock-Monitor" "$api_url" 2>/dev/null || echo "{}")

    # Extract engagement metrics
    local upvotes=$(echo "$response" | grep -o '"score":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "0")
    local comments=$(echo "$response" | grep -o '"num_comments":[0-9]*' | grep -o '[0-9]*' || echo "0")

    log "   Upvotes: $upvotes (target: $ALERT_THRESHOLD_UPVOTES+)"
    log "   Comments: $comments"

    if [ "$upvotes" -lt "$ALERT_THRESHOLD_UPVOTES" ] && [ "$comments" -eq "0" ]; then
        log "   ⚠️  Post not gaining traction yet. Check visibility."
    fi
}

function check_lemonsqueezy_orders() {
    log "💰 Checking LemonSqueezy orders..."

    # Get order count
    local order_count=$(lmsq orders list --store-id 312605 --count 2>/dev/null || echo "0")

    log "   Total orders: $order_count"

    # Get detailed order info if any orders exist
    if [ "$order_count" -gt "0" ]; then
        log "   ✅ FIRST DOLLAR ACHIEVED! Orders detected:"
        lmsq orders list --store-id 312605 --fields status,total,user_email,created_at --page-size "$order_count" 2>/dev/null | while read line; do
            log "      $line"
        done
    fi

    # Check for orders with reddit UTM source (requires checking all order data)
    # Note: This would require parsing LemonSqueezy metadata which may not have UTM data
    # Alternative: Check for pattern in customer emails or creation timestamps matching Reddit post
}

function check_product_health() {
    log "🏥 Checking product health..."

    # Check main site
    local site_status=$(curl -s -o /dev/null -w "%{http_code}" https://proposallock.onrender.com 2>/dev/null || echo "000")

    if [ "$site_status" = "200" ]; then
        log "   ✅ Site live (HTTP $site_status)"
    else
        log "   ⚠️  Site status: HTTP $site_status (expected 200)"
    fi

    # Check API endpoint
    local api_status=$(curl -s -X POST -o /dev/null -w "%{http_code}" https://proposallock.onrender.com/api/proposals 2>/dev/null || echo "000")

    if [ "$api_status" = "201" ] || [ "$api_status" = "400" ]; then
        log "   ✅ API responding (HTTP $api_status)"
    elif [ "$api_status" = "404" ]; then
        log "   🔴 CRITICAL: API returning 404 - Render may not be deployed"
    else
        log "   ⚠️  API status: HTTP $api_status"
    fi
}

function display_summary() {
    log ""
    log "════════════════════════════════════════════════════════════"
    log "SUMMARY"
    log "════════════════════════════════════════════════════════════"
    log "Log file: $LOG_FILE"
    log "Next check in: $MONITOR_INTERVAL minutes"
    log ""
}

function main() {
    clear
    log "🚀 ProposalLock Launch Monitoring"
    log "════════════════════════════════════════════════════════════"

    if [ -z "$REDDIT_POST_URL" ]; then
        echo ""
        echo "Usage: bash monitor-launch.sh <reddit-post-url>"
        echo ""
        echo "Example:"
        echo "  bash monitor-launch.sh https://reddit.com/r/freelance/comments/abc123/title/"
        echo ""
        echo "Without a post URL, monitoring will:"
        echo "  ✅ Check LemonSqueezy orders"
        echo "  ✅ Check product health"
        echo "  ⏳ Wait for post URL to start Reddit engagement monitoring"
        echo ""
    fi

    check_reddit_engagement
    check_lemonsqueezy_orders
    check_product_health
    display_summary
}

main
