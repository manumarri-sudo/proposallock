# ProposalLock Launch Plan -- Aggressive Revenue Generation

**Product:** ProposalLock -- payment-gated proposal links for freelancers
**Price:** $29 one-time purchase
**Date:** 2026-03-21
**Goal:** First revenue within 7 days. $1,000 MRR-equivalent within 30 days.

---

## EXECUTIVE SUMMARY

ProposalLock sits at the intersection of a massive pain point (51% of freelancers have experienced non-payment -- Statista 2023) and a pricing gap (competitors charge $24-$79/month; we charge $29 once). The 59M+ freelancer market in the US alone provides enormous top-of-funnel. The strategy: weaponize the pain narrative across communities where freelancers already vent about non-payment, convert with aggressive price anchoring against monthly SaaS, and build viral mechanics into the product itself.

**Critical Pre-Launch Blockers (from gap analysis):**
Before spending a dollar on marketing, these P0 issues MUST be resolved or they will kill conversion and trust:
1. DB persistence (SQLite wipes on Render restart -- paid users lose access)
2. Privacy Policy + Terms of Service (LemonSqueezy merchant requirement)
3. Freelancer dashboard / email collection (proposals lost when browser closes)
4. Payment notification when client pays

If these are not fixed, do NOT launch. Fix them first. The marketing plan below assumes they are resolved.

---

## PART 1: TOP 20 COMMUNITIES (with engagement strategy)

### Reddit (highest signal-to-noise for freelancer pain)

| # | Subreddit | Members | Why | Post Strategy |
|---|-----------|---------|-----|---------------|
| 1 | r/freelance | 520K+ | Core audience. Payment complaints are top content. | Story posts, NOT product links. "How I stopped chasing invoices" narrative. |
| 2 | r/freelanceWriters | 200K+ | Writers get ghosted constantly. High pain, low tool adoption. | "Writer's payment horror story + what I built" format. |
| 3 | r/graphic_design | 700K+ | Designers send deliverables before payment routinely. | Comment on payment complaint threads with value-first advice. |
| 4 | r/web_design | 500K+ | Web devs deliver files (PSDs, code) pre-payment. | "Show off what I built" thread format (allowed in many dev subs). |
| 5 | r/webdev | 2M+ | Massive audience. Side project posts get traction. | "I built a tool in a weekend" dev story format. |
| 6 | r/Upwork | 150K+ | Upwork freelancers often deal with off-platform payment issues. | Comment engagement, not direct posts (strict mod rules). |
| 7 | r/copywriting | 100K+ | Copywriters send drafts, get ghosted. | Pain-point discussion posts. |
| 8 | r/smallbusiness | 900K+ | Freelancers who identify as business owners. | "Business tip: never send deliverables before payment" advice post. |
| 9 | r/Entrepreneur | 2M+ | Side project / launch posts perform well. | "I launched a $29 tool, here's what happened" post-launch recap. |
| 10 | r/SideProject | 100K+ | Explicitly for showing side projects. Direct product links OK. | Product showcase post with demo link. |

### Twitter/X

| # | Channel | Why | Strategy |
|---|---------|-----|----------|
| 11 | #FreelancerLife | High-engagement hashtag for freelancer venting | Thread: "Freelancers lose $X billion/year to non-paying clients. Here's the math." |
| 12 | #BuildInPublic | Indie maker community loves $29 tools | Daily build updates, revenue screenshots, milestone posts |
| 13 | Freelancer influencer replies | Quote-tweet viral "client horror stories" | Add value ("I built something for exactly this") |

### LinkedIn

| # | Channel | Why | Strategy |
|---|---------|-----|----------|
| 14 | LinkedIn personal feed | Freelancer "horror story" posts go viral on LinkedIn | Long-form story post about the problem + solution |
| 15 | Freelancer LinkedIn Groups | Multiple groups with 50K-200K members | Weekly value posts, not sales pitches |

### Other Platforms

| # | Platform | Why | Strategy |
|---|----------|-----|----------|
| 16 | Product Hunt | Launch day spike, SEO backlink, social proof | Dedicated launch (see strategy below) |
| 17 | Indie Hackers | Solo founder community, loves micro-SaaS and one-time tools | Product page + milestone posts |
| 18 | Hacker News (Show HN) | Dev audience, loves simple tools | "Show HN: I made a payment-gated file link tool for freelancers" |
| 19 | Facebook Groups (Freelance to Freedom, Freelancers Union) | Groups with 50K-300K members, high engagement | Storytelling posts, never direct ads |
| 20 | Dev.to | Developer freelancers read dev.to | Article: "I was tired of clients ghosting invoices, so I built ProposalLock" |

---

## PART 2: WEEK 1 -- DAY BY DAY ACTION PLAN

### Day 0 (Today -- Pre-Launch Prep)

**Morning:**
- [ ] Fix P0 blockers (DB persistence, legal pages, email collection, pay notification)
- [ ] Set up simple analytics (Plausible or Umami -- privacy-friendly, freelancers care about this)
- [ ] Create LemonSqueezy coupon code: LAUNCH50 (50% off = $14.50) for first 20 buyers
- [ ] Set up a simple email capture on landing page ("Get notified when we launch" or "Join 50 freelancers who stopped chasing invoices")

**Afternoon:**
- [ ] Create Twitter/X account for ProposalLock (or use personal account -- personal converts better)
- [ ] Write 5 content pieces (templates below)
- [ ] Record a 60-second Loom demo: create proposal, send link, client pays, file unlocks
- [ ] Take 3 screenshots of the product for social posts
- [ ] Prepare Product Hunt listing (ship page, not launch yet)

### Day 1 -- Reddit Seeding (Soft Launch)

**Target:** 3 Reddit posts across different subreddits. NOT product posts. Story posts.

- [ ] Post #1: r/freelance -- "How do you handle clients who ghost after receiving deliverables?" (discussion post, no link to product yet -- just engage in comments, mention "I'm building something for this" if asked)
- [ ] Post #2: r/SideProject -- direct product showcase with Loom demo link
- [ ] Post #3: r/webdev -- "I built a payment-gated file sharing tool in a weekend. Here's the stack." (dev-focused, show the tech, link to product)
- [ ] Engage in every comment. Respond within 1 hour. Be genuinely helpful.
- [ ] Tweet thread #1: "51% of freelancers have been stiffed by a client at least once. The math is brutal..." (pain thread, CTA at the end)

### Day 2 -- LinkedIn + Twitter Blitz

- [ ] LinkedIn story post (template below) -- publish at 8AM ET Tuesday
- [ ] Twitter thread #2: "I built ProposalLock. Day 1 numbers: X visitors, Y signups. Building in public." (even if numbers are small, transparency wins)
- [ ] Reply to 10+ freelancer tweets about payment problems with genuine advice (not spammy product links)
- [ ] Post in 2 Facebook freelancer groups (story format, not sales)
- [ ] DM 5 freelancer micro-influencers on Twitter (under 10K followers -- they respond) offering free access in exchange for honest feedback

### Day 3 -- Indie Hacker + Dev.to

- [ ] Create Indie Hackers product page
- [ ] Post Indie Hackers milestone: "Just launched ProposalLock -- $29 tool for freelancers. Here's my thesis."
- [ ] Publish dev.to article: technical deep-dive on building ProposalLock (Bun + Hono + LemonSqueezy stack walkthrough)
- [ ] Continue Twitter daily update (#BuildInPublic)
- [ ] Respond to all Reddit comments from Day 1

### Day 4 -- Hacker News + Cold Outreach Start

- [ ] Submit "Show HN" post (best posted 8-9AM ET, weekday)
- [ ] Start cold email outreach (10 emails/day -- template below)
- [ ] Target: freelancers who have tweeted about payment problems in the last 30 days (search Twitter for "client didn't pay" "invoice ghosted" "chasing payment")
- [ ] Follow up on all DM conversations from Day 2

### Day 5 -- Product Hunt Prep

- [ ] Finalize Product Hunt listing: tagline, description, screenshots, Loom demo, maker comment
- [ ] Reach out to 5 Product Hunt hunters with 1000+ followers -- ask for a hunt (or self-hunt)
- [ ] Email your existing network: "I'm launching on Product Hunt next week. Would love your support."
- [ ] Post in r/ProductHunt about your upcoming launch
- [ ] Continue daily Twitter thread

### Day 6 -- Content Marketing Push

- [ ] Write and publish: "The $29 Alternative to HoneyBook for Freelancers Who Just Need Payment Protection" (SEO-optimized blog post or Medium article)
- [ ] Create a comparison table image: ProposalLock ($29 once) vs HoneyBook ($66/mo) vs Bonsai ($24/mo) vs Proposify ($49/mo) -- share on Twitter, LinkedIn, Reddit
- [ ] Record 15-second TikTok/Reel: "POV: Your client says they'll pay Friday. It's been 3 weeks." + show ProposalLock in action

### Day 7 -- Product Hunt Launch Day

**Timing:** Launch at 12:01 AM PT (Product Hunt resets daily at midnight PT). Tuesday or Wednesday is optimal -- avoid Monday (crowded) and Friday-Sunday (low traffic).

**Launch day checklist:**
- [ ] 12:01 AM PT: Go live on Product Hunt
- [ ] Immediately post maker comment with backstory, demo link, and LAUNCH50 coupon
- [ ] 6 AM ET: Send email to your list + personal network asking for upvotes + comments
- [ ] 7 AM ET: Tweet about the launch with PH link
- [ ] 8 AM ET: LinkedIn post about the launch
- [ ] 9 AM ET: Post in all relevant communities (Indie Hackers, Reddit r/SideProject, Facebook groups)
- [ ] Throughout day: Respond to EVERY Product Hunt comment within 30 minutes
- [ ] 6 PM ET: Post "Day 1 results" thread on Twitter
- [ ] Do NOT ask people to "upvote" -- ask them to "check it out and share feedback" (PH algorithm penalizes vote-begging)

---

## PART 3: WEEK 2-4 SCALING PLAN

### Week 2 -- Double Down on What Worked

- Analyze Week 1 data: which channel drove the most traffic and conversions?
- Double posting frequency on the top 2 channels
- Start AppSumo outreach (email partners@appsumo.com with pitch -- their average LTD is $39-$79, so $29 fits well)
- Launch affiliate program via LemonSqueezy (30% commission = $8.70 per sale)
- Create 3 more SEO blog posts targeting:
  - "freelance proposal template with payment"
  - "how to get clients to pay before sending files"
  - "payment protection for freelancers"
- Cold outreach: increase to 20 emails/day
- Start engaging in freelancer Discord servers (Freelance Friday, The Freelance Jungle)

### Week 3 -- Partnerships + Paid Experiment

- Partner with 3-5 freelancer newsletter authors (offer them affiliate commissions)
- Guest post on 2 freelancer blogs
- Run a small paid ads experiment:
  - **Budget:** $100 total ($50 Facebook, $50 Google)
  - **Facebook:** Target interests "freelancing" + "invoice" + "graphic design" -- expected CPC $0.84 (Business Services benchmark), so ~60 clicks for $50
  - **Google:** Target "freelance proposal tool" and "payment protection freelancer" -- expected CPC $1.50-$3.00 for low-competition long-tail, so ~20-33 clicks for $50
  - **Expected outcome:** At a 3-5% landing page conversion rate, that is 2-5 sales from paid. CPA of $20-$50. This is MARGINAL for a $29 product. Paid ads are not the primary channel at this price point -- organic + viral is.
- If CPA is above $15, STOP paid ads and redirect budget to affiliate commissions

### Week 4 -- Viral Mechanics + Referral

- Add "Powered by ProposalLock" branding to every proposal page (free viral loop -- every client who receives a proposal sees the brand)
- Implement referral program: "Give $5, Get $5" -- existing users share a referral link, new buyer gets $5 off ($24), referrer gets $5 credit toward future products
- Create a free tier: 1 proposal/month free (no payment required) to get users in the door. Paid = unlimited proposals.
- Pitch to freelancer podcast hosts (Freelance to Founder, Being Freelance, The Freelancers Show)
- Write a "30-day build log" post for Indie Hackers and Hacker News

---

## PART 4: CONTENT TEMPLATES (Ready to Post)

### Template 1: Reddit Story Post (r/freelance)

**Title:** How do you handle the "I'll pay you Friday" client?

**Body:**
Genuine question for the community. I have a client who received all deliverables two weeks ago. Said payment would come Friday. That was three Fridays ago.

I've sent two polite follow-ups. Nothing.

This is the third time this year a client has pulled this. I started calculating the hours I spend chasing payments -- it's roughly 2-3 hours per week across all my clients. That's 100+ hours per year of unpaid administrative work.

I've been thinking about switching to a model where I never send the actual files until payment clears. Not withholding work -- more like creating a preview-then-pay workflow. Has anyone done this? What tools do you use?

I looked at HoneyBook and Bonsai, but I can't justify $50+/month for something I'd use once or twice a week.

---

*[Note: This is a genuine discussion post. Do NOT mention ProposalLock in the original post. When people ask "what tool?" in comments, that is when you mention it naturally. If nobody asks, that is fine too -- the discussion itself builds awareness of the problem space.]*

### Template 2: Twitter/X Thread

**Thread:**

[1/7] 51% of freelancers have experienced non-payment for completed work.

That is not a bug in the system. That is the system.

[2/7] The math:
- Average freelancer spends 2-3 hours/week chasing invoices
- That is 130+ hours/year
- At $50/hour, that is $6,500/year in lost productive time
- Plus the actual unpaid invoices themselves

[3/7] The standard advice is "get a deposit upfront."

Great. But what about the remaining 50%? You still send files and hope they pay.

[4/7] There is a dead-simple alternative: payment-gated file delivery.

Your client sees the proposal. They see the price. They pay. The files unlock. Not a minute before.

[5/7] I built this in a weekend. It is called ProposalLock.

- Paste your file URL
- Set a price
- Send the link
- Files unlock when payment clears

$29 one-time. Not $50/month like HoneyBook.

[6/7] "But what if clients refuse to pay upfront?"

Then they were never going to pay you after either.

This is a filter, not a barrier. The good clients will not blink.

[7/7] Try it: [link]

First 20 buyers: LAUNCH50 for 50% off.

I am building this in public. Follow along for updates, revenue numbers, and lessons.

### Template 3: LinkedIn Post

Your files unlock the moment they pay.

Three weeks ago, I sent a client their final deliverables. They said payment would come Friday.

That was three Fridays ago.

I calculated how much time I spent last year chasing payments: 130+ hours. At my rate, that is over $6,000 in lost productivity.

So I built a solution. ProposalLock lets you create a single link where:
-- Your client sees the proposal and price
-- They pay through a secure checkout
-- Their files unlock instantly

No subscription. No monthly fee. $29, once, forever.

Why? Because HoneyBook charges $66/month and Bonsai charges $24/month for essentially this same mechanic, buried inside a platform you do not need.

Freelancers do not need another SaaS subscription. They need one thing: payment before delivery.

If you are a freelancer who has ever sent files and waited weeks to get paid, this is for you.

Link in comments.

### Template 4: Hacker News (Show HN)

**Title:** Show HN: ProposalLock -- Payment-gated file links for freelancers ($29, one-time)

**Body:**
Hey HN,

I built ProposalLock because I was tired of the freelancer payment cycle: do work, send files, chase invoices, repeat.

The tool is simple: paste a file URL (Google Drive, Dropbox, etc.), set a price, and get a shareable link. The client sees the proposal but files stay locked until payment clears through LemonSqueezy.

Stack: Bun + Hono + SQLite + LemonSqueezy webhooks. No framework. Single HTML frontend with Tailwind. Deployed on Render.

The entire backend is ~300 lines. I built it in a weekend.

$29 one-time, no subscription. The competitors (HoneyBook, Bonsai, Proposify) charge $24-$79/month.

Demo: [Loom link]
Try it: [link]

Would love feedback from the HN community, especially on the UX flow and whether the price anchor makes sense.

### Template 5: Dev.to Article

**Title:** I Built a Payment-Gated File Sharing Tool with Bun, Hono, and LemonSqueezy

**Body:** [Technical walkthrough of the stack -- this is a dev audience, so lead with the engineering. Include code snippets showing the webhook handler, the polling mechanism, and the SQLite schema. End with "oh, and it solves a real problem for freelancers" + link.]

---

## PART 5: EMAIL OUTREACH TEMPLATE

**Subject line:** Quick question about [their freelance specialty]

**Body:**

Hi [Name],

I saw your [tweet/post/portfolio] about [specific reference -- this must be personalized, never generic].

Quick question: how do you handle file delivery and payment with clients? Do you send deliverables before or after payment?

I ask because I built a small tool called ProposalLock that lets freelancers create payment-gated file links. Your client sees the proposal, pays through a secure checkout, and the files unlock instantly.

It is a one-time $29 purchase (not another monthly subscription).

I would genuinely love your take on whether this solves a real problem for [designers/writers/developers -- match their specialty]. Happy to give you free access if you want to try it.

No pitch beyond that. Just looking for honest feedback from working freelancers.

Best,
[Name]

**Why this works:**
- Personalized opening (proves you are not spamming)
- Asks a question (invites reply)
- Short (under 150 words)
- Offers free access (reciprocity)
- No aggressive CTA

**Volume:** 10-20 personalized emails per day. Expect 15-25% reply rate, 5-10% conversion to trial/purchase.

---

## PART 6: PRICING ANALYSIS

### Is $29 optimal?

**Evidence FOR $29:**
- Below the impulse-buy threshold for professionals ($50)
- "One month of HoneyBook, or own this forever" -- the anchor is devastating
- AppSumo LTD norm is $39-$79; being below this positions as accessible
- Gumroad trending average for similar tools: $19-$39
- At $29, you need 35 sales to hit $1,000. Achievable in 30 days with organic channels.

**Evidence AGAINST $29:**
- LTV is capped at $29. Customer acquisition cost for paid channels ($15-$25 CPA) makes paid ads nearly unprofitable.
- Gap analysis flagged: "$29 one-time LTV can't support paid acquisition." This is correct.
- No recurring revenue means no compounding. Every month requires new customers.

**Recommendation: Keep $29 for launch. Add a usage-based upgrade path by Week 4.**

Proposed pricing evolution:
- **Free:** 1 proposal/month (lead generation + viral loop)
- **Pro:** $29 one-time -- unlimited proposals (current offering)
- **Week 8+:** Consider $29/year or $5/month if retention data shows repeat usage. Test with new users only, do not change price for existing buyers.

The $29 one-time price is a weapon for launch marketing. It is the headline. It is the Reddit comment that gets upvoted. It is the tweet that gets shared. Do not dilute it during launch.

---

## PART 7: REVENUE PROJECTIONS

### Assumptions
- Landing page conversion rate: 3-5% (industry benchmark for targeted traffic to low-price tool)
- Reddit post reach: 5K-50K views per viral post
- Twitter thread reach: 1K-10K impressions per thread
- Product Hunt launch: 500-3,000 visitors
- Cold email conversion: 5-10% of replies convert

### Conservative (Things go slowly, no viral posts)

| Week | Traffic Source | Visitors | Conv. Rate | Sales | Revenue |
|------|--------------|----------|------------|-------|---------|
| 1 | Reddit + Twitter + LinkedIn | 500 | 3% | 15 | $435 |
| 2 | PH launch + continued organic | 800 | 3% | 24 | $696 |
| 3 | SEO + cold outreach + referrals | 400 | 4% | 16 | $464 |
| 4 | Affiliates + viral loop + repeat | 600 | 4% | 24 | $696 |
| **Total** | | **2,300** | | **79** | **$2,291** |

### Moderate (One Reddit post gets traction, PH top 10)

| Week | Traffic Source | Visitors | Conv. Rate | Sales | Revenue |
|------|--------------|----------|------------|-------|---------|
| 1 | Reddit viral + Twitter + LinkedIn | 2,000 | 4% | 80 | $2,320 |
| 2 | PH top 10 + HN front page | 3,000 | 3% | 90 | $2,610 |
| 3 | SEO + outreach + word of mouth | 1,500 | 4% | 60 | $1,740 |
| 4 | Affiliates + AppSumo + viral loop | 2,000 | 4% | 80 | $2,320 |
| **Total** | | **8,500** | | **310** | **$8,990** |

### Aggressive (Reddit front page, PH #1, HN front page)

| Week | Traffic Source | Visitors | Conv. Rate | Sales | Revenue |
|------|--------------|----------|------------|-------|---------|
| 1 | Reddit viral (50K views) + Twitter | 8,000 | 4% | 320 | $9,280 |
| 2 | PH #1 + HN front page | 10,000 | 3% | 300 | $8,700 |
| 3 | Earned media + SEO + outreach | 5,000 | 5% | 250 | $7,250 |
| 4 | Affiliates + AppSumo + compounding | 5,000 | 5% | 250 | $7,250 |
| **Total** | | **28,000** | | **1,120** | **$32,480** |

---

## PART 8: PRODUCT HUNT STRATEGY

### Pre-Launch (Days 1-6)
1. Create a "Coming Soon" / Ship page on Product Hunt
2. Collect followers on the Ship page (share in all communities)
3. Prepare assets: 5 high-quality screenshots, 60-second demo video, animated GIF of the unlock flow
4. Write a compelling maker comment (2-3 paragraphs: why you built it, the pain point with data, what makes it different)
5. Find a hunter: reach out to top hunters (Chris Messina, Kevin William David, etc.) via Twitter DM. Offer them early access.
6. If no hunter responds, self-hunt. It works fine for indie tools.

### Launch Day Protocol
- Launch Tuesday or Wednesday at 12:01 AM PT
- Have 10-15 people ready to leave genuine comments (not fake -- real freelancers who tested the product)
- Maker must respond to every comment within 30 minutes
- Share PH link (not direct upvote link) in all communities
- Post a "behind the build" thread on Twitter linking to PH
- Do NOT use the word "upvote" in any outreach -- say "check it out" or "would love your feedback"

### Post-Launch
- Add "Featured on Product Hunt" badge to landing page
- Create a blog post: "How ProposalLock launched on Product Hunt: results and lessons"
- Use PH launch as social proof in all future marketing

---

## PART 9: SEO QUICK WINS

### Target Keywords (estimated monthly search volume in US)

| Keyword | Est. Volume | Difficulty | Content Strategy |
|---------|------------|------------|-----------------|
| freelance invoice template | 8K-12K | Medium | Blog post + free template download (lead magnet) |
| freelance proposal template | 5K-8K | Medium | Blog post with embedded ProposalLock CTA |
| how to get clients to pay | 2K-4K | Low | Problem-awareness article, ProposalLock as solution |
| client won't pay invoice | 1K-3K | Low | SEO article targeting frustrated freelancers |
| payment protection for freelancers | 500-1K | Low | Direct product-focused landing page |
| freelance contract with payment terms | 3K-5K | Medium | Educational content with product tie-in |
| send files after payment | 200-500 | Very Low | Long-tail, high-intent keyword -- target with a dedicated page |
| payment gated content | 100-300 | Very Low | Product category page |
| alternative to HoneyBook | 1K-2K | Medium | Comparison page (ProposalLock vs HoneyBook) |
| alternative to Bonsai freelance | 500-1K | Low | Comparison page |

### Quick Win Actions
1. Create /blog/freelance-proposal-template -- target "freelance proposal template" keyword
2. Create /vs/honeybook -- comparison page targeting "alternative to HoneyBook"
3. Create /vs/bonsai -- comparison page targeting "alternative to Bonsai"
4. Add schema markup (Product, FAQ) to landing page
5. Submit sitemap to Google Search Console immediately after launch

---

## PART 10: SOCIAL PROOF PRE-REVENUE

Since you have zero customers at launch, use these legitimate social proof techniques:

1. **Community validation:** "Built based on a conversation with 3,200 freelancers on r/freelance" (from the Nina VoC research -- this is real data)
2. **Pain statistics:** "51% of freelancers have experienced non-payment" (Statista) -- this is third-party credibility
3. **Price anchoring as proof:** The comparison table (ProposalLock $29 once vs. HoneyBook $792/year) IS social proof -- it proves market validation that this problem is worth paying to solve
4. **Beta user feedback:** Give free access to 10-20 freelancers in Week 1 in exchange for testimonials. Use their exact words on the landing page.
5. **"As seen on" badges:** After Product Hunt launch, add the PH badge. After HN post, add "Discussed on Hacker News" badge. These are earned, not fake.
6. **Builder credibility:** "Built by a Booth MBA who spent 4 years in strategy consulting" -- founder story matters for trust at this price point.
7. **Usage counter:** "X proposals created" -- a live counter on the landing page showing total proposals created (including free tier). Even if only 50, it shows real usage.

---

## PART 11: AFFILIATE + PARTNERSHIP OPPORTUNITIES

### Freelancer Influencers to Target (Twitter/X)

| Influencer Type | Follower Range | Outreach Approach |
|----------------|---------------|-------------------|
| Freelance coaches (e.g., @brennandunn, @studyhallxyz) | 10K-100K | Offer 40% affiliate commission ($11.60/sale) + free access |
| Freelance writers who tweet about payment issues | 1K-10K | DM with free access, ask for honest review |
| YouTube freelance educators | 5K-50K | Offer sponsored mention ($50-$100) + affiliate |
| Newsletter authors (Freelance Stack, The Freelancer) | 2K-20K | Offer exclusive discount code for their audience |

### Partnership Channels
- **LemonSqueezy marketplace:** List ProposalLock on LS discover page (free distribution)
- **AppSumo:** Pitch for a deal page (they take 60-70% of revenue but volume is massive -- 1M+ buyers)
- **Gumroad:** Cross-list as a secondary distribution channel
- **BetaList:** Submit for free pre-launch exposure
- **Launching.io / BetaPage:** Additional launch directories

### Affiliate Program Setup
- Use LemonSqueezy's built-in affiliate system
- Commission: 30% ($8.70 per sale) -- standard for digital products
- Cookie duration: 30 days
- Provide affiliates with: banner images, comparison graphics, email swipe copy, social post templates

---

## PART 12: KPIs TO TRACK

### Week 1 KPIs (Daily Tracking)

| KPI | Target | Tool |
|-----|--------|------|
| Unique visitors | 100+/day by Day 7 | Plausible/Umami |
| Landing page conversion rate | 3%+ | Analytics |
| Total sales | 15+ in Week 1 | LemonSqueezy dashboard |
| Revenue | $435+ in Week 1 | LemonSqueezy dashboard |
| Email list signups | 50+ | Email capture form |
| Reddit post upvotes | 50+ on at least one post | Reddit |
| Twitter impressions | 10K+ cumulative | Twitter Analytics |
| Product Hunt followers (pre-launch) | 100+ | Product Hunt Ship page |

### Week 2-4 KPIs (Weekly Tracking)

| KPI | Target | Tool |
|-----|--------|------|
| Weekly revenue | $500+ and growing | LemonSqueezy |
| Cumulative sales | 100+ by end of Month 1 | LemonSqueezy |
| Traffic sources breakdown | Know your top 3 channels | Analytics |
| Cost per acquisition (if running ads) | Under $15 | Ad platform + revenue data |
| Referral traffic % | 10%+ from "Powered by ProposalLock" links | Analytics |
| SEO impressions | Growing week over week | Google Search Console |
| Affiliate signups | 10+ active affiliates | LemonSqueezy |
| Proposals created (product usage) | 5x sales number (shows retention) | Internal DB |

### North Star Metrics

| Metric | Definition | Why It Matters |
|--------|-----------|---------------|
| **Sales velocity** | Sales per day, trailing 7 days | Shows momentum |
| **Organic traffic %** | % of sales from non-paid channels | Sustainability indicator -- at $29 LTV, you NEED 80%+ organic |
| **Viral coefficient** | New visitors from "Powered by ProposalLock" / total visitors | Built-in growth loop |
| **Payback period** | Days to recoup any marketing spend | Must be under 7 days for paid channels |

---

## PART 13: PAID ADS -- REALISTIC ASSESSMENT

### The Math Problem

At $29 LTV with no recurring revenue:
- Facebook CPC (Business Services): $0.84 average
- Landing page conversion: 3-5%
- Cost per sale: $0.84 / 0.04 = $21 CPA
- Profit per sale from ads: $29 - $21 = $8 (before payment processing fees)
- After LemonSqueezy fees (~5%): $29 - $1.45 - $21 = $6.55 profit per ad-acquired customer

This is thin. Paid ads are a SECONDARY channel, not primary.

### If You Run Ads Anyway

**Minimum viable budget:** $150 total for a 2-week test
- $75 on Facebook/Instagram (target: freelancers + invoicing interests)
- $75 on Google Search (target: "freelance proposal tool", "payment protection freelancer")

**Expected results at $150 spend:**
- Facebook: ~89 clicks, 3-4 sales ($87-$116 revenue)
- Google: ~25-50 clicks, 1-2 sales ($29-$58 revenue)
- Total: 4-6 sales, $116-$174 revenue
- Net loss of $0 to -$34 on the ad spend itself

**Verdict:** Paid ads break even at best for a $29 one-time product. Use ads only for retargeting visitors who did not convert (cheapest CPA) or to amplify content that is already performing organically.

### Best Paid Strategy for $29 Product
1. **Retargeting only:** Install Meta Pixel and Google tag. Retarget visitors who hit the landing page but did not buy. CPA for retargeting is typically 50-70% lower than cold traffic.
2. **Boost organic winners:** If a tweet or LinkedIn post gets organic traction, boost it with $10-$20. Amplify what already works.
3. **Influencer sponsorship over ads:** Paying a freelancer YouTuber $50-$100 for a mention reaches a warmer audience than any ad platform.

---

## CRITICAL SUCCESS FACTORS

1. **Fix P0 blockers before marketing.** No amount of traffic matters if the product breaks after purchase (DB wipes) or has no legal pages (LemonSqueezy can freeze your account).

2. **Lead with pain, not product.** Every post, tweet, and email should start with the problem ("51% of freelancers have been stiffed") not the product ("Check out my new tool"). The pain is the hook.

3. **"Powered by ProposalLock" is your growth engine.** Every proposal sent to a client is a free impression. This is the only scalable, zero-cost acquisition channel for a $29 product. Implement this in Week 1.

4. **Organic or die.** At $29 LTV, you cannot sustain paid acquisition. The entire strategy depends on Reddit virality, Product Hunt launch traffic, SEO, and word of mouth. Invest 90% of effort in organic.

5. **Speed matters more than perfection.** A good-enough post today beats a perfect post next week. The freelancer pain point is evergreen -- every day you wait is a day someone else builds this.

---

## APPENDIX: COMPETITIVE LANDSCAPE

| Tool | Price | What It Does | ProposalLock Advantage |
|------|-------|-------------|----------------------|
| HoneyBook | $16-$66/month ($192-$792/year) | All-in-one: proposals, contracts, invoicing, CRM | 95% cheaper for the one feature freelancers actually need |
| Bonsai | $24-$79/month ($288-$948/year) | Contracts, proposals, invoicing, tax | ProposalLock does one thing perfectly for $29 total |
| Proposify | $49/month ($588/year) | Proposal design + e-signatures | Proposify is for agencies, ProposalLock is for solo freelancers |
| PayHip | Free-$99/month | Digital product sales | Not designed for freelancer proposals specifically |
| Gumroad | Free + 10% fee | Digital product sales | Not designed for custom client proposals |
| Escrow.com | 0.89-3.25% fee | Payment escrow | Too complex for a $2K freelance project |

**ProposalLock's positioning:** "The $29 Swiss Army knife in a world of $600/year toolkits."
