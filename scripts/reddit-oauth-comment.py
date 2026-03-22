#!/usr/bin/env python3
"""
reddit-oauth-comment.py — Post comments to Reddit via OAuth2 (praw).
Requires: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD

Posts all pending comments from REDDIT_KARMA_LOG.md batches.

Usage:
  export REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=xxx
  python3 proposallock/scripts/reddit-oauth-comment.py [--batch 1] [--dry-run]
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

# Credential check is deferred to post_all() so --dry-run works without OAuth creds

# All pending comments — batches 1 and 2
COMMENTS = {
    1: [
        {
            "id": 1, "submission_id": "1rirozj", "subreddit": "freelance",
            "title": "Client wants to switch from daily billing to hourly billing after receiving invoice",
            "text": """honestly this is a contract renegotiation attempt, plain and simple. she's saying "this could have been done faster" which is basically asking you to take the hit for being efficient.

don't switch to hourly for this invoice. you cleared your schedule daily to be available whenever she needed — that availability IS the value you're billing for. hourly would be a pay cut for doing the same work.

push back politely but firmly: the daily rate was agreed to and reflects your availability commitment. if she wants hourly going forward that's a new agreement with a different scope. but this invoice is for work already done under the agreed terms. don't rewrite the past because she's uncomfortable with the total."""
        },
        {
            "id": 2, "submission_id": "1qqtkoh", "subreddit": "freelance",
            "title": "Looking for advice after a payment dispute with a client",
            "text": """damn that sucks and the "using it publicly while not paying" part is actually your leverage here

document everything right now. screenshot every social post where your content is live. that's your evidence if this escalates.

practically: send one firm final email with a specific date. "payment due by [date], after which i will pursue this through [small claims/collections]." vague threats don't work, specific deadlines do.

in a lot of jurisdictions, using delivered work without paying is a clean breach of contract case. worth a free 30min lawyer consult just to know your options. you have more leverage than it feels like right now."""
        },
        {
            "id": 3, "submission_id": "1rgk3zv", "subreddit": "freelance",
            "title": "Just lost my biggest client",
            "text": """this always stings more than it probably should because it's not just money, it's the predictability. knowing that amount is coming every month changes how you think about everything else.

what type of work were you doing for them? genuinely asking because sometimes the best move is taking the exact same service to competitors in the same industry. they already validated there's demand, you have proof of work, and competing firms often have the same pain. you have more to offer than it feels like right now."""
        },
        {
            "id": 4, "submission_id": "1r8h6ng", "subreddit": "freelance",
            "title": "Client pausing project without telling me — normal for contract work?",
            "text": """fwiw this is really common with institutional clients, universities especially. budget cycles, grant timelines, internal politics... any of those can pause a program without warning and the vendor won't always pass the info down to subcontractors.

the real issue is the vendor didn't communicate the uncertainty so you could plan around it. that's on them not on the university.

going forward: ask vendors explicitly about project runway before you assume continuity. "is this funded for the year or quarterly?" is a totally reasonable question and the answer tells you a lot about how much you can count on the work."""
        },
        {
            "id": 5, "submission_id": "1re9ttz", "subreddit": "freelance",
            "title": "Client expects employee-like behavior",
            "text": """the fact that they pay well makes it complicated but you're essentially doing employment without job security, benefits, or legal protections

honestly i'd look at this as a scope problem. if you haven't spelled out communication expectations in your contract, now's the time. "i respond to messages within X hours, M-F. calls by appointment only." is completely reasonable to add.

some clients genuinely don't understand the difference between a contractor and an employee. framing it as "here's how i work" rather than "stop calling so much" tends to land a lot better. and if they push back after you've set clear terms, that tells you something important about whether this client is actually worth keeping."""
        },
        {
            "id": 6, "submission_id": "1qt09my", "subreddit": "freelance",
            "title": "Subcontractor dealing with end-client pressure, help!",
            "text": """the classic subcontract trap: you're accountable to the end client's expectations but you don't have a direct relationship to actually manage them.

the agency is supposed to be your buffer here. push everything up through them, explicitly: "i need X resources/feedback to deliver on scope, i've asked Y times, please escalate." put it all in writing.

on the "communication issue" flag: ask the agency for specifics in writing immediately. vague feedback like that is often a precursor to withholding payment and blaming quality. protect yourself now while there's still a paper trail to build."""
        },
        {
            "id": 7, "submission_id": "1rz1jrf", "subreddit": "Upwork",
            "title": "The client was supposed to pay me $30, but only paid $15",
            "text": """first thing to check: was the second milestone actually funded? if they never funded it, upwork can't enforce collection on that $15.

if it was funded: go to the resolution center and open a dispute. the fact that they asked for a redo AND you redid it is documented in the chat, which is exactly the kind of evidence upwork looks at.

others are right that this is a hard lesson about minimum job sizes. the time you've already spent chasing this probably exceeds the $15. but you can still file the dispute, it's worth doing just so the client gets a mark on their account."""
        },
        {
            "id": 8, "submission_id": "1rzijqu", "subreddit": "Upwork",
            "title": "Shouldn't upwork refund you the connects a job a client has abandoned",
            "text": """100% agree it's frustrating, and the cynical answer is that upwork profits whether the job gets filled or not so there's genuinely no incentive for them to close abandoned listings.

practical workaround i use: before spending connects, check the client's response rate on their profile and when they were last active. clients with <50% response rate or who haven't logged in for days are basically abandoned listings already. not a perfect filter but cuts down on wasted connects.

some people only bid on jobs posted in the last few hours for exactly this reason. older jobs have much lower response rates regardless of whether they're technically "open.\""""
        },
        {
            "id": 9, "submission_id": "1rzx1s1", "subreddit": "Upwork",
            "title": "[Client perspective] How do you successfully dispute hours on Upwork?",
            "text": """the dispute process is honestly underwhelming from a client side. if the tracker shows keyboard/mouse activity, upwork's default is to lean toward the freelancer.

that said: go to the resolution center, open a formal dispute, and be very specific. "job was scoped as X with Y expected output. freelancer logged 4 hours and delivered Z which is unusable." screenshots of the job post + whatever deliverable you got = your evidence.

realistic outcome is usually a partial refund rather than full. upwork mediates more than arbitrates. worth doing even if you don't get everything back, because it also signals to the freelancer that billing doesn't happen without accountability."""
        },
        {
            "id": 10, "submission_id": "1s05s6m", "subreddit": "Upwork",
            "title": "Are fixed rate or hourly jobs better?",
            "text": """depends a lot on how clearly scoped the work is tbh

hourly is better when: requirements are unclear, scope tends to change, or you're doing research/exploratory stuff. you're protected if things run long.

fixed is better when: you've done this exact work many times and know how long it takes. quote confidently, finish efficiently, profit.

the upwork-specific thing to know: clients can dispute hourly logged time even with tracker evidence, which creates headaches. fixed eliminates that entirely for clearly scoped work.

if you're newer to upwork i'd lean toward fixed just to avoid the dispute risk while building your reputation. you control the timeline and there's less friction."""
        },
    ],
    2: [
        {
            "id": 11, "submission_id": "1ra3gis", "subreddit": "freelance",
            "title": "Just got my first client!",
            "text": """congrats!! $200/month for 5 hours of work is actually a really solid start — that's $40/hr and you haven't even raised rates yet

the best part about research/analytics is that it compounds. once you know a client's data, their questions, their industry... you get faster and your work gets better. that's how $200 clients become $600 clients.

go enjoy this. you earned it."""
        },
        {
            "id": 12, "submission_id": "1ra6xyf", "subreddit": "freelance",
            "title": "Anyone else completely paralyzed by client outreach?",
            "text": """yeah this is super common and i don't think it ever fully goes away, you just get better at tolerating the discomfort

what helped me: stop thinking of outreach as selling yourself. you're just having a conversation to figure out if there's a fit. most of the time there isn't, and that's not rejection, it's information.

also the "terrified of sounding incompetent to someone who knows their industry better" thing — that's actually backwards. they know their industry, you know how to solve a specific problem. that's complementary, not competing. you don't need to know their industry as well as they do.

start with warm intro if you can (even a comment on their linkedin post is warmer than cold). once you've had 10 of these conversations you'll stop overthinking the 11th."""
        },
        {
            "id": 13, "submission_id": "1rliif2", "subreddit": "freelance",
            "title": "Every time I ask about getting clients, people recommend SaaS tools — are they actually reliable?",
            "text": """skepticism is warranted honestly. most of those "automated outreach" tools are basically cold email at scale, and they work about as well as cold email — which is not great for building relationships, only volume.

the ones that are actually worth it are tools that save you time on delivery/admin (invoicing, contracts, file sharing, client portals) not ones that promise to find clients for you. demand generation is still a human skill.

fwiw the best client sources i've found: past clients (referrals), communities where your target clients hang out, and inbound from content. none of those require a SaaS subscription."""
        },
        {
            "id": 14, "submission_id": "1qpbw3v", "subreddit": "freelance",
            "title": "Do you keep clients on a small monthly retainer?",
            "text": """retainers changed everything for me. irregular project work is exhausting to manage — you're always in feast or famine, always context-switching.

the model i use: retainer covers X hours/month of availability. any work above that is billed separately at my normal rate. client gets predictability (they know i'm available), i get predictability (steady baseline income).

the key thing to get right: define what the retainer covers. "ongoing support" is too vague and leads to scope creep. "up to 10 hours/month of development and bug fixes, response within 24 hours" is specific enough to hold the line.

if you have clients who come back repeatedly for irregular work, they're already retainer candidates. just ask."""
        },
        {
            "id": 15, "submission_id": "1s06mgr", "subreddit": "Upwork",
            "title": "How I went from $300 projects to $5K+ contracts on Upwork by changing 3 things",
            "text": """the specialization point is really underrated and i think most people who are "stuck" in low rates are generalists without realizing it

"motion designer available for any project" vs "explainer videos for B2B SaaS" — these are completely different positioning even though the underlying skill is the same. the second one makes it obvious why you're worth more.

the portfolio point is also key. one great case study ("i helped X company increase trial signups by showing how the product works") beats 20 generic samples. clients at $5K+ are buying confidence, not just capability."""
        },
        {
            "id": 16, "submission_id": "1s02zwu", "subreddit": "Upwork",
            "title": "My client is forcing me to sign an abusive NDA for work outside the contract.",
            "text": """"abusive" is doing a lot of work here and it matters what's actually in it

NDAs for AI consulting work are pretty common and often reasonable — especially if they're sharing proprietary workflows, training data, or internal processes. the fact that she needs to share sensitive info to continue the work makes the NDA request make sense.

read it carefully before deciding it's abusive. things that are actually red flags: non-competes that prevent you from working in your field, IP assignment clauses that give her your prior work or general methods, unlimited duration with no carve-outs.

if you want to keep the contract: counter-propose. "i'm willing to sign an NDA covering [specific info shared during this engagement] but not [the problematic clause]." most reasonable clients will negotiate. if she won't budge at all on a genuinely one-sided agreement, that tells you something about how she'll act if there's a payment dispute later."""
        },
        {
            "id": 17, "submission_id": "1rzy6po", "subreddit": "Upwork",
            "title": "Burning Up Upwork Connects & My Savings — Need Advice!",
            "text": """healthcare scheduling + patient support is actually a real niche, don't undervalue it — there are a ton of healthcare adjacent businesses (telehealth startups, medical practices, health coaching) that need exactly this

the problem is probably the proposals not the niche. most people write proposals that describe their experience. the ones that get replies describe the client's problem and show they've thought about the solution. "i've done US healthcare scheduling for 3 years" vs "i noticed your job post mentions you need coverage across time zones — here's how i've handled that before" are two very different things.

also: are you filtering for recently-posted jobs? anything more than 48h old has usually already been screened. save your connects for fresh posts.

you've got real skills for a real market. don't give up yet."""
        },
        {
            "id": 18, "submission_id": "1rzuugt", "subreddit": "Upwork",
            "title": "Are clients more likely to hire freelancers they've invited?",
            "text": """yes, pretty significantly. an invite basically means the client already pre-screened you before the conversation started. they're already warm.

the way to get more invites: optimize your profile for the right keywords (title and first 200 chars of overview matter most), get your JSS above 90%, and be active. upwork shows active freelancers to clients who are browsing.

also worth noting: when you DO get invited, your proposal doesn't need to be as hard-working. the client already likes you. keep it short, confirm you understand the work, and ask one smart clarifying question. long pitches at this point can actually hurt."""
        },
        {
            "id": 19, "submission_id": "1rzyikg", "subreddit": "Upwork",
            "title": "Where do I download the invoices?",
            "text": """go to Reports > Transaction History in your Upwork account, then filter by date range. there's a download button that exports as CSV.

if you need formatted invoices rather than the raw transaction data: Settings > Billing > Transaction History > Download Invoice PDF. it's weirdly buried."""
        },
        {
            "id": 20, "submission_id": "1qtzknv", "subreddit": "freelance",
            "title": "What I learned running a specialized service business for 4 months (finding clients)",
            "text": """the "niche down and go deep" lesson is one of those things that sounds obvious but takes most people months of doing it wrong first before it clicks

the part that surprised me: specializing actually makes cold outreach easier, not just inbound. when you're a generalist you have to explain what you do and why it matters every time. when you're "the person who does X for Y type of company" the relevance is self-evident. conversations start at a different place.

what service are you running, if you don't mind sharing? curious what the niche ended up being."""
        },
    ]
}


def post_all(batch=None, dry_run=False):
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
            print("See vault/Intelligence/Playbooks/REDDIT_OAUTH_SETUP.md for setup", file=sys.stderr)
            sys.exit(1)
        reddit = praw.Reddit(
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET,
            username=USERNAME,
            password=PASSWORD,
            user_agent=f"launchstack-bot/1.0 by {USERNAME}",
        )
        # Verify auth
        me = reddit.user.me()
        print(f"Authenticated as: u/{me.name} | Karma: {me.comment_karma}")

    batches_to_run = [batch] if batch else [1, 2]
    results = []

    for b in batches_to_run:
        print(f"\n=== Batch {b} ({len(COMMENTS[b])} comments) ===")
        for c in COMMENTS[b]:
            print(f"\nComment {c['id']}: r/{c['subreddit']}/comments/{c['submission_id']}")
            print(f"  Title: {c['title'][:60]}...")

            if dry_run:
                preview = c['text'][:120].replace('\n', ' ')
                print(f"  [DRY RUN] Would post: {preview}...")
                results.append({"id": c['id'], "status": "dry_run", "subreddit": c['subreddit'], "submission_id": c['submission_id']})
                continue

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
                time.sleep(10)  # Rate limit: Reddit enforces ~6s between comment submissions
            except Exception as e:
                print(f"  ❌ Failed: {e}")
                results.append({"id": c['id'], "status": "failed", "error": str(e)})

    # Summary
    posted = [r for r in results if r['status'] == 'posted']
    failed = [r for r in results if r['status'] == 'failed']
    total = len(results)

    print(f"\n=== RESULTS ===")
    print(f"Posted: {len(posted)}/{total}")
    if failed:
        print(f"Failed: {len(failed)}/{total}")
        for r in failed:
            print(f"  Comment {r['id']}: {r.get('error')}")

    # Save results
    out_path = "/Users/manaswimarri/lattice-workspace/proposallock/scripts/reddit-comment-results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {out_path}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, choices=[1, 2], help="Run only batch 1 or 2")
    parser.add_argument("--dry-run", action="store_true", help="Print comments without posting")
    args = parser.parse_args()

    post_all(batch=args.batch, dry_run=args.dry_run)
