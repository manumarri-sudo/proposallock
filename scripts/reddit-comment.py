#!/usr/bin/env python3
"""
reddit-comment.py — Post comments to Reddit threads via browser automation.
No OAuth client credentials required — uses username/password login.

Usage:
  python3 reddit-comment.py

Env vars:
  REDDIT_USERNAME  — Reddit account username
  REDDIT_PASSWORD  — Reddit account password
"""

import os
import sys
import json
import time
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

USERNAME = os.environ.get("REDDIT_USERNAME", "")
PASSWORD = os.environ.get("REDDIT_PASSWORD", "")

if not USERNAME or not PASSWORD:
    print("ERROR: REDDIT_USERNAME and REDDIT_PASSWORD must be set", file=sys.stderr)
    sys.exit(1)

COMMENTS = [
    {
        "id": 1,
        "thread_url": "https://www.reddit.com/r/freelance/comments/1rirozj/",
        "thread_title": "Client wants to switch from daily billing to hourly billing after receiving the invoice",
        "text": """honestly this is a contract renegotiation attempt, plain and simple. she's saying "this could have been done faster" which is basically asking you to take the hit for being efficient.

don't switch to hourly for this invoice. you cleared your schedule daily to be available whenever she needed — that availability IS the value you're billing for. hourly would be a pay cut for doing the same work.

push back politely but firmly: the daily rate was agreed to and reflects your availability commitment. if she wants hourly going forward that's a new agreement with a different scope. but this invoice is for work already done under the agreed terms. don't rewrite the past because she's uncomfortable with the total."""
    },
    {
        "id": 2,
        "thread_url": "https://www.reddit.com/r/freelance/comments/1qqtkoh/",
        "thread_title": "Looking for advice after a payment dispute with a client",
        "text": """damn that sucks and the "using it publicly while not paying" part is actually your leverage here

document everything right now. screenshot every social post where your content is live. that's your evidence if this escalates.

practically: send one firm final email with a specific date. "payment due by [date], after which i will pursue this through [small claims/collections]." vague threats don't work, specific deadlines do.

in a lot of jurisdictions, using delivered work without paying is a clean breach of contract case. worth a free 30min lawyer consult just to know your options. you have more leverage than it feels like right now."""
    },
    {
        "id": 3,
        "thread_url": "https://www.reddit.com/r/freelance/comments/1rgk3zv/",
        "thread_title": "Just lost my biggest client",
        "text": """this always stings more than it probably should because it's not just money, it's the predictability. knowing that amount is coming every month changes how you think about everything else.

what type of work were you doing for them? genuinely asking because sometimes the best move is taking the exact same service to competitors in the same industry. they already validated there's demand, you have proof of work, and competing firms often have the same pain. you have more to offer than it feels like right now."""
    },
    {
        "id": 4,
        "thread_url": "https://www.reddit.com/r/freelance/comments/1r8h6ng/",
        "thread_title": "Client pausing project without telling me — normal for contract work?",
        "text": """fwiw this is really common with institutional clients, universities especially. budget cycles, grant timelines, internal politics... any of those can pause a program without warning and the vendor won't always pass the info down to subcontractors.

the real issue is the vendor didn't communicate the uncertainty so you could plan around it. that's on them not on the university.

going forward: ask vendors explicitly about project runway before you assume continuity. "is this funded for the year or quarterly?" is a totally reasonable question and the answer tells you a lot about how much you can count on the work."""
    },
    {
        "id": 5,
        "thread_url": "https://www.reddit.com/r/freelance/comments/1re9ttz/",
        "thread_title": "Client expects employee-like behavior",
        "text": """the fact that they pay well makes it complicated but you're essentially doing employment without job security, benefits, or legal protections

honestly i'd look at this as a scope problem. if you haven't spelled out communication expectations in your contract, now's the time. "i respond to messages within X hours, M-F. calls by appointment only." is completely reasonable to add.

some clients genuinely don't understand the difference between a contractor and an employee. framing it as "here's how i work" rather than "stop calling so much" tends to land a lot better. and if they push back after you've set clear terms, that tells you something important about whether this client is actually worth keeping."""
    },
    {
        "id": 6,
        "thread_url": "https://www.reddit.com/r/freelance/comments/1qt09my/",
        "thread_title": "Subcontractor dealing with end-client pressure, help!",
        "text": """the classic subcontract trap: you're accountable to the end client's expectations but you don't have a direct relationship to actually manage them.

the agency is supposed to be your buffer here. push everything up through them, explicitly: "i need X resources/feedback to deliver on scope, i've asked Y times, please escalate." put it all in writing.

on the "communication issue" flag: ask the agency for specifics in writing immediately. vague feedback like that is often a precursor to withholding payment and blaming quality. protect yourself now while there's still a paper trail to build."""
    },
    {
        "id": 7,
        "thread_url": "https://www.reddit.com/r/Upwork/comments/1rz1jrf/",
        "thread_title": "The client was supposed to pay me $30, but only paid $15 and is no longer responding",
        "text": """first thing to check: was the second milestone actually funded? if they never funded it, upwork can't enforce collection on that $15.

if it was funded: go to the resolution center and open a dispute. the fact that they asked for a redo AND you redid it is documented in the chat, which is exactly the kind of evidence upwork looks at.

others are right that this is a hard lesson about minimum job sizes. the time you've already spent chasing this probably exceeds the $15. but you can still file the dispute, it's worth doing just so the client gets a mark on their account."""
    },
    {
        "id": 8,
        "thread_url": "https://www.reddit.com/r/Upwork/comments/1rzijqu/",
        "thread_title": "Shouldn't upwork refund you the connects a job a client has abandoned without hiring",
        "text": """100% agree it's frustrating, and the cynical answer is that upwork profits whether the job gets filled or not so there's genuinely no incentive for them to close abandoned listings.

practical workaround i use: before spending connects, check the client's response rate on their profile and when they were last active. clients with <50% response rate or who haven't logged in for days are basically abandoned listings already. not a perfect filter but cuts down on wasted connects.

some people only bid on jobs posted in the last few hours for exactly this reason. older jobs have much lower response rates regardless of whether they're technically "open.\""""
    },
    {
        "id": 9,
        "thread_url": "https://www.reddit.com/r/Upwork/comments/1rzx1s1/",
        "thread_title": "[Client perspective] How do you successfully dispute hours on Upwork?",
        "text": """the dispute process is honestly underwhelming from a client side. if the tracker shows keyboard/mouse activity, upwork's default is to lean toward the freelancer.

that said: go to the resolution center, open a formal dispute, and be very specific. "job was scoped as X with Y expected output. freelancer logged 4 hours and delivered Z which is unusable." screenshots of the job post + whatever deliverable you got = your evidence.

realistic outcome is usually a partial refund rather than full. upwork mediates more than arbitrates. worth doing even if you don't get everything back, because it also signals to the freelancer that billing doesn't happen without accountability."""
    },
    {
        "id": 10,
        "thread_url": "https://www.reddit.com/r/Upwork/comments/1s05s6m/",
        "thread_title": "Are fixed rate or hourly jobs better?",
        "text": """depends a lot on how clearly scoped the work is tbh

hourly is better when: requirements are unclear, scope tends to change, or you're doing research/exploratory stuff. you're protected if things run long.

fixed is better when: you've done this exact work many times and know how long it takes. quote confidently, finish efficiently, profit.

the upwork-specific thing to know: clients can dispute hourly logged time even with tracker evidence, which creates headaches. fixed eliminates that entirely for clearly scoped work.

if you're newer to upwork i'd lean toward fixed just to avoid the dispute risk while building your reputation. you control the timeline and there's less friction."""
    },
]


def post_comment(page, comment):
    """Navigate to thread and post a comment. Returns the comment URL or raises."""
    print(f"\n--- Comment {comment['id']}: {comment['thread_title'][:60]}...")

    page.goto(comment['thread_url'], wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # Try to find comment input — Reddit new UI uses contenteditable
    selectors_to_try = [
        '[data-testid="comment-submission-form-richtext"] div[contenteditable="true"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        '.notranslate[contenteditable="true"]',
        'div[contenteditable="true"]',
    ]

    comment_area = None
    for sel in selectors_to_try:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=3000):
                comment_area = el
                print(f"  Found comment area with: {sel}")
                break
        except Exception:
            continue

    if comment_area is None:
        # Try clicking "Add a comment" text first
        try:
            page.click('text="Add a comment"', timeout=3000)
            time.sleep(1)
            for sel in selectors_to_try:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=2000):
                        comment_area = el
                        break
                except Exception:
                    continue
        except Exception:
            pass

    if comment_area is None:
        raise Exception("Could not find comment input area")

    comment_area.click()
    time.sleep(0.5)
    comment_area.type(comment['text'], delay=5)
    time.sleep(1)

    # Find submit button
    submit_selectors = [
        'button:has-text("Comment")',
        'button[type="submit"]:has-text("Comment")',
        '[data-testid="comment-submission-form-submit"]',
        'button.submit',
    ]

    submitted = False
    for sel in submit_selectors:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000):
                btn.click()
                submitted = True
                print(f"  Submitted via: {sel}")
                time.sleep(4)
                break
        except Exception:
            continue

    if not submitted:
        raise Exception("Could not find submit button")

    return page.url


def login(page):
    """Log into Reddit with username/password."""
    print(f"Logging in as u/{USERNAME}...")

    page.goto("https://www.reddit.com/login/", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    # Try new reddit login form
    try:
        page.fill('#login-username', USERNAME, timeout=5000)
        page.fill('#login-password', PASSWORD, timeout=3000)
    except Exception:
        # Try older selectors
        page.fill('input[name="username"]', USERNAME, timeout=5000)
        page.fill('input[name="password"]', PASSWORD, timeout=3000)

    time.sleep(0.5)
    page.keyboard.press("Enter")
    time.sleep(5)

    # Check if login succeeded
    if "/login" in page.url:
        # Try clicking submit button explicitly
        try:
            page.click('button[type="submit"]', timeout=3000)
            time.sleep(4)
        except Exception:
            pass

    if "/login" in page.url:
        raise Exception(f"Login failed — still on login page: {page.url}")

    print(f"Login OK. URL: {page.url}")


def main():
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = context.new_page()

        try:
            login(page)
        except Exception as e:
            print(f"FATAL: Login failed: {e}", file=sys.stderr)
            browser.close()
            sys.exit(1)

        for comment in COMMENTS:
            try:
                url = post_comment(page, comment)
                results.append({
                    "id": comment['id'],
                    "status": "posted",
                    "thread_url": comment['thread_url'],
                    "posted_at": datetime.utcnow().isoformat(),
                    "comment_url": url,
                })
                print(f"  ✅ Posted! URL: {url}")
                # Rate limit: pause between comments to avoid spam detection
                time.sleep(8)
            except Exception as e:
                results.append({
                    "id": comment['id'],
                    "status": "failed",
                    "thread_url": comment['thread_url'],
                    "error": str(e),
                })
                print(f"  ❌ Failed: {e}")

        browser.close()

    # Print summary
    print("\n\n=== RESULTS ===")
    posted = [r for r in results if r['status'] == 'posted']
    failed = [r for r in results if r['status'] == 'failed']
    print(f"Posted: {len(posted)}/10")
    print(f"Failed: {len(failed)}/10")

    for r in results:
        status = "✅" if r['status'] == 'posted' else "❌"
        print(f"  {status} Comment {r['id']}: {r.get('comment_url', r.get('error', '?'))}")

    # Save JSON results
    results_path = "/Users/manaswimarri/lattice-workspace/proposallock/scripts/reddit-comment-results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {results_path}")

    return 0 if len(failed) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
