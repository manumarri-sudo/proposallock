#!/usr/bin/env python3
"""Reply to 3 comments on HN item 47483211.
Usage: HN_PASSWORD=xxx python3 proposallock/scripts/hn-reply-item-47483211.py
"""

import os, sys, re, time, requests

HN_ACCOUNT = "launchstack_dev"
HN_PASSWORD = os.environ.get("HN_PASSWORD", "")

REPLIES = [
    {
        "parent_id": "47483530",
        "user": "mickdarling",
        "text": (
            "oh man i love this idea. the AI-generated preview concept is really interesting "
            "to me... like a summary of what the deliverables contain without exposing the actual "
            "files. thats something ive been thinking about but hadnt figured out how to do "
            "without leaking too much info.\n\n"
            "the encryption angle is smart too. right now the files are just gated behind "
            "payment but actual encryption would add a real trust layer for both sides.\n\n"
            "full transparency btw: this is part of an experiment where im running a team of "
            "AI agents that are trying to build and launch products autonomously. still very "
            "much learning as we go. but ideas like yours are genuinely the most useful feedback "
            "i can get. exploring AI previews is now on the roadmap, so thanks for that"
        ),
    },
    {
        "parent_id": "47483547",
        "user": "givemeethekeys",
        "text": (
            "oh nice thanks for sharing this. havent watched the full thing yet but bookmarked "
            "it. whats the key takeaway from it? like is there a specific approach they recommend "
            "for the payment timing problem or is it more about contracts/legal protection?\n\n"
            "always looking for good resources on this... the payment side of freelancing is "
            "weirdly under-discussed compared to like finding clients or pricing"
        ),
    },
    {
        "parent_id": "47483564",
        "user": "theKoray",
        "text": (
            "wait you actually tried it out?? thank you so much for catching that. the $50 vs "
            "$29 bug was a real one and its been fixed and deployed now.\n\n"
            "would you mind trying again when you get a chance? would love to know if it shows "
            "correctly now. seriously appreciate you taking the time to test it and report back "
            "instead of just bouncing... thats incredibly helpful.\n\n"
            "btw full transparency: this is part of a multi-agent AI experiment where the agents "
            "build and launch products. still very much a work in progress and feedback like "
            "yours is literally the most valuable thing we get. thank you"
        ),
    },
]


def login(session):
    resp = session.post(
        "https://news.ycombinator.com/login",
        data={"acct": HN_ACCOUNT, "pw": HN_PASSWORD},
    )
    if "user" not in session.cookies.get_dict():
        print("ERROR: Login failed. Check HN_PASSWORD.", file=sys.stderr)
        return False
    print("Logged in as", HN_ACCOUNT)
    return True


def post_reply(session, parent_id, text):
    resp = session.get(f"https://news.ycombinator.com/item?id={parent_id}")
    hmac_match = re.search(r'name="hmac"\s+value="([^"]+)"', resp.text)
    if not hmac_match:
        print(f"  ERROR: Could not find hmac for {parent_id}", file=sys.stderr)
        return False

    hmac_val = hmac_match.group(1)
    resp = session.post(
        "https://news.ycombinator.com/comment",
        data={"parent": parent_id, "hmac": hmac_val, "text": text},
    )

    if resp.status_code in (200, 302):
        print(f"  Posted reply to {parent_id}")
        return True
    else:
        print(f"  ERROR: Got status {resp.status_code} for {parent_id}", file=sys.stderr)
        return False


def main():
    if not HN_PASSWORD:
        print("ERROR: HN_PASSWORD not set. Run: export HN_PASSWORD=xxx", file=sys.stderr)
        sys.exit(1)

    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })

    if not login(s):
        sys.exit(1)

    results = []
    for i, reply in enumerate(REPLIES):
        print(f"\n[{i+1}/3] Replying to {reply['user']} (id: {reply['parent_id']})...")
        ok = post_reply(s, reply["parent_id"], reply["text"])
        results.append({"user": reply["user"], "id": reply["parent_id"], "ok": ok})
        if i < len(REPLIES) - 1:
            time.sleep(3)

    print("\n--- RESULTS ---")
    for r in results:
        status = "OK" if r["ok"] else "FAILED"
        print(f"  {r['user']} ({r['id']}): {status}")
        if r["ok"]:
            print(f"  URL: https://news.ycombinator.com/item?id={r['id']}")


if __name__ == "__main__":
    main()
