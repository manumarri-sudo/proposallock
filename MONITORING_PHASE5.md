# Phase 5: Growth Monitoring Infrastructure
> Ready to activate once Reddit credentials are set in .env

## Status Dashboard
- **Backend API**: ✅ LIVE (verified at 2026-03-22 08:45 UTC)
- **Product URL**: https://proposallock.onrender.com
- **Payment processor**: ✅ LemonSqueezy configured
- **Viral content**: ✅ Ready in VIRAL_CONTENT_MARCH22.md
- **Reddit posting script**: ✅ Ready at scripts/reddit-post.sh
- **Blocker**: ❌ Missing 4 Reddit credentials in .env (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD)

---

## Monitoring Architecture

### 1. POST LAUNCH (Once credentials set)
```bash
# Test posting to r/freelance
export SUBREDDIT=freelance
export TITLE="Anyone else keep a running tally of how much they've lost to clients who ghost after delivery?"
export BODY="[content from VIRAL_CONTENT_MARCH22.md — PIECE 2]"
./scripts/reddit-post.sh

# Capture URLs in POSTS_LIVE.md for tracking
```

### 2. REAL-TIME ENGAGEMENT TRACKING (First 24h)

**Check every 15 minutes:**
```bash
# Monitor LemonSqueezy orders for new revenue
lemonsqueezy orders list --filter="created_at>=2026-03-22T00:00:00Z" --sort="-created_at" | jq '.data[] | {id, total, customer_email, created_at}'

# Extract UTM source from checkout URL if available
# Expected format: ?utm_source=reddit&utm_medium=post&utm_campaign=firstdollar
```

**Check every 4 hours:**
```bash
# Reddit API: fetch new comments on live posts
curl -s "https://oauth.reddit.com/r/freelance/comments/{POST_ID}" \
  -H "Authorization: bearer $REDDIT_TOKEN" | jq '.data.children[] | {author, body, score, created_utc}'

# Monitor for product reveal triggers:
# - "how do you handle payments?"
# - "what's your workflow?"
# - "where's the link?"
```

### 3. CONVERSION TRACKING

**Acceptance criteria for FIRST DOLLAR:**
- [ ] At least 1 post live on Reddit
- [ ] At least 10 visitors to proposallock.onrender.com from Reddit
- [ ] At least 1 customer purchases ($29)
- [ ] LemonSqueezy webhook fires successfully
- [ ] File unlock works end-to-end

**How to verify:**
1. **Traffic**: Check Render logs for HTTP requests with Referer: reddit.com
2. **Orders**: Query LemonSqueezy API every 30 min for orders after post time
3. **Conversions**: Check for corresponding Stripe events

---

## Phase 5 Completion Criteria

| Metric | Target | Status |
|--------|--------|--------|
| Posts live | 3 (r/freelance, r/SideProject, Twitter) | ❌ Pending credentials |
| First dollar revenue | $29 | ❌ $0 so far |
| Comment engagement | 5+ top-level comments | ⏳ Waiting for posts |
| Product reveal mentions | 2+ | ⏳ Waiting for traction |

---

## Commands Ready to Execute (Once .env is filled)

```bash
# Post to r/freelance
SUBREDDIT=freelance \
TITLE="Anyone else keep a running tally of how much they've lost to clients who ghost after delivery?" \
BODY="[PIECE 2 body from VIRAL_CONTENT]" \
./scripts/reddit-post.sh

# Post to r/SideProject
SUBREDDIT=SideProject \
TITLE="Built ProposalLock — payment-gated proposal delivery for freelancers ($29, no subscriptions)" \
BODY="[PIECE 3 body from VIRAL_CONTENT]" \
./scripts/reddit-post.sh

# Poll LemonSqueezy every 30 min
watch -n 1800 'lemonsqueezy orders list --sort="-created_at" | head -5'
```

---

## Blocker Resolution Path

**To proceed with Phase 5 launch:**

1. **Human fills .env with Reddit credentials**:
   - Log into reddit.com/prefs/apps
   - Create "ProposalLock agent" app (or use existing)
   - Copy REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
   - Add your REDDIT_USERNAME and REDDIT_PASSWORD to .env

2. **Run posting sequence** (manual or via script):
   ```bash
   ./scripts/reddit-post.sh  # r/freelance
   ./scripts/reddit-post.sh  # r/SideProject (with different TITLE/BODY)
   # Twitter — manual post or via Twitter API credentials
   ```

3. **Activate monitoring loop** (every 30 min):
   ```bash
   while true; do
     echo "=== $(date) ==="
     lemonsqueezy orders list --sort="-created_at" --limit=5
     echo "---"
     sleep 1800
   done > /tmp/revenue_monitor.log &
   ```

4. **Alert on first dollar**:
   - Emit [EVENT] to Operator with revenue transaction details
   - Trigger Phase 6 (if applicable)

---

## Next Steps (Ordered by ROI)

1. ✅ Backend verified working
2. ❌ Fill Reddit credentials in .env
3. ⏳ Post to r/freelance (highest volume subreddit)
4. ⏳ Post to r/SideProject (relevant audience)
5. ⏳ Post to Twitter (reach + engagement)
6. ⏳ Monitor for 24h, track first dollar
7. ⏳ Iterate content based on engagement data

---

## Success Metrics (Phase 5 → Phase 6)

| KPI | Target | Threshold |
|-----|--------|-----------|
| **Revenue** | $1 (first dollar) | ✅ Acceptance criterion |
| **Visitors from Reddit** | 20+ | Indicates post traction |
| **Conversion rate** | 5%+ | 1 order per 20 visitors |
| **Comment engagement** | 10+ comments | Shows interest |
| **Time to first dollar** | < 48h from post | Phase 5 deadline |

---

Last updated: 2026-03-22 08:47 UTC
Status: READY TO LAUNCH (awaiting credentials)
