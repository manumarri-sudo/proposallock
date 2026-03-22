# ProposalLock Monitoring Dashboard — Phase 5 Launch
> Created: 2026-03-22 | Live monitoring after Reddit post goes live

---

## 📊 BASELINE (PRE-LAUNCH)

**Timestamp:** 2026-03-22 02:45 UTC

| Metric | Value | Status |
|--------|-------|--------|
| **LemonSqueezy Orders** | 0 | 🔴 No revenue |
| **Reddit Post** | Not posted | 🔴 Awaiting human action |
| **Product Health** | ✅ Live on proposallock.onrender.com | 🟢 |
| **Backend API** | ❌ 404 on `/api/proposals` | 🔴 BLOCKER |

---

## 🎯 SUCCESS CRITERIA

### Acceptance Criteria (HARD GATES)
- [ ] **Reddit post URL logged** — format: https://reddit.com/r/freelance/comments/xxxxx/
- [ ] **LemonSqueezy order count > 0** — at least 1 order created from Reddit UTM
- [ ] **Reply posted with UTM link** — when someone asks about tools/workflow

### Phase 5 Revenue KPI (NORTH STAR)
- **Target:** $1+ revenue (first dollar)
- **Current:** $0
- **Required:** ≥1 customer who clicked Reddit link → visited proposallock.onrender.com → paid $29

---

## 📍 MONITORING PROCESS

### STEP 1: Human Posts Reddit Thread
**When:** After receiving approval (currently AWAITING)
**Where:** https://reddit.com/r/freelance
**What:** Copy from VIRAL_CONTENT_MARCH22.md, PIECE 3 (lines 147-162)

**Acceptance:**
- [ ] Title exactly matches: "Anyone else keep a running tally of how much they've lost to clients who ghost after delivery?"
- [ ] Body posted without product link (no ProposalLock URL in body)
- [ ] Post created before Tuesday (optimal: Tue-Thu 8-10am EST)

**ACTION:** Once posted, log the post URL here:
```
REDDIT_POST_URL = https://reddit.com/r/freelance/comments/[POST_ID]/
POSTED_AT = [timestamp]
```

---

### STEP 2: Monitor Reddit Engagement (Every 30 min for 4 hours, then 2h intervals)

**Metrics to track:**
| Metric | Target | Check Method |
|--------|--------|--------------|
| **Upvotes** | 30+ in first 4h | Firecrawl scrape |
| **Comments** | 10+ in first 4h | Firecrawl scrape |
| **Product mentions** | 3-5 organic | Manual review of replies |
| **Questions asked** | 5+ "what tool do you use?" style | Manual review |

**Check command:**
```bash
# Scrape Reddit post for engagement metrics
# Count: upvote score, comment count
curl -s "https://reddit.com/r/freelance/comments/[POST_ID]/.json" | jq '.data.children[0].data | {score, num_comments}'
```

**Alert threshold:** If upvotes < 5 after 2 hours, post may not be gaining traction (consider cross-posting to r/SideProject, r/entrepreneur)

---

### STEP 3: Monitor LemonSqueezy Orders (Every 15 min for first hour, then 30 min)

**Command to check order count:**
```bash
lmsq orders list --store-id 312605 --count
```

**Expected behavior:**
- First 30 min: Likely 0 (time for Reddit visibility + click + load site + decide)
- 1-2 hours: First order(s) should arrive
- 4+ hours: Multiple orders if post is gaining traction

**Alert on:**
- First order → celebrate! This is first dollar.
- Order with `utm_source=reddit` → confirm acquisition channel working
- Multiple orders same minute → possible bot or refresh loop

---

### STEP 4: Reply to "What tool do you use?" Comments

**Trigger:** When someone asks about your workflow/tool in thread

**Reply template (from VIRAL_CONTENT_MARCH22.md):**
```
I ended up building something for this -- sends a proposal link where files are locked until payment goes through. Client sees the project and price, they pay, files unlock automatically via webhook. No manual step needed.

It's called ProposalLock: https://proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=firstdollar -- $29 one-time if you want to try it. The mechanic itself is the key thing though, whether you use a tool or DIY it.
```

**Action:**
- [ ] Comment posted with exact URL (includes UTM params)
- [ ] Reply timestamp logged
- [ ] Monitor replies to your comment for objections/questions

---

## 📈 MONITORING DASHBOARD (LIVE)

```
╔════════════════════════════════════════════════════════════════╗
║              PROPOSALLOCK LAUNCH MONITORING — LIVE              ║
╚════════════════════════════════════════════════════════════════╝

POST STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URL:          https://reddit.com/r/freelance/comments/[PENDING]
Posted at:    [PENDING]
Hours live:   [PENDING]

REDDIT ENGAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Upvotes:      0   (target: 30+)
Comments:     0   (target: 10+)
Trending:     [PENDING]

LEMMONSQUEEZY CONVERSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total orders: 0   (target: 1+)
Revenue:      $0  (target: $29+)
From Reddit:  0   (utm_source=reddit)

LAST CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Updated:      [PENDING]
Next check:   [PENDING]
```

---

## 🚨 CRITICAL BLOCKER (MUST FIX BEFORE LAUNCH)

**Backend API 404 on `/api/proposals`** — Even if Reddit post drives traffic, no one can create proposals. The checkout link will fail.

**Status:** CRITICAL — blocks all conversions

**Resolution required:**
- [ ] Render manual deploy (ACTION 1 in OPERATOR_ACTIONS.md)
- [ ] Verify `/api/proposals` returns 201 (not 404)
- [ ] Test e2e: `bash test-e2e.sh` → 25/25 passing

**Until this is fixed:** Post may drive traffic, but no revenue possible.

---

## 📋 MONITORING CHECKLIST

### PRE-LAUNCH (Human actions)
- [ ] ACTION 1: Render redeploy — `/api/proposals` returns 201, not 404
- [ ] ACTION 2: Reddit post live — title + body exact match
- [ ] Start monitoring (begin Step 2 above)

### LAUNCH WINDOW (0-4 hours)
- [ ] Monitor Reddit every 30 min
- [ ] Monitor LemonSqueezy orders every 15 min
- [ ] Reply to "what tool" comments within 30 min
- [ ] Log all product mention opportunities

### POST-LAUNCH (4-24 hours)
- [ ] Monitor Reddit every 2 hours
- [ ] Monitor LemonSqueezy every 30 min
- [ ] Reply to all tool/workflow questions
- [ ] Check for negative comments/objections and engage

### DATA COLLECTION (Continuous)
- [ ] Log Reddit post URL
- [ ] Log each order timestamp + utm_source
- [ ] Log each product mention comment + engagement
- [ ] Document objections and responses

---

## 🔗 KEY LINKS

| Link | Purpose |
|------|---------|
| [VIRAL_CONTENT_MARCH22.md](./VIRAL_CONTENT_MARCH22.md) | All post content + UTM URLs |
| [OPERATOR_ACTIONS.md](./OPERATOR_ACTIONS.md) | Render deploy + manual actions |
| [ProposalLock Live](https://proposallock.onrender.com) | Product URL |
| [Reddit r/freelance](https://reddit.com/r/freelance) | Post destination |
| [LemonSqueezy Dashboard](https://lemonsqueezy.com) | Order tracking |

---

## 📌 NEXT STEPS

**Immediately:**
1. ✅ Baseline captured (0 orders, no post)
2. ⏳ Awaiting: Render redeploy (ACTION 1)
3. ⏳ Awaiting: Reddit post (ACTION 2)

**Once both actions complete:**
1. Begin active monitoring (Step 2-4 above)
2. Check engagement every 30 min for 4 hours
3. Reply to product questions with UTM link
4. Log first order (FIRST DOLLAR milestone)
5. Document channel performance (conversion rate, engagement)

---

## 📊 EXPECTED OUTCOMES (By Phase 5 Definition)

| Scenario | Likelihood | Action |
|----------|-----------|--------|
| **Post goes viral** (100+ upvotes, 20+ comments) | 🟡 Medium (depends on Reddit audience receptiveness) | Continue engagement, may warrant follow-up post |
| **Post gains modest traction** (20-50 upvotes, 5-10 comments, 1-2 orders) | 🟢 High (typical niche post) | Document funnel metrics, plan iteration |
| **Post underperforms** (< 10 upvotes, < 3 comments, 0 orders) | 🟡 Medium (possible audience mismatch) | Try r/SideProject or LinkedIn → pivot strategy |
| **First order arrives** | 🟢 SUCCESS | Log timestamp, utm_source, customer email |

---

**Status:** AWAITING HUMAN ACTIONS (Render deploy + Reddit post)
**Monitoring ready:** Yes ✅
**First dollar target:** $1+ from utm_source=reddit by 2026-03-23 EOD
