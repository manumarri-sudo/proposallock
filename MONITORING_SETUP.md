# ProposalLock First Dollar Monitoring Setup

**Status:** Ready to activate once posts go live
**Updated:** 2026-03-22
**Owner:** Operator

---

## POST LOCATIONS (For You to Fill In After Posting)

Once you manually post, provide these URLs:

```
TWITTER_THREAD_URL = [URL of your first tweet in the thread]
LINKEDIN_POST_URL = [URL of your LinkedIn post]
REDDIT_POST_URL = [URL of your Reddit r/freelance post]
```

---

## WHAT I'LL MONITOR

### 1. Traffic via UTM Tracking in LemonSqueezy

Every visitor from social will hit one of these URLs:
- Twitter: `https://proposallock.onrender.com?utm_source=twitter&utm_medium=thread&utm_campaign=firstdollar`
- LinkedIn post: `https://proposallock.onrender.com?utm_source=linkedin&utm_medium=post&utm_campaign=firstdollar`
- LinkedIn comment: `https://proposallock.onrender.com?utm_source=linkedin&utm_medium=comment&utm_campaign=firstdollar`
- Reddit: `https://proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=firstdollar`

**Tracking method:** I will check LemonSqueezy API for orders, extract the referrer header or UTM query params, and attribute each sale to its source.

---

### 2. Engagement Metrics

**Twitter:**
- Impressions (will need you to screenshot)
- Retweets + Likes
- Replies (I'll flag if they mention bugs/issues)

**LinkedIn:**
- Reactions (like, comment, share counts)
- Comment replies (I'll respond to product questions within 1h)

**Reddit:**
- Upvotes on main post
- Comment count
- Natural product mentions in replies
- Award count

---

### 3. Revenue Attribution

| If a customer orders | Source | Attribution |
|-------|--------|-----|
| Checkout page shows referrer = twitter.com | Twitter | ✅ Twitter thread gets credit |
| Checkout page shows referrer = linkedin.com | LinkedIn | ✅ LinkedIn gets credit |
| Checkout page shows referrer = reddit.com | Reddit | ✅ Reddit gets credit |
| No referrer (direct visit) | Unknown | ⚠️ Flagged as unattributed |

---

## HOW I'LL CHECK

1. **Every 15 minutes** (automated via polling script):
   - Query LemonSqueezy API for new orders
   - Extract referrer/UTM data
   - Log to FIRST_DOLLAR_TRACKER.md

2. **Every 1 hour** (manual check during peak traffic hours):
   - Screenshot engagement metrics (likes, comments, upvotes)
   - Check Reddit/Twitter/LinkedIn for comments requiring response
   - Flag any bug reports or UX issues

3. **Real-time** (if conversion happens):
   - Emit [EVENT] type: FIRST_REVENUE
   - Target: Growth (for optimization)
   - Include: platform, order amount, customer feedback

---

## ACCEPTANCE CRITERIA (Your Role)

- [ ] Post Twitter thread to X
- [ ] Post LinkedIn post + reply with tool link
- [ ] Post Reddit r/freelance post
- [ ] Copy-paste the three URLs into this file (or send to me)
- [ ] Provide direct link to your LemonSqueezy dashboard (or API credentials) so I can check orders

---

## ACCEPTANCE CRITERIA (My Role)

Once URLs are provided:

- [ ] Monitoring script activated and polling LemonSqueezy every 15 min
- [ ] Engagement metrics tracked hourly
- [ ] Any comments requiring response flagged <60 min
- [ ] First revenue event emitted with full attribution
- [ ] Handoff to Growth with optimization recommendations

---

## NEXT STEPS

1. **You:** Post the 3 pieces to Twitter, LinkedIn, Reddit
2. **You:** Send me the post URLs
3. **Me:** Activate monitoring + start polling
4. **Me:** Report first conversion (or lack thereof) within 24h
5. **Growth:** Optimize based on which channel converts

---

## TOOLS I'LL USE

- **LemonSqueezy API** (check orders + referrers)
- **Firecrawl** (scrape post engagement metrics from social)
- **Bash** (parse referrer logs, calculate attribution)
- **Spreadsheet logic** (daily summary report)

---

**Status:** Awaiting post URLs → Ready to activate
**Token budget remaining:** $0.96
