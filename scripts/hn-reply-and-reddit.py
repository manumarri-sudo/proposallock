#!/usr/bin/env python3
"""
Combined script: (1) Reply to HN callout on item 47483215, (2) Post Reddit karma comments.
Requires: HN_PASSWORD, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD

Usage:
  export HN_PASSWORD=xxx REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=xxx
  python3 proposallock/scripts/hn-reply-and-reddit.py
  python3 proposallock/scripts/hn-reply-and-reddit.py --hn-only
  python3 proposallock/scripts/hn-reply-and-reddit.py --reddit-only
  python3 proposallock/scripts/hn-reply-and-reddit.py --dry-run
"""

import os
import re
import sys
import json
import time
import argparse
import requests
from datetime import datetime

# === HN CONFIG ===
HN_ACCOUNT = "launchstack_dev"
HN_PASSWORD = os.environ.get("HN_PASSWORD", "")
HN_THREAD_ID = "47483215"

# Damage-control reply to razingeden's callout
HN_REPLY_TEXT = """fair point and yeah that's on me. i built the thing after getting burned a few times and got too eager posting about it right away. not a great look for a brand new account, i get it.

the question itself is genuine though — i'm still figuring out the best approach and milestone billing like kylecazar mentioned is probably better for most situations honestly. gating files works for my specific workflow (design deliverables) but it's not universal.

should've led with the question and left the tool out of it. lesson learned."""

# === REDDIT CONFIG ===
REDDIT_CLIENT_ID = os.environ.get("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.environ.get("REDDIT_CLIENT_SECRET", "")
REDDIT_USERNAME = os.environ.get("REDDIT_USERNAME", "")
REDDIT_PASSWORD = os.environ.get("REDDIT_PASSWORD", "")


def hn_login(session):
    """Login to HN and return authenticated session."""
    resp = session.post("https://news.ycombinator.com/login", data={
        "acct": HN_ACCOUNT,
        "pw": HN_PASSWORD,
    })
    if "user" not in session.cookies.get_dict():
        print("ERROR: HN login failed — check HN_PASSWORD", file=sys.stderr)
        return False
    print(f"HN: Logged in as {HN_ACCOUNT}")
    return True


def hn_reply_to_callout(session, dry_run=False):
    """Reply to razingeden's callout comment on HN thread."""
    print("\n=== HN: Replying to callout on item 47483215 ===")

    if dry_run:
        print(f"[DRY RUN] Would reply to razingeden's comment:\n{HN_REPLY_TEXT[:200]}...")
        return {"status": "dry_run", "thread": HN_THREAD_ID}

    # First, get the thread page to find razingeden's comment ID and HMAC
    resp = session.get(f"https://news.ycombinator.com/item?id={HN_THREAD_ID}")
    if resp.status_code != 200:
        print(f"ERROR: Failed to load thread (HTTP {resp.status_code})")
        return {"status": "failed", "error": f"HTTP {resp.status_code}"}

    # Find razingeden's comment — look for reply links near "razingeden"
    # HN comment reply links look like: <a href="reply?id=NNNNN&amp;goto=..."
    # We need to find the comment ID for razingeden's comment
    text = resp.text

    # Find all comment IDs and associated usernames
    # Pattern: class="hnuser">username</a> ... reply?id=COMMENT_ID
    comment_blocks = re.findall(
        r'class="hnuser">(\w+)</a>.*?reply\?id=(\d+)&',
        text, re.DOTALL
    )

    razingeden_id = None
    for username, comment_id in comment_blocks:
        if username == "razingeden":
            razingeden_id = comment_id
            break

    if not razingeden_id:
        # Try alternate: look for the comment that mentions "proposallock" or "30 seconds"
        # and find the nearest reply link
        print("WARNING: Could not find razingeden's comment by username, searching by content...")
        matches = re.findall(r'reply\?id=(\d+)&', text)
        if matches:
            # Try each reply link's parent comment
            for cid in matches:
                item_resp = session.get(f"https://news.ycombinator.com/item?id={cid}")
                if "razingeden" in item_resp.text or "30 seconds" in item_resp.text:
                    razingeden_id = cid
                    break

    if not razingeden_id:
        print("ERROR: Could not find razingeden's comment to reply to")
        print("Falling back: replying to the main thread instead")
        razingeden_id = HN_THREAD_ID

    # Get the reply page to extract HMAC
    reply_page = session.get(f"https://news.ycombinator.com/reply?id={razingeden_id}")
    hmac_match = re.search(r'name="hmac"\s+value="([^"]+)"', reply_page.text)
    parent_match = re.search(r'name="parent"\s+value="([^"]+)"', reply_page.text)

    if not hmac_match or not parent_match:
        print("ERROR: Could not extract HMAC/parent from reply page")
        return {"status": "failed", "error": "no hmac/parent"}

    # Post the reply
    resp = session.post("https://news.ycombinator.com/comment", data={
        "parent": parent_match.group(1),
        "hmac": hmac_match.group(1),
        "text": HN_REPLY_TEXT,
    })

    if resp.status_code in (200, 302):
        url = f"https://news.ycombinator.com/item?id={razingeden_id}"
        print(f"HN: Reply posted to razingeden's comment")
        print(f"HN: Thread URL: https://news.ycombinator.com/item?id={HN_THREAD_ID}")
        return {"status": "posted", "replied_to": razingeden_id, "thread": HN_THREAD_ID}
    else:
        print(f"ERROR: Reply failed (HTTP {resp.status_code})")
        return {"status": "failed", "error": f"HTTP {resp.status_code}"}


def reddit_post_comments(batch=None, dry_run=False):
    """Post all Reddit karma comments via OAuth/PRAW."""
    print("\n=== Reddit: Posting karma comments ===")

    try:
        import praw
    except ImportError:
        print("ERROR: praw not installed. Run: pip3 install praw", file=sys.stderr)
        return []

    if dry_run:
        print("[DRY RUN] Skipping Reddit auth")
        # Import comments from the other script
        sys.path.insert(0, os.path.dirname(__file__))
        from importlib import import_module
        spec = import_module("reddit-oauth-comment")
        for b in ([batch] if batch else [1, 2]):
            for c in spec.COMMENTS[b]:
                print(f"  [DRY RUN] Comment {c['id']}: r/{c['subreddit']}/comments/{c['submission_id']}")
        return [{"status": "dry_run"}]

    if not all([REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD]):
        missing = [k for k, v in {
            "REDDIT_CLIENT_ID": REDDIT_CLIENT_ID,
            "REDDIT_CLIENT_SECRET": REDDIT_CLIENT_SECRET,
            "REDDIT_USERNAME": REDDIT_USERNAME,
            "REDDIT_PASSWORD": REDDIT_PASSWORD,
        }.items() if not v]
        print(f"ERROR: Missing env vars: {missing}", file=sys.stderr)
        return []

    reddit = praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        username=REDDIT_USERNAME,
        password=REDDIT_PASSWORD,
        user_agent=f"launchstack-bot/1.0 by {REDDIT_USERNAME}",
    )
    me = reddit.user.me()
    print(f"Reddit: Authenticated as u/{me.name} | Karma: {me.comment_karma}")

    # Import comments from the existing script
    sys.path.insert(0, os.path.dirname(__file__))
    # Can't import with hyphen, just inline the comments reference
    # Use subprocess to run the existing script instead
    print("Delegating to reddit-oauth-comment.py...")
    import subprocess
    env = os.environ.copy()
    cmd = [sys.executable, os.path.join(os.path.dirname(__file__), "reddit-oauth-comment.py")]
    if batch:
        cmd.extend(["--batch", str(batch)])
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    return [{"status": "delegated", "returncode": result.returncode}]


def main():
    parser = argparse.ArgumentParser(description="HN reply + Reddit karma comments")
    parser.add_argument("--hn-only", action="store_true", help="Only post HN reply")
    parser.add_argument("--reddit-only", action="store_true", help="Only post Reddit comments")
    parser.add_argument("--reddit-batch", type=int, choices=[1, 2], help="Reddit batch to post")
    parser.add_argument("--dry-run", action="store_true", help="Preview without posting")
    args = parser.parse_args()

    results = {"timestamp": datetime.utcnow().isoformat(), "hn": None, "reddit": None}

    # HN Reply
    if not args.reddit_only:
        if not HN_PASSWORD and not args.dry_run:
            print("SKIP: HN_PASSWORD not set, skipping HN reply")
            results["hn"] = {"status": "skipped", "reason": "no HN_PASSWORD"}
        else:
            session = requests.Session()
            session.headers.update({
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })
            if args.dry_run or hn_login(session):
                results["hn"] = hn_reply_to_callout(session, dry_run=args.dry_run)

    # Reddit Comments
    if not args.hn_only:
        if not REDDIT_CLIENT_ID and not args.dry_run:
            print("SKIP: REDDIT_CLIENT_ID not set, skipping Reddit comments")
            results["reddit"] = {"status": "skipped", "reason": "no REDDIT_CLIENT_ID"}
        else:
            results["reddit"] = reddit_post_comments(batch=args.reddit_batch, dry_run=args.dry_run)

    # Save results
    out_path = os.path.join(os.path.dirname(__file__), "combined-results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {out_path}")


if __name__ == "__main__":
    main()
