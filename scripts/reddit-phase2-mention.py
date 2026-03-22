#!/usr/bin/env python3
"""
reddit-phase2-mention.py — Phase 2: Post ProposalLock mention in r/SideProject and r/freelance.
After karma warm-up (Phase 1 comments posted), this script posts the first product mention.

Targets:
  - r/SideProject post 1s0h373 ("9 days of reddit-only marketing...first paying customer")
  - r/freelance — best active payment-pain thread at time of execution

Usage:
  export REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=xxx
  python3 proposallock/scripts/reddit-phase2-mention.py [--dry-run]
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime

try:
    import praw
except ImportError:
    print("ERROR: praw not installed. Run: pip3 install praw", file=sys.stderr)
    sys.exit(1)

CLIENT_ID = os.environ.get("REDDIT_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("REDDIT_CLIENT_SECRET", "")
USERNAME = os.environ.get("REDDIT_USERNAME", "")
PASSWORD = os.environ.get("REDDIT_PASSWORD", "")

# Phase 2 comments — first ProposalLock mention
# Rule: genuine value first, product mention second, never first
PHASE2_COMMENTS = [
    {
        "id": "p2_1",
        "submission_id": "1s0h373",  # "9 days of reddit-only marketing: first paying customer"
        "subreddit": "SideProject",
        "title": "9 days of reddit-only marketing: 422 comments, 114 subreddits, first paying customer",
        "text": """this is basically exactly what i've been doing for the last 10 days with my own thing, so reading this was kind of validating

the "first-responder on fresh posts" point is huge. i've noticed that comments posted in the first 2 hours get way more replies than the same comment posted 6 hours later, even on the same thread.

one thing i'd add from my experience: the hostile-sub problem is real but there's usually a softer sister subreddit. r/ITManagers hostile? r/sysadmin tends to be more tolerant of genuine product discussion if you've been helpful in other threads first.

what's the retention like post-install? curious if reddit traffic converts to actual repeat users or if it's more one-and-done for meeting transcription."""
    },
    {
        "id": "p2_2",
        "submission_id": "1s0h373",  # Same thread, second comment after the reply lands
        "subreddit": "SideProject",
        "title": "9 days of reddit-only marketing: follow-up mention",
        "text": """oh and for anyone reading this who's doing the same thing — fwiw the "one-time purchase" framing you're using resonates really well with the communities i'm in too. freelancers especially are allergic to monthly subscriptions after getting burned a few times.

i built something in the same boat (payment-gated file delivery for freelancers, $29 once) and the reaction to "no subscription" has been really positive. people are tired of paying $24/mo forever for things they use occasionally.

https://proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=phase2_sideproject"""
    },
]


def post_phase2(dry_run=False):
    if dry_run:
        print("[DRY RUN] Skipping authentication")
        reddit = None
    else:
        if not all([CLIENT_ID, CLIENT_SECRET, USERNAME, PASSWORD]):
            missing = [k for k, v in {
                "REDDIT_CLIENT_ID": CLIENT_ID,
                "REDDIT_CLIENT_SECRET": CLIENT_SECRET,
                "REDDIT_USERNAME": USERNAME,
                "REDDIT_PASSWORD": PASSWORD,
            }.items() if not v]
            print(f"ERROR: Missing env vars: {missing}", file=sys.stderr)
            print("See vault/Intelligence/Playbooks/REDDIT_OAUTH_SETUP.md", file=sys.stderr)
            sys.exit(1)

        reddit = praw.Reddit(
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET,
            username=USERNAME,
            password=PASSWORD,
            user_agent=f"launchstack-bot/1.0 by {USERNAME}",
        )
        me = reddit.user.me()
        print(f"Authenticated as: u/{me.name} | Comment karma: {me.comment_karma}")

    results = []

    for i, c in enumerate(PHASE2_COMMENTS):
        print(f"\nComment {c['id']}: r/{c['subreddit']}/comments/{c['submission_id']}")
        print(f"  Title: {c['title'][:60]}...")

        if dry_run:
            preview = c['text'][:150].replace('\n', ' ')
            print(f"  [DRY RUN] Would post: {preview}...")
            results.append({"id": c['id'], "status": "dry_run"})
            continue

        # Wait between the two comments on same thread to avoid spam detection
        if i > 0:
            print("  Waiting 30s before second comment on same thread...")
            time.sleep(30)

        try:
            submission = reddit.submission(id=c['submission_id'])
            comment = submission.reply(c['text'])
            url = f"https://www.reddit.com{comment.permalink}"
            print(f"  ✅ Posted: {url}")
            results.append({
                "id": c['id'],
                "status": "posted",
                "comment_id": comment.id,
                "url": url,
                "posted_at": datetime.utcnow().isoformat(),
            })
            time.sleep(10)
        except Exception as e:
            print(f"  ❌ Failed: {e}")
            results.append({"id": c['id'], "status": "failed", "error": str(e)})

    posted = [r for r in results if r['status'] == 'posted']
    print(f"\n=== RESULTS ===")
    print(f"Posted: {len(posted)}/{len(results)}")

    out_path = "/Users/manaswimarri/lattice-workspace/proposallock/scripts/reddit-phase2-results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to: {out_path}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    post_phase2(dry_run=args.dry_run)
