#!/usr/bin/env python3
"""
post-twitter-thread.py — Post the ProposalLock viral thread to Twitter/X via Tweepy.
Uses env vars: TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET,
               TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
"""

import os
import sys
import json
import time
import tweepy

# Credentials
API_KEY = os.environ.get("TWITTER_CONSUMER_KEY", "")
API_SECRET = os.environ.get("TWITTER_CONSUMER_SECRET", "")
ACCESS_TOKEN = os.environ.get("TWITTER_ACCESS_TOKEN", "")
ACCESS_SECRET = os.environ.get("TWITTER_ACCESS_TOKEN_SECRET", "")

if not all([API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET]):
    missing = [k for k, v in {
        "TWITTER_CONSUMER_KEY": API_KEY,
        "TWITTER_CONSUMER_SECRET": API_SECRET,
        "TWITTER_ACCESS_TOKEN": ACCESS_TOKEN,
        "TWITTER_ACCESS_TOKEN_SECRET": ACCESS_SECRET,
    }.items() if not v]
    print(f"ERROR: Missing: {missing}", file=sys.stderr)
    sys.exit(1)

TWEETS = [
    "I tracked how much freelancers lose to unpaid invoices. The numbers are insane.\n\nA thread.",
    "51% of freelancers have experienced non-payment for completed work.\n\nOne in two.\n\nNot a bug in the system. That IS the system.",
    "The time cost is what kills me.\n\nAverage freelancer: 2-3 hours/week chasing invoices.\nThat's 130 hours a year.\nAt $50/hr = $6,500 in lost time.\n\nThat's BEFORE counting the actual unpaid invoices.",
    'Standard advice: "get 50% upfront."\n\nOK, fine. But then you send the files and hope for the other half.\n\nYou still hand over all your leverage the second you hit send. The problem isn\'t solved. It\'s just delayed.',
    "What actually works: payment-gated file delivery.\n\nClient sees the project summary and price. They pay. Files unlock automatically.\n\nNot a minute before payment clears.\n\nNo chasing. No \"circling back on that invoice.\" No $6,500 lesson.",
    "I built this. It's called ProposalLock.\n\n- Paste your file URL (Drive, Dropbox, anything)\n- Set a price\n- Send the link\n- Files unlock via webhook when payment clears\n\n$29 once.\n\nhttps://proposallock.onrender.com?utm_source=twitter&utm_medium=thread&utm_campaign=firstdollar",
    "\"Clients won't pay before seeing the work.\"\n\nThe clients who refuse were never going to pay you after either.\n\nThis is a filter, not a barrier. Good clients don't blink. Bad clients reveal themselves before you lose the work.",
]


def main():
    # Auth
    client = tweepy.Client(
        consumer_key=API_KEY,
        consumer_secret=API_SECRET,
        access_token=ACCESS_TOKEN,
        access_token_secret=ACCESS_SECRET,
    )

    print(f"Posting {len(TWEETS)}-tweet thread...\n")

    tweet_ids = []
    tweet_urls = []
    previous_id = None

    for i, text in enumerate(TWEETS, 1):
        print(f"Tweet {i}/{len(TWEETS)}: {text[:60]}...")
        try:
            kwargs = {"text": text}
            if previous_id:
                kwargs["in_reply_to_tweet_id"] = previous_id

            response = client.create_tweet(**kwargs)
            tweet_id = response.data["id"]
            tweet_ids.append(tweet_id)

            # Get the Twitter handle to build URL
            me = client.get_me()
            username = me.data.username if me.data else "unknown"
            url = f"https://twitter.com/{username}/status/{tweet_id}"
            tweet_urls.append(url)

            print(f"  ✅ Posted: {url}")
            previous_id = tweet_id
            time.sleep(2)  # Small delay between tweets

        except Exception as e:
            print(f"  ❌ Failed: {e}")
            break

    print(f"\n=== THREAD COMPLETE ===")
    print(f"Posted: {len(tweet_ids)}/{len(TWEETS)} tweets")
    if tweet_urls:
        print(f"Thread root: {tweet_urls[0]}")

    # Save results
    results = {
        "thread_root": tweet_urls[0] if tweet_urls else None,
        "tweet_ids": tweet_ids,
        "tweet_urls": tweet_urls,
        "posted_count": len(tweet_ids),
    }
    results_path = "/Users/manaswimarri/lattice-workspace/proposallock/scripts/twitter-thread-results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to: {results_path}")

    return 0 if len(tweet_ids) == len(TWEETS) else 1


if __name__ == "__main__":
    sys.exit(main())
