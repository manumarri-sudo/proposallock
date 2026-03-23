#!/usr/bin/env python3
"""
HN Damage Control — Reply to comments on items 47483211 and 47483215.
Transparent about the AI agent experiment.

Usage: HN_PASSWORD=xxx python3 proposallock/scripts/hn-damage-control.py
"""
import os, sys, re, time, requests

HN_ACCOUNT = "launchstack_dev"
HN_PASSWORD = os.environ.get("HN_PASSWORD", "")

REPLIES = [
    # razingeden callout (PRIORITY 1 — damage control)
    {
        "parent_item": 47483215,
        "target_user": "razingeden",
        "description": "Transparency reply to callout about new account + promo",
        "text": (
            "yeah totally fair callout. full transparency here: this is actually part of "
            "an experiment im running. im an MBA student (chicago booth) building a multi-agent "
            "system where 6 AI agents autonomously research, build, and try to launch products. "
            "ProposalLock is the first thing they built.\n\n"
            "the agents are figuring out community norms in real time and clearly got this one wrong. "
            "posting a product link from a brand new account is exactly the kind of thing that looks "
            "spammy and i should have caught it before they posted. thats on me.\n\n"
            "the actual experiment is more about AI governance and trust than the product itself... "
            "how do you give agents autonomy without them doing stuff like this? still figuring that out "
            "obviously lol. appreciate the callout honestly, its useful data for the project."
        ),
    },
    # colesantiago — Show HN suggestion
    {
        "parent_item": 47483215,
        "target_user": "colesantiago",
        "description": "Acknowledge Show HN suggestion, explain new account limitation",
        "text": (
            "good point. we actually tried Show HN first but new accounts cant post them "
            "(redirects to a limit page). the agents didnt know that until they tried it... "
            "which is kind of the whole point of the experiment. they learn by failing.\n\n"
            "once the account has some karma built up properly well do a real Show HN. "
            "appreciate the suggestion."
        ),
    },
    # theKoray — payment discrepancy on item 47483211
    {
        "parent_item": 47483211,
        "target_user": "theKoray",
        "description": "Address payment discrepancy concern",
        "text": (
            "thanks for flagging this. the $29 is the unlock fee that ProposalLock charges "
            "for the client to access deliverables. if you set a different price on your proposal "
            "theres probably a display bug we need to fix. can you share more about what you saw? "
            "the product was built by AI agents as part of an experiment so bugs like this are "
            "super valuable feedback.\n\n"
            "if youre willing to share details ill make sure it gets fixed."
        ),
    },
    # mickdarling — constructive suggestion on item 47483211
    {
        "parent_item": 47483211,
        "target_user": "mickdarling",
        "description": "Engage with constructive AI summary suggestion",
        "text": (
            "this is a really interesting idea. using an LLM to generate a summary of whats "
            "behind the paywall so the client knows what theyre unlocking without seeing the "
            "actual deliverable... thats clever.\n\n"
            "the encryption angle is interesting too. right now the files are just gated by "
            "payment webhook but a proper escrow model with verification would be way more "
            "trustworthy. thanks for thinking through this, genuinely useful suggestions."
        ),
    },
]


def find_comment_id(session, item_id, target_user):
    """Find the specific comment by target_user on the given item page."""
    resp = session.get(f"https://news.ycombinator.com/item?id={item_id}")
    if resp.status_code != 200:
        return None, None, None

    # Find all comment blocks with their IDs and usernames
    # HN comment structure: <tr class='athing comtr' id='COMMENT_ID'>
    # followed by <a href="user?id=USERNAME" class="hnuser">USERNAME</a>
    comment_ids = re.findall(r"class='athing comtr' id='(\d+)'", resp.text)
    comment_users = re.findall(r'class="hnuser">([^<]+)</a>', resp.text)

    for cid, cuser in zip(comment_ids, comment_users):
        if cuser == target_user:
            # Now fetch the comment's reply page to get hmac
            reply_resp = session.get(f"https://news.ycombinator.com/reply?id={cid}")
            if reply_resp.status_code != 200:
                return cid, None, None
            hmac_match = re.search(r'name="hmac"\s+value="([^"]+)"', reply_resp.text)
            parent_match = re.search(r'name="parent"\s+value="([^"]+)"', reply_resp.text)
            hmac_val = hmac_match.group(1) if hmac_match else None
            parent_val = parent_match.group(1) if parent_match else None
            return cid, hmac_val, parent_val

    return None, None, None


def login(session):
    resp = session.post("https://news.ycombinator.com/login", data={
        "acct": HN_ACCOUNT,
        "pw": HN_PASSWORD,
    })
    # Check if login succeeded by looking for user cookie
    if "user" not in session.cookies.get_dict():
        return False
    return True


def post_reply(session, parent_id, hmac_val, text):
    resp = session.post("https://news.ycombinator.com/comment", data={
        "parent": parent_id,
        "hmac": hmac_val,
        "text": text,
    })
    return resp.status_code in (200, 302)


def main():
    if not HN_PASSWORD:
        print("ERROR: HN_PASSWORD not set. Run: export HN_PASSWORD=xxx")
        sys.exit(1)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })

    print("Logging in as", HN_ACCOUNT, "...")
    if not login(session):
        print("ERROR: Login failed. Check HN_PASSWORD.")
        sys.exit(1)
    print("Login OK.\n")

    results = []
    for i, reply in enumerate(REPLIES):
        print(f"[{i+1}/{len(REPLIES)}] Replying to {reply['target_user']} on item {reply['parent_item']}...")
        print(f"  Description: {reply['description']}")

        comment_id, hmac_val, parent_val = find_comment_id(
            session, reply["parent_item"], reply["target_user"]
        )

        if not comment_id:
            print(f"  SKIP: Could not find comment by {reply['target_user']} on item {reply['parent_item']}")
            results.append({"user": reply["target_user"], "status": "not_found"})
            continue

        if not hmac_val:
            print(f"  SKIP: Could not get reply form for comment {comment_id}")
            results.append({"user": reply["target_user"], "status": "no_hmac"})
            continue

        parent_id = parent_val or comment_id
        success = post_reply(session, parent_id, hmac_val, reply["text"])

        if success:
            print(f"  OK: Reply posted to {reply['target_user']} (comment {comment_id})")
            results.append({
                "user": reply["target_user"],
                "status": "posted",
                "comment_id": comment_id,
                "url": f"https://news.ycombinator.com/item?id={comment_id}",
            })
        else:
            print(f"  FAIL: Could not post reply to {reply['target_user']}")
            results.append({"user": reply["target_user"], "status": "failed"})

        # Rate limit between posts
        if i < len(REPLIES) - 1:
            print("  Waiting 30s (rate limit)...")
            time.sleep(30)

    print("\n=== RESULTS ===")
    for r in results:
        print(f"  {r['user']}: {r['status']}", end="")
        if r.get("url"):
            print(f" — {r['url']}", end="")
        print()


if __name__ == "__main__":
    main()
