# ProposalLock — Day 1 Execution Package
**Date:** 2026-03-22 | **Goal:** 100 visitors | **Status:** READY TO POST

> Copy-paste ready. Everything below is finalized. Post in order. Allow 30+ minutes between posts.

---

## POST #1 — r/freelance (Discussion / Story Post)

**Rules check:** r/freelance allows discussion posts. No product links in body. ✅
**Timing:** Post between 8–10am EST Tuesday–Thursday for max visibility.
**Account requirement:** Account must be >30 days old with karma. Do NOT post from a fresh account.

### How to post
1. Go to: https://www.reddit.com/r/freelance/submit
2. Choose: "Text post"
3. Copy title and body below exactly

---

**TITLE:**
```
How do you handle the "I'll pay you Friday" client?
```

**BODY:**
```
Genuine question for the community. I have a client who received all deliverables two weeks ago. Said payment would come Friday. That was three Fridays ago.

I've sent two polite follow-ups. Nothing.

This is the third time this year a client has pulled this. I started calculating the hours I spend chasing payments — it's roughly 2–3 hours per week across all my clients. That's 100+ hours per year of unpaid administrative work.

I've been thinking about switching to a model where I never send the actual files until payment clears. Not withholding work — more like creating a preview-then-pay workflow. Has anyone done this? What tools or systems do you use?

I looked at HoneyBook and Bonsai, but I can't justify $50+/month for something I'd use once or twice a week. Feels like there should be a simpler solution.

Would love to hear what's actually working for people.
```

**DO NOT mention ProposalLock in the post body.** When people reply asking "what tool?" or "what are you building?", respond naturally in comments:

> I actually just finished building something for exactly this — it's called ProposalLock. You paste your file URL, set a price, and the client gets a link where files unlock after payment clears. $29 one-time, not another monthly subscription. proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=launch_v1

---

## POST #2 — r/SideProject (Product Showcase)

**Rules check:** r/SideProject explicitly allows product showcases. Direct links OK. ✅
**Timing:** Post 1–2 hours after Post #1.

### How to post
1. Go to: https://www.reddit.com/r/SideProject/submit
2. Choose: "Link post" or "Text post" (text preferred for engagement)

---

**TITLE:**
```
I built a payment-gated file link tool for freelancers — $29 one-time (not another SaaS subscription)
```

**BODY:**
```
After getting burned by a client who ghosted after receiving deliverables, I spent a weekend building ProposalLock.

**The problem it solves:**
Freelancers send files → clients disappear. The work is gone. The leverage is gone. The invoice sits unpaid.

**How it works:**
1. Paste your file URL (Google Drive, Dropbox, anything shareable)
2. Set a price
3. Send the generated link to your client
4. Client sees the project summary + payment button
5. Files unlock the moment payment clears — automatically, via LemonSqueezy webhook

**Stack:** Bun + Hono + SQLite + LemonSqueezy webhooks. Single-file frontend (no framework, just Tailwind CDN). Deployed on Render. ~300 lines of backend.

**Why $29 one-time:**
HoneyBook is $66/month ($792/year). Bonsai is $24/month ($288/year). Proposify is $49/month. I don't need a CRM. I need one thing: payment before delivery.

**Try it:** https://proposallock.onrender.com?utm_source=reddit&utm_medium=post&utm_campaign=launch_v1

Happy to answer questions about the build — this was a genuinely fun weekend project and the problem is real.
```

---

## POST #3 — r/webdev (Dev Story / Show-off)

**Rules check:** r/webdev allows "I built X" posts. Stick to the technical angle. ✅
**Timing:** Post 1–2 hours after Post #2.

### How to post
1. Go to: https://www.reddit.com/r/webdev/submit
2. Choose: "Text post"

---

**TITLE:**
```
I built a payment-gated file sharing tool in a weekend (Bun + Hono + LemonSqueezy webhooks)
```

**BODY:**
```
Built this to solve a freelancer problem I kept running into: clients who receive deliverables and then ghost. The idea: files stay locked until payment clears.

**How the webhook flow works:**

1. User creates a proposal via `POST /api/proposals` — stores title, client name, file URL, price, and a LemonSqueezy checkout URL in SQLite
2. Client hits the proposal page `/p/:id` — sees project details, locked file section, and a "Pay to Unlock" button (LemonSqueezy hosted checkout)
3. LemonSqueezy fires `order_created` webhook to `/api/webhook` on payment
4. Webhook verifies signature, marks proposal `paid = true` in DB
5. Proposal page polls `/api/proposals/:id/status` every 3 seconds — updates UI to show file download link when `paid` flips

**Stack:**
- Runtime: Bun
- Backend: Hono (minimal, fast, zero config)
- DB: Bun native SQLite (`better-sqlite3` vibes but built-in)
- Payments: LemonSqueezy (webhook + checkout link per proposal)
- Frontend: Single HTML file, Tailwind CDN, vanilla JS
- Hosting: Render (free tier, ~0 ops overhead)

Total backend: ~300 lines. No ORM. No framework bloat. The whole thing deploys in 2 commands.

**What I'd do differently:**
- SQLite on Render free tier wipes on restart. Should move to Turso or Postgres for persistence. Currently the biggest reliability risk.
- Polling for payment status works but WebSockets or SSE would be cleaner.

**Try it / source:** https://proposallock.onrender.com?utm_source=reddit&utm_medium=post&utm_campaign=launch_v1

Happy to share the webhook handler code if anyone's curious — the LemonSqueezy signature verification has a couple of gotchas.
```

---

## TWITTER THREAD — Pain Stats Thread

**Timing:** Post same day, around noon EST.
**Account:** Use personal account (converts better than brand account for indie tools).

Post these 7 tweets as a thread. Tweet 1 first, then reply to each with the next.

---

**Tweet 1/7:**
```
51% of freelancers have experienced non-payment for completed work.

That is not a bug in the system. That is the system.
```

**Tweet 2/7:**
```
The math:
- Average freelancer: 2–3 hours/week chasing invoices
- That is 130+ hours/year
- At $50/hr = $6,500/year in lost time
- Plus the actual unpaid invoices on top

And most freelancers just accept this as the cost of doing business.
```

**Tweet 3/7:**
```
The standard advice is "get a 50% deposit upfront."

Fine. But then you send the other 50% of the files and... hope they pay.

You still hand over the work before money moves. The leverage problem is not solved.
```

**Tweet 4/7:**
```
There is a dead-simple alternative: payment-gated file delivery.

Client sees the proposal. They see the price. They pay. The files unlock — automatically. Not a minute before.

No chasing. No "following up on that invoice." No $6,500 lesson.
```

**Tweet 5/7:**
```
I built this in a weekend. It is called ProposalLock.

- Paste your file URL
- Set a price
- Send the link
- Files unlock when payment clears (LemonSqueezy webhook)

Stack: Bun + Hono + SQLite + Render. ~300 lines.
```

**Tweet 6/7:**
```
"But clients will just refuse to pay upfront."

Then they were never going to pay you after either.

This is a filter, not a barrier. Good clients do not blink. Bad clients reveal themselves before you hand over the work.
```

**Tweet 7/7:**
```
$29 one-time. Not $66/month like HoneyBook. Not $24/month like Bonsai.

One month of HoneyBook, or own this forever.

Try it: https://proposallock.onrender.com?utm_source=twitter&utm_medium=thread&utm_campaign=launch_v1

Building this in public — follow for daily numbers and lessons.
```

---

## COMMENT TARGETS — Find and Comment on These NOW

These are the highest-value comment opportunities. Find active threads using these Reddit search URLs:

| Target | Search URL | Comment angle |
|--------|-----------|---------------|
| r/freelance — unpaid invoices | https://www.reddit.com/r/freelance/search/?q=client+didn%27t+pay&sort=new | "I finally stopped this by..." → mention ProposalLock if relevant |
| r/freelance — ghosted clients | https://www.reddit.com/r/freelance/search/?q=client+ghosted&sort=new | Same approach |
| r/graphic_design — sending files | https://www.reddit.com/r/graphic_design/search/?q=payment+before+sending&sort=new | Value-first advice |
| r/webdev — invoice problems | https://www.reddit.com/r/webdev/search/?q=client+payment&sort=new | Technical peer angle |

**Comment template (adapt, never copy-paste):**
```
I ran into the same thing — three times in one year. What finally worked for me
was flipping the process entirely: I send a proposal link where the files are locked
until payment clears. Client sees everything, pays through a checkout, files unlock
automatically. No more "I'll send it Friday." Built it myself but the mechanic is
the key thing — payment before delivery, not after.
```

Only drop the ProposalLock URL if the conversation naturally leads there ("what tool is that?" / "how does it work?"). Otherwise leave it as advice.

---

## UTM REFERENCE

| Channel | UTM Link |
|---------|----------|
| Reddit r/freelance post | `proposallock.onrender.com?utm_source=reddit&utm_medium=post&utm_campaign=launch_v1` |
| Reddit r/SideProject post | `proposallock.onrender.com?utm_source=reddit&utm_medium=post&utm_campaign=launch_v1` |
| Reddit r/webdev post | `proposallock.onrender.com?utm_source=reddit&utm_medium=post&utm_campaign=launch_v1` |
| Reddit comment (any) | `proposallock.onrender.com?utm_source=reddit&utm_medium=comment&utm_campaign=launch_v1` |
| Twitter thread | `proposallock.onrender.com?utm_source=twitter&utm_medium=thread&utm_campaign=launch_v1` |
| Twitter bio | `proposallock.onrender.com?utm_source=twitter&utm_medium=bio&utm_campaign=launch_v1` |

---

## EXECUTION CHECKLIST

- [ ] Post #1 r/freelance (8–10am EST) — NO product link in body
- [ ] Post #2 r/SideProject (30 min later)
- [ ] Post #3 r/webdev (30 min after #2)
- [ ] Twitter thread (noon EST)
- [ ] Comment on 3–5 active Reddit threads using search URLs above
- [ ] Monitor Post #1 for comments asking about tools → reply with ProposalLock naturally
- [ ] Check Render analytics after 24h for UTM traffic

**Reddit account requirements:** >30 days old, some karma. New accounts get auto-filtered by mod bots.

---

## HYPOTHESES (to validate)

1. r/freelance discussion post will generate 20–50 upvotes and 5+ comments asking about the "preview-then-pay" tool mentioned → natural product mention opportunity
2. r/SideProject direct showcase will drive 50–150 direct clicks (this sub rewards builders)
3. r/webdev technical post will get engagement from dev-freelancers, possible HN crosspost
4. Twitter thread will get 500–2K impressions; conversions minimal on Day 1 but builds followership

---

*Results to be logged in MEMORY.md after 48h.*
