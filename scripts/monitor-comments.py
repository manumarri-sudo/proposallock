#!/usr/bin/env python3
"""
Monitor Reddit threads for Manu's comments and replies.
Runs every 10 minutes. Emails reply drafts when engagement detected.

Threads:
  A: r/freelance/1rirozj -- billing dispute thread
  B: r/Upwork/1s20voz    -- late invoice thread
"""

import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────
THREADS = {
    "A": {
        "id": "1rirozj",
        "subreddit": "freelance",
        "url": "https://www.reddit.com/r/freelance/comments/1rirozj.json?limit=200",
        "staged_keywords": ["gating delivery", "files until payment", "renegotiation angle", "daily rate", "had my first client pay"],
        "known_ids": set("o8fxfoj,o8g2smf,o8gbqm2,o8geneu,o8gey86,o8glaro,o8hhhsv,o8hla4v,o8hpwsp,o8hwtl0,o8i5q86,o8io7m8,o8klfmn,o8koyiv,o8kq7j0,o8l7e60,o8lrs79,o8mvfyj,o8ne97u,o8p29eo,o8pdl60,o8qtdx6,o8qvxf2,o8t9m18,o8v7e6j,o8wmlwf,o8znuoz,o904bfk,o986ej8,o9cydr7".split(",")),
        "manu_comment_id": None,
    },
    "B": {
        "id": "1s20voz",
        "subreddit": "Upwork",
        "url": "https://www.reddit.com/r/Upwork/comments/1s20voz.json?limit=200",
        "staged_keywords": ["not chasing at all", "files unlock automatically", "5 min instead of 5 weeks", "client paid without any pushback"],
        "known_ids": set(["oc4zoxk"]),
        "manu_comment_id": None,
    },
}

STATE_FILE = "/Users/manaswimarri/lattice-workspace/proposallock/scripts/monitor-state.json"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
NOTIFY_EMAIL = "manu.marri@gmail.com"

# ── Reply templates ──────────────────────────────────────────────────────────

def credibility_reply(original_comment_body, thread_topic):
    """First reply -- build credibility, NO product link."""
    return f"""thanks for the response -- yeah totally agree on the [relevant point].

curious what's worked for you in practice? i've found the pushback on upfront payment varies a lot by client type (agencies vs direct clients are pretty different in my experience)"""

def warm_lead_reply(original_comment_body):
    """Reply when someone asks about the tool/approach -- drop product link."""
    return f"""yeah it's a tool i built for myself called ProposalLock -- proposallock.vercel.app

basically you paste in your file URL, set a price, and it generates a proposal link. client sees the project summary + price, pays, files unlock automatically via webhook. $29 once, no subscription.

the proposal page has a little FAQ built in (is this secure, do i need an account, what happens after i pay) which i found clears most client hesitation before they even ask"""

WARM_LEAD_KEYWORDS = [
    "what tool", "which tool", "how does", "what do you use", "link",
    "tell me more", "more info", "proposallock", "where can", "try it",
    "share it", "what's it called", "what is it", "name of", "how to do this",
    "sounds interesting", "interested", "how exactly", "set that up",
]

# ── Reddit fetch ──────────────────────────────────────────────────────────────

def fetch_comments(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ProposalLock-Monitor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        return data[1]["data"]["children"]
    except Exception as e:
        print(f"[ERROR] fetch failed: {e}")
        return []

# ── Email via Resend ──────────────────────────────────────────────────────────

def send_email(subject, body):
    if not RESEND_API_KEY:
        print("[WARN] No RESEND_API_KEY -- skipping email")
        return None
    payload = json.dumps({
        "from": "onboarding@resend.dev",
        "to": [NOTIFY_EMAIL],
        "subject": subject,
        "text": body,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            print(f"[EMAIL] Sent: {result.get('id')}")
            return result.get("id")
    except Exception as e:
        print(f"[ERROR] Email failed: {e}")
        return None

# ── State persistence ──────────────────────────────────────────────────────────

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            s = json.load(f)
        # Restore sets
        for k in THREADS:
            if k in s:
                s[k]["known_ids"] = set(s[k].get("known_ids_list", []))
        return s
    return {}

def save_state(state):
    serializable = {}
    for k, v in state.items():
        serializable[k] = {**v, "known_ids_list": list(v.get("known_ids", set()))}
        serializable[k].pop("known_ids", None)
    with open(STATE_FILE, "w") as f:
        json.dump(serializable, f, indent=2)

# ── Main logic ────────────────────────────────────────────────────────────────

def check_thread(label, thread, state):
    tid = thread["id"]
    comments = fetch_comments(thread["url"])
    if not comments:
        return

    known = thread["known_ids"]
    manu_id = thread.get("manu_comment_id")
    now_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    events = []

    for c in comments:
        if c["kind"] != "t1":
            continue
        d = c["data"]
        cid = d["id"]
        body = d["body"]
        author = d["author"]

        # New comment appeared
        if cid not in known:
            known.add(cid)
            print(f"[{label}] NEW comment {cid} by {author}: {body[:100]}")

            # Check if this is Manu's staged comment
            if manu_id is None:
                body_lower = body.lower()
                if any(kw.lower() in body_lower for kw in thread["staged_keywords"]):
                    print(f"[{label}] DETECTED Manu's comment: {cid}")
                    thread["manu_comment_id"] = cid
                    manu_id = cid
                    events.append(("manu_posted", cid, author, body))

        # Check replies to Manu's comment
        if manu_id and d.get("parent_id") == f"t1_{manu_id}":
            body_lower = body.lower()
            is_warm = any(kw in body_lower for kw in WARM_LEAD_KEYWORDS)
            reply_key = f"replied_{cid}"

            if reply_key not in state.get(label, {}):
                state.setdefault(label, {})[reply_key] = True
                events.append(("reply_detected", cid, author, body, is_warm))

    # Emit notifications
    for event in events:
        etype = event[0]
        if etype == "manu_posted":
            _, cid, author, body = event
            send_email(
                f"Lattice: Comment A Posted -- {label} ({thread['subreddit']})",
                f"Manu's comment detected on r/{thread['subreddit']}!\n\n"
                f"Comment ID: {cid}\n"
                f"URL: https://www.reddit.com/r/{thread['subreddit']}/comments/{tid}/_/{cid}/\n\n"
                f"Body:\n{body}\n\n"
                f"Monitoring for replies now. Will email you reply drafts within 2h of any engagement."
            )

        elif etype == "reply_detected":
            _, cid, author, body, is_warm = event
            subreddit = thread["subreddit"]
            comment_url = f"https://www.reddit.com/r/{subreddit}/comments/{tid}/_/{cid}/"
            parent_url = f"https://www.reddit.com/r/{subreddit}/comments/{tid}/_/{manu_id}/"

            if is_warm:
                reply_draft = warm_lead_reply(body)
                reply_type = "WARM LEAD -- include ProposalLock link"
            else:
                reply_draft = credibility_reply(body, subreddit)
                reply_type = "General engagement -- build credibility, NO product link"

            send_email(
                f"Lattice: Reply on r/{subreddit} [{reply_type}]",
                f"Someone replied to your comment on r/{subreddit}!\n\n"
                f"--- THEIR REPLY ---\n"
                f"Author: u/{author}\n"
                f"URL: {comment_url}\n"
                f"Text: {body}\n\n"
                f"--- YOUR REPLY DRAFT ({reply_type}) ---\n"
                f"{reply_draft}\n\n"
                f"--- HOW TO POST ---\n"
                f"1. Open: {parent_url}\n"
                f"2. Click 'Reply' on your comment\n"
                f"3. Paste the draft above\n"
                f"4. Hit save\n\n"
                f"Reply within 2h for best conversion."
            )

    thread["known_ids"] = known

# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    print(f"[{datetime.utcnow().isoformat()}] Monitor starting...")
    state = load_state()

    # Restore state into THREADS
    for label in THREADS:
        saved = state.get(label, {})
        if "known_ids_list" in saved:
            THREADS[label]["known_ids"] = set(saved["known_ids_list"])
        if saved.get("manu_comment_id"):
            THREADS[label]["manu_comment_id"] = saved["manu_comment_id"]

    for label, thread in THREADS.items():
        print(f"[{label}] Checking r/{thread['subreddit']}...")
        check_thread(label, thread, state)

    # Persist updated state
    for label, thread in THREADS.items():
        state.setdefault(label, {})["known_ids_list"] = list(thread["known_ids"])
        state[label]["manu_comment_id"] = thread.get("manu_comment_id")
    save_state(state)
    print(f"[{datetime.utcnow().isoformat()}] Done. State saved to {STATE_FILE}")

if __name__ == "__main__":
    main()
