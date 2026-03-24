#!/bin/bash
# Complete Reddit posting flow for r/smallbusiness
# Runs all Firecrawl browser commands sequentially in one script

set -e

TITLE="Anyone keep track of how much you've lost to clients who ghosted after delivery?"

BODY="I started doing this last year because I wanted to actually know the number. Not guess. Know.

In 18 months I've had four clients receive completed work and then just disappear. Total unpaid: \$7,400.

One of them gave specific feedback on revisions. Complimented the final product in writing. Said payment was coming \"this week.\" Then stopped opening emails.

I also tracked the time I spend chasing invoices. Works out to about 2.5 hours per week across all active clients. That's 130 hours a year. Three full work weeks of \"hi, just checking in on that invoice\" emails.

The part I kept coming back to is that I designed this situation myself. I was sending deliverables and then invoicing. From the client's perspective -- they already had everything they needed. The incentive to pay was just goodwill, I guess.

I've been experimenting with flipping the workflow. Send a preview, not the full deliverables. Payment clears, then full files release. Curious if others have done this and how it went with clients.

The standard advice is \"get a 50% deposit,\" but that still leaves you sending the other half on faith.

What's actually working for you?"

echo "=== Step 1: Open old.reddit.com submit page ==="
firecrawl browser --profile ls-reddit "open https://old.reddit.com/r/smallbusiness/submit"
sleep 2

echo "=== Step 2: Check URL ==="
firecrawl browser --profile ls-reddit "eval window.location.href"

echo "=== Step 3: Check login status ==="
firecrawl browser --profile ls-reddit "eval document.querySelector('.user a') ? document.querySelector('.user a').textContent : 'not logged in'"

echo "=== Step 4: Get form refs ==="
firecrawl browser --profile ls-reddit "snapshot -i"

echo "DONE_STEP4"
