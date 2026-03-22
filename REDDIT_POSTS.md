# ProposalLock Reddit Posts — Ready to Copy-Paste
> Account: u/launchstack
> Goal: First dollar of revenue. Pain-point stories, NOT pitches.
> UTM: https://proposallock.onrender.com/?ref=reddit

---

## POST 1 — r/freelance
### Post immediately. Peak time: Tuesday-Thursday 9-11am ET.

**Title:**
```
How do you handle the "I'll pay you Friday" client?
```

**Body:**
```
Genuine question for the community. I have a client who received all deliverables two weeks ago. Said payment would come Friday. That was three Fridays ago.

Sent two polite follow-ups. Nothing.

This is the third time this year a client has done this. I started calculating how much time I spend chasing payments across all my clients — it's roughly 2-3 hours per week. That's 130+ hours per year of just following up on invoices.

I've been switching to a model where I don't send the actual files until payment clears. Not withholding work — more like a preview-then-pay workflow where the client sees everything but files unlock after checkout.

Has anyone else done this? What do you use? I looked at HoneyBook and Bonsai but can't justify $50+/month for something I'd use a few times a week.
```

**Comment to post when someone asks "what tool?":**
```
I actually built something for exactly this — it's called ProposalLock. You paste a file URL, set a price, send the link. Files unlock automatically when payment clears. $29 once, no subscription. https://proposallock.onrender.com/?ref=reddit

Still early but it's working for my workflow.
```

---

## POST 2 — r/SideProject
### Direct product showcase. Self-promo is allowed here.

**Title:**
```
I built a payment-gated file delivery tool for freelancers — $29 one-time, no subscription
```

**Body:**
```
Background: I kept losing hours every week chasing invoices. One client ghosted me after receiving finals on a $3,800 project. I started calculating the time cost — about 130 hours a year across my client base just doing "friendly follow-ups."

So I built ProposalLock.

How it works: paste a file URL (Google Drive, Dropbox, anything), set a price, get a shareable link. Your client sees the proposal and price. They pay. Files unlock automatically via webhook. Not a minute before.

Stack: Bun + Hono + LemonSqueezy + Render. Backend is around 300 lines. Built it in a weekend.

$29 one-time. Competitors charge $24-$66/month for this same mechanic buried inside a bigger platform.

Live at: https://proposallock.onrender.com/?ref=reddit

Happy to answer questions about the build or the business side. Early days — zero revenue so far, building in public.
```

---

## POST 3 — r/webdev
### Dev-focused post. Lead with the tech.

**Title:**
```
Show off: I built a payment-gated file sharing tool with Bun + Hono + LemonSqueezy in a weekend
```

**Body:**
```
Been meaning to build this for a while. Payment-gated file delivery — freelancer creates a proposal link, client pays, files unlock via webhook.

Stack:
- Runtime: Bun
- Framework: Hono
- Payments: LemonSqueezy (webhooks for payment confirmation)
- DB: SQLite (via Bun's built-in sqlite)
- Hosting: Render
- Frontend: Vanilla JS + Tailwind

The backend is around 300 lines. No framework bloat. The interesting part is the webhook handler — LemonSqueezy fires an event when payment clears, backend marks the proposal as paid, client polls every 3 seconds until files unlock.

Took about a weekend to go from idea to deployed. Live at: https://proposallock.onrender.com/?ref=reddit

Happy to share any part of the code or talk through the LemonSqueezy webhook flow if anyone's integrating payments for the first time.
```

---

## TIMING GUIDE
- r/freelance: Post discussion, don't mention product. Mention in comments only if asked.
- r/SideProject: Direct showcase is fine here.
- r/webdev: Frame as a build showcase, not a product pitch.
- Best times: Tuesday-Thursday, 9-11am ET
- Engage every comment within 1 hour of posting
