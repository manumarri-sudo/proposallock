#!/usr/bin/env python3
"""
Reddit comment monitor + auto-reply for r/freelance post.
Post: https://www.reddit.com/r/freelance/comments/1s18js8/
Runs periodically to check for new comments and reply via Firecrawl browser.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

POST_URL = "https://www.reddit.com/r/freelance/comments/1s18js8/"
POST_ID = "1s18js8"
SEEN_FILE = "/tmp/reddit_seen_comments.json"
LOG_FILE = "/Users/manaswimarri/lattice-workspace/proposallock/POST_LOG.md"

# Reply templates
TOOL_MENTION_REPLY = """I ended up building something for this -- sends a proposal link where files are locked until payment goes through... ProposalLock: https://proposallock.vercel.app?utm_source=reddit&utm_medium=comment&utm_campaign=firstdollar -- $29 one-time."""

EMPATHY_REPLIES = [
    "yeah this is exactly the problem. the moment you send the files you lose all leverage. i've been burned a few times before i finally changed my workflow. did you end up recovering anything from them?",
    "honestly keeping a tally is smart. most people just absorb the loss and move on which means they never really see the full picture. what industry are you in?",
    "damn that sucks. the clients who go silent after delivery are usually the ones who were never going to pay regardless of what you did. the work being done is when they feel they have the most leverage.",
    "the ghosting after delivery thing is so demoralizing. you did everything right and still got burned. how long had you been working with this client before they went quiet?",
    "yeah i've been there. worst part is you can't even really leave a review without it looking retaliatory. the asymmetry in freelance is brutal sometimes.",
]

WORKFLOW_KEYWORDS = [
    "workflow", "tool", "how do you", "what do you use", "what tool",
    "how does that work", "how did you", "what system", "what software",
    "prevent this", "avoid this", "protect yourself", "how to prevent",
    "pay before", "payment before", "upfront", "before you send",
    "gated", "locked", "proposallock", "interesting", "tell me more",
    "what's the link", "whats the link", "share the link", "where can i",
]

def load_seen():
    if os.path.exists(SEEN_FILE):
        with open(SEEN_FILE) as f:
            return set(json.load(f))
    return set()

def save_seen(seen):
    with open(SEEN_FILE, "w") as f:
        json.dump(list(seen), f)

def fetch_comments():
    """Fetch comments from Reddit JSON API using curl (urllib gets 403)."""
    url = f"https://www.reddit.com/r/freelance/comments/{POST_ID}/.json?limit=100"
    result = subprocess.run([
        "curl", "-s",
        "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-H", "Accept: application/json",
        url
    ], capture_output=True, text=True, timeout=15)
    try:
        data = json.loads(result.stdout)
        comments = []
        for child in data[1]["data"]["children"]:
            if child["kind"] == "t1":
                cd = child["data"]
                comments.append({
                    "id": cd["id"],
                    "author": cd["author"],
                    "body": cd["body"],
                    "score": cd.get("score", 0),
                    "created_utc": cd.get("created_utc", 0),
                })
        return comments
    except Exception as e:
        print(f"[ERROR] fetch_comments: {e} | raw: {result.stdout[:200]}")
        return []

def should_mention_tool(comment_body):
    body_lower = comment_body.lower()
    return any(kw in body_lower for kw in WORKFLOW_KEYWORDS)

def pick_empathy_reply(idx):
    return EMPATHY_REPLIES[idx % len(EMPATHY_REPLIES)]

def reply_via_firecrawl(comment_id, reply_text):
    """
    Attempt to post a reply using Firecrawl browser with ls-reddit profile.
    Returns (success, url_or_error)
    """
    comment_url = f"https://www.reddit.com/r/freelance/comments/{POST_ID}/_/{comment_id}/"
    script = f"""
import subprocess, json, sys

# Use Firecrawl browser to navigate to the comment and reply
# This requires an active ls-reddit session
result = subprocess.run([
    "firecrawl", "browser",
    "--profile", "ls-reddit",
    "--url", "{comment_url}",
    "--action", "click:.repliesExpander",
    "--wait", "1000",
    "--type-text", "{reply_text.replace(chr(34), chr(39))}",
    "--submit"
], capture_output=True, text=True, timeout=60)
print(result.stdout)
print(result.stderr, file=sys.stderr)
"""
    # Write a firecrawl browser instruction file
    instructions = f"""Navigate to {comment_url}
Wait for the page to load fully.
Find the "Reply" link/button on the top-level comment.
Click it to open the reply box.
Type this exact text in the reply box:
{reply_text}
Click "Save" or "Reply" to submit the comment.
"""
    print(f"[FIRECRAWL] Would reply to comment {comment_id}")
    print(f"[FIRECRAWL] Reply text: {reply_text[:100]}...")
    # For now, we log and attempt via bash subprocess
    return False, "Firecrawl browser not auto-submittable from script"

def log_to_post_log(entries):
    """Append reply attempts to POST_LOG.md."""
    if not entries:
        return
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M CT")
    lines = [f"\n\n## {timestamp} -- Reddit Comment Monitor\n\n"]
    lines.append("| # | Comment ID | Author | Action | Reply Text | Status |\n")
    lines.append("|---|-----------|--------|--------|------------|--------|\n")
    for i, e in enumerate(entries, 1):
        reply_short = e["reply"][:60].replace("|", "/") + "..."
        lines.append(f"| {i} | {e['id']} | u/{e['author']} | reply | {reply_short} | {e['status']} |\n")
    with open(LOG_FILE, "a") as f:
        f.writelines(lines)
    print(f"[LOG] Appended {len(entries)} entries to POST_LOG.md")

def send_email_with_replies(new_comments, replies_map):
    """Send email to Manu with all pending replies for manual posting."""
    import urllib.request, urllib.parse

    body_parts = [
        f"Reddit post {POST_URL} now has {len(new_comments)} new comment(s).\n\n"
        "REPLY THESE MANUALLY (copy-paste to each comment's reply box):\n\n"
    ]
    for c in new_comments:
        comment_url = f"https://www.reddit.com/r/freelance/comments/{POST_ID}/_/{c['id']}/"
        reply = replies_map.get(c["id"], "")
        body_parts.append(
            f"--- Comment by u/{c['author']} ---\n"
            f"URL: {comment_url}\n"
            f"Their text: {c['body'][:200]}\n\n"
            f"YOUR REPLY:\n{reply}\n\n"
        )

    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key:
        print("[EMAIL] No RESEND_API_KEY -- skipping email")
        return

    payload = json.dumps({
        "from": "bytewiseai.info@gmail.com",
        "to": ["manu.marri@gmail.com"],
        "subject": f"[ProposalLock] Reddit replies needed -- {len(new_comments)} comment(s)",
        "text": "".join(body_parts),
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
        print(f"[EMAIL] Sent -- Resend ID: {result.get('id', '?')}")
        return result.get("id")
    except Exception as e:
        print(f"[EMAIL] Failed: {e}")

def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Checking {POST_URL}")
    seen = load_seen()
    comments = fetch_comments()
    print(f"[INFO] Total comments: {len(comments)}, already seen: {len(seen)}")

    new_comments = [c for c in comments if c["id"] not in seen]
    if not new_comments:
        print("[INFO] No new comments.")
        return

    print(f"[INFO] {len(new_comments)} new comment(s) found!")
    replies_map = {}
    log_entries = []
    reply_idx = 0

    for c in new_comments:
        print(f"\n  Comment by u/{c['author']}: {c['body'][:150]}")
        if should_mention_tool(c["body"]):
            reply = TOOL_MENTION_REPLY
            tag = "TOOL_MENTION"
        else:
            reply = pick_empathy_reply(reply_idx)
            reply_idx += 1
            tag = "EMPATHY"
        replies_map[c["id"]] = reply
        print(f"  -> [{tag}] Reply: {reply[:100]}...")

        # Try firecrawl browser reply
        success, info = reply_via_firecrawl(c["id"], reply)
        status = "POSTED" if success else f"PENDING_MANUAL"
        log_entries.append({
            "id": c["id"],
            "author": c["author"],
            "reply": reply,
            "status": status,
            "tag": tag,
        })
        seen.add(c["id"])

    save_seen(seen)
    log_to_post_log(log_entries)

    # Send email with all replies for manual posting
    email_id = send_email_with_replies(new_comments, replies_map)
    if email_id:
        print(f"\n[EMAIL] Replies sent to manu.marri@gmail.com (Resend: {email_id})")
    else:
        print("\n[MANUAL] Replies ready -- print them below for copy-paste:\n")
        for c in new_comments:
            comment_url = f"https://www.reddit.com/r/freelance/comments/{POST_ID}/_/{c['id']}/"
            print(f"URL: {comment_url}")
            print(f"REPLY: {replies_map[c['id']]}")
            print()

if __name__ == "__main__":
    main()
