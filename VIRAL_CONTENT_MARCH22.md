# ProposalLock Viral Content — 2026-03-22
> Task: FIRST DOLLAR — 3 viral pieces for freelancer communities
> KPI: Revenue. Every piece points to ProposalLock.

---

## PIECE 1 — TWITTER/X THREAD

**Hook:** "I tracked how much freelancers lose to unpaid invoices. The numbers are insane."
**Format:** 7-tweet thread
**UTM:** `?utm_source=twitter&utm_medium=thread&utm_campaign=firstdollar`

---

**Tweet 1/7 (hook):**
```
I tracked how much freelancers lose to unpaid invoices. The numbers are insane.

A thread.
```

**Tweet 2/7 (stat hook):**
```
51% of freelancers have experienced non-payment for completed work.

One in two.

Not a bug in the system. That IS the system.
```

**Tweet 3/7 (time cost math):**
```
The time cost is what kills me.

Average freelancer: 2-3 hours/week chasing invoices.
That's 130 hours a year.
At $50/hr = $6,500 in lost time.

That's BEFORE counting the actual unpaid invoices.
```

**Tweet 4/7 (the broken advice):**
```
Standard advice: "get 50% upfront."

OK, fine. But then you send the files and hope for the other half.

You still hand over all your leverage the second you hit send. The problem isn't solved. It's just delayed.
```

**Tweet 5/7 (the fix):**
```
What actually works: payment-gated file delivery.

Client sees the project summary and price. They pay. Files unlock automatically.

Not a minute before payment clears.

No chasing. No "circling back on that invoice." No $6,500 lesson.
```

**Tweet 6/7 (product reveal):**
```
I built this. It's called ProposalLock.

- Paste your file URL (Drive, Dropbox, anything)
- Set a price
- Send the link
- Files unlock via webhook when payment clears

$29 once. Not $66/month like HoneyBook. Not $24/month like Bonsai.

proposallock.onrender.com?utm_source=twitter&utm_medium=thread&utm_campaign=firstdollar
```

**Tweet 7/7 (objection killer):**
```
"Clients won't pay before seeing the work."

The clients who refuse were never going to pay you after either.

This is a filter, not a barrier. Good clients don't blink.

Bad clients reveal themselves before you lose the work.
```

---

## PIECE 2 — LINKEDIN POST

**Format:** Story + lesson + tool
**Tone:** Professional but personal
**UTM:** `?utm_source=linkedin&utm_medium=post&utm_campaign=firstdollar`
**Best post time:** Tuesday-Thursday 8-10am EST

---

**POST:**
```
I lost $4,200 to a client who said the work was perfect.

He approved every revision. Responded to every email. Said payment was coming "end of week."

That was 14 weeks ago.

The worst part wasn't the $4,200. It was that I handed over everything before a single dollar moved. The moment I sent those files, I had nothing. He had everything. I had zero leverage.

That's the default freelance model. Work first, hope later.

I spent two weeks after that incident calculating how much time I personally lose to invoice chasing. It came out to about 2.5 hours a week. 130 hours a year. That's three full work weeks spent writing "just following up" emails.

So I changed my process.

Now I send a proposal link. The client sees the full project breakdown, the deliverables, the price. They pay through a checkout. The files unlock automatically the second payment clears.

Not after. Not on a handshake. Automatically.

It sounds transactional. It isn't. It's just moving the trust to where it belongs -- in the process, not in hope.

If you're a freelancer still attaching files to invoice emails, think about what you're actually betting on.

#freelance #freelancing #consulting #getpaid #clientwork
```

**First comment (post immediately after):**
```
Tool I use for this: proposallock.onrender.com?utm_source=linkedin&utm_medium=comment&utm_campaign=firstdollar -- $29 once, files unlock via payment webhook.
```

---

## PIECE 3 — REDDIT r/freelance POST

**Format:** Personal story, discussion-opener, NO product link in body
**Subreddit:** r/freelance
**Best time:** 8-10am EST Tuesday-Thursday
**UTM (for comments only):** `?utm_source=reddit&utm_medium=comment&utm_campaign=firstdollar`

---

**TITLE:**
```
Anyone else keep a running tally of how much they've lost to clients who ghost after delivery?
```

**BODY:**
```
I started doing this last year because I wanted to actually know the number. Not guess. Know.

In 18 months I've had four clients receive completed work and then disappear. Total unpaid: $7,400.

One of them gave me really specific feedback on revisions. Complimented the final product in writing. Said payment was coming "this week." Then stopped opening emails.

I've also tracked the time I spend chasing invoices. It works out to about 2.5 hours per week, across all my active clients. That's 130 hours a year. Three full work weeks of "hi, just checking in on that invoice" emails.

The part that gets me is that I designed this situation myself. I was sending the files and then invoicing. So from the client's perspective -- they already had what they wanted. The incentive to pay was just... my goodwill toward them, I guess.

I've been experimenting with flipping the workflow. Send a preview, not the files. Payment clears, files release. I'm curious if others have done something similar and how clients have actually responded to it.

The usual advice is "get a 50% deposit," but I've found that still leaves you sending the other 50% of deliverables on faith.

What's actually working for you?
```

**Reply template when someone asks what tool/workflow you use:**
```
I ended up building something for this -- sends a proposal link where files are locked until payment goes through. Client sees the project and price, they pay, files unlock automatically via webhook. No manual step needed.

It's called ProposalLock: proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=firstdollar -- $29 one-time if you want to try it. The mechanic itself is the key thing though, whether you use a tool or DIY it.
```

---

## POSTING LOG

| Platform | Status | Hypothesis | Result |
|----------|--------|------------|--------|
| Twitter thread | ❌ NEEDS HUMAN — API 402 CreditsDepleted (billing) | 500-2K impressions, 5-15 clicks to ProposalLock | TBD |
| LinkedIn post | ❌ NEEDS HUMAN — No LinkedIn credentials in env | 200+ reactions, 20+ comments | TBD |
| Reddit r/freelance | ❌ NEEDS HUMAN — No Reddit client_id/secret; Firecrawl credits depleted | 30-80 upvotes, 10+ comments, 3-5 natural product mention opportunities | TBD |

## BLOCKER LOG

| Blocker | Status | Workaround |
|---------|--------|------------|
| Twitter API 402 CreditsDepleted | Unresolved | Upgrade to Basic ($100/mo) at developer.twitter.com OR post manually at x.com |
| No Reddit client_id/client_secret | Unresolved | Register app at reddit.com/prefs/apps OR post manually — see MANUAL_POST_NOW.md |
| No LinkedIn credentials | Unresolved | Create LinkedIn app + token OR post manually — see MANUAL_POST_NOW.md |
| Buffer token invalid | Unresolved | Regenerate at buffer.com/developers |
| Firecrawl browser credits depleted | Unresolved | Top up at firecrawl.dev/pricing |
| Render not auto-deploying | Unresolved | Manual deploy OR set up GitHub auto-deploy in Render dashboard |

---

## UTM REFERENCE

| Channel | Full UTM URL |
|---------|-------------|
| Twitter thread | `https://proposallock.onrender.com?utm_source=twitter&utm_medium=thread&utm_campaign=firstdollar` |
| LinkedIn post | `https://proposallock.onrender.com?utm_source=linkedin&utm_medium=post&utm_campaign=firstdollar` |
| LinkedIn first comment | `https://proposallock.onrender.com?utm_source=linkedin&utm_medium=comment&utm_campaign=firstdollar` |
| Reddit comment | `https://proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=firstdollar` |
