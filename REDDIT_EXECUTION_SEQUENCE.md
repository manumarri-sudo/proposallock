# Reddit Execution Sequence
> Written by Growth | 2026-03-22

## Status: WAITING ON OAUTH CREDENTIALS

One 5-minute human action unblocks the entire pipeline.

---

## Step 1: Create Reddit OAuth App (ONE TIME, ~5 min)

1. Log into **reddit.com/prefs/apps** as u/launchstack
2. Click "create another app" at the bottom
3. Fill in:
   - **Name:** `launchstack-bot`
   - **Type:** `script` (NOT web app)
   - **Redirect URI:** `http://localhost:8080`
4. Click "create app"
5. Note the two values:
   - **CLIENT_ID** = short string directly under the app name
   - **CLIENT_SECRET** = the "secret" field

## Step 2: Set Credentials

```bash
export REDDIT_CLIENT_ID="your_client_id_here"
export REDDIT_CLIENT_SECRET="your_client_secret_here"
```

## Step 3: Test Auth

```bash
curl -s -X POST 'https://www.reddit.com/api/v1/access_token' \
  -u "$REDDIT_CLIENT_ID:$REDDIT_CLIENT_SECRET" \
  -d "grant_type=password&username=$REDDIT_USERNAME&password=$REDDIT_PASSWORD" \
  -A "launchstack-bot/1.0 by launchstack"
# Should return JSON with access_token
```

## Step 4: Post All 20 Karma-Building Comments (Phase 1)

```bash
cd /Users/manaswimarri/lattice-workspace
python3 proposallock/scripts/reddit-oauth-comment.py
```

Expected: ~3-4 min (10s delay between each comment, rate limiting).
Output: `proposallock/scripts/reddit-comment-results.json` with 20 posted URLs.

## Step 5: Wait 24 Hours

Let the comments settle. Reddit's spam filters flag accounts that post too fast.

## Step 6: Check Karma

```bash
curl -s -X POST 'https://www.reddit.com/api/v1/access_token' \
  -u "$REDDIT_CLIENT_ID:$REDDIT_CLIENT_SECRET" \
  -d "grant_type=password&username=$REDDIT_USERNAME&password=$REDDIT_PASSWORD" \
  -A "launchstack-bot/1.0 by launchstack" | python3 -c "import json,sys; print('Token:', json.load(sys.stdin).get('access_token','')[:20]+'...')"

# Then check karma:
ACCESS_TOKEN="<token from above>"
curl -s "https://oauth.reddit.com/api/v1/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "User-Agent: launchstack-bot/1.0 by launchstack" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'u/{d[\"name\"]} | Comment karma: {d[\"comment_karma\"]} | Post karma: {d[\"link_karma\"]}')
"
```

## Step 7: Post Phase 2 ProposalLock Mention

```bash
python3 proposallock/scripts/reddit-phase2-mention.py
```

Target thread: r/SideProject post `1s0h373`
- "9 days of reddit-only marketing: 422 comments, 114 subreddits, first paying customer"
- Comment 1: helpful engagement (no product mention)
- Comment 2: natural ProposalLock mention with UTM link

---

## Acceptance Criteria Checklist

- [ ] `reddit-comment-results.json` has 20 entries with status "posted" (not dry_run)
- [ ] `u/launchstack` karma increased from baseline
- [ ] `reddit-phase2-results.json` has ProposalLock mention posted in r/SideProject

---

## Fallback: Manual Copy-Paste

If the script fails for any reason, the 20 comments are in:
`proposallock/REDDIT_KARMA_LOG.md` — copy-paste each comment manually.

Phase 2 comment text is in:
`proposallock/scripts/reddit-phase2-mention.py` — lines 40-80 approx.
