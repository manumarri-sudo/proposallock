# Operator Manual Actions Required
> Created: 2026-03-22 | Two actions, ~5 minutes total

---

## ACTION 1 — Trigger Render Redeploy (2 min)
**Why:** Latest commit `d7119d0` adds `/api/upload` but Render's auto-deploy from GitHub isn't connected. The route is live in the codebase but not on the server.

**Steps:**
1. Go to https://dashboard.render.com
2. Click on the **proposallock** service
3. Click **Manual Deploy** → **Deploy latest commit**
4. Wait ~3-5 minutes for build to complete (free tier)
5. Verify: `curl -X GET https://proposallock.onrender.com/api/upload` → should return `405 Method Not Allowed` (not 404)

**After this:** Run `bash test-e2e.sh` → should show **25/25 passed**

**Alternative (fix auto-deploy):**
- In Render service settings → **Build & Deploy** → connect to GitHub repo `manumarri-sudo/proposallock` → enable **Auto-Deploy on Push**

---

## ACTION 2 — Post Reddit Thread (3 min)
**Why:** First Reddit post requires human approval per Launcher playbook. No Reddit API credentials in environment.

**Content:** Copy from `VIRAL_CONTENT_MARCH22.md` → PIECE 3

**Steps:**
1. Go to https://reddit.com/r/freelance
2. Click **Create Post** → **Text**
3. Paste this title exactly:
   ```
   Anyone else keep a running tally of how much they've lost to clients who ghost after delivery?
   ```
4. Paste the body from `VIRAL_CONTENT_MARCH22.md` lines 147-162 (the personal story — **no product link in body**)
5. Submit
6. Watch for comments. When someone asks about your workflow/tool, reply with:
   ```
   I ended up building something for this -- sends a proposal link where files are locked until payment goes through. Client sees the project and price, they pay, files unlock automatically via webhook. No manual step needed.

   It's called ProposalLock: https://proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=firstdollar -- $29 one-time if you want to try it.
   ```

**Best posting time:** Tuesday-Thursday 8-10am EST (today is Sunday — if posting now is fine for urgency, otherwise wait until Tue)

---

## STATUS AFTER BOTH ACTIONS
- [ ] Render redeployed → test-e2e.sh 25/25 ✅
- [ ] Reddit thread live → link posted here: ___________
- [ ] First comment with product link posted when someone asks ✅

---

## Optional: Set Reddit API Credentials for Future Automation
```
export REDDIT_CLIENT_ID=<your app client id>
export REDDIT_CLIENT_SECRET=<your app client secret>
export REDDIT_USERNAME=<your reddit username>
export REDDIT_PASSWORD=<your reddit password>
```
Register app at: https://www.reddit.com/prefs/apps → **Create App** → Script type
