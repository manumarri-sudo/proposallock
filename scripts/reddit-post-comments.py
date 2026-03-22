#!/usr/bin/env python3
"""Post karma-building comments on Reddit using Firefox Playwright."""

import os
import time
import json
import random
from playwright.sync_api import sync_playwright

REDDIT_USERNAME = os.environ.get("REDDIT_USERNAME", "launchstack")
REDDIT_PASSWORD = os.environ.get("REDDIT_PASSWORD", "")

COMMENTS = [
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1qqtkoh/looking_for_advice_after_a_payment_dispute_with_a/",
        "comment": "ugh this is such a frustrating situation. the fact that he went silent after you delivered and the contract was signed... that's not a misunderstanding, that's someone hoping you'll just give up.\n\na couple things that worked for me:\n\nfirst, send one final written demand via email with a specific deadline (7 days). keep it totally professional and factual -- \"per our agreement dated X, payment of $Y was due on Z. please remit by [date].\" no emotion, just facts.\n\nif that doesn't move them, small claims is actually really accessible for this kind of thing, depending on the amount. the filing fee alone is often enough to get people to pay.\n\nthe other thing: document EVERYTHING now. screenshots of all communication, the contract, delivery confirmation. if he's gone quiet he may be hoping you don't have receipts. you probably do."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1qulk9w/customer_belittling_work/",
        "comment": "this is such a classic move. the \"post-delivery disappearance then suddenly everything is wrong\" playbook.\n\nthe fact that they did a successful internal review is HUGE. get that in writing if you don't have it already. any internal messages where someone on their team said the work looked good -- that's your evidence.\n\nwhat i'd do: reply in writing only (no calls), reference the signed contract and the successful review, state clearly that the work was delivered as agreed and final payment is due. give them 5 business days.\n\nif they keep stalling, a formal letter of demand often gets things moving. sometimes that alone does it."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1re9ttz/client_expects_employeelike_behavior/",
        "comment": "5-20 texts a morning and in-person meetings with no notice... yeah that's not a client relationship, that's a job with worse benefits lol\n\nif a client is taking up employee-level time and attention, they should be paying employee-level money (or more, since you're taking on all the risk).\n\ntwo things that helped me set limits with a similar client:\n\nresponse windows -- i told mine i check messages twice a day (morning and afternoon). most clients adapt when they understand you're not on-call.\n\nfor meetings, \"i need at least 5 business days notice\" is a totally reasonable ask. if they can't respect that, it costs them extra."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1rgk3zv/just_lost_my_biggest_client/",
        "comment": "man, that stings. especially when it's steady reliable income -- even if you knew logically it was a risk to depend on one client, it still hurts when it actually happens.\n\nthe thing i always remind myself: losing a client means you're now available for the next one, who might pay better or treat you better. $2k/month is great but it's not a ceiling.\n\npractically speaking -- now's a good time to reach out to past contacts. a simple \"hey, i've got some capacity opening up\" message to 5-10 people can move fast.\n\nsorry it ended this way. it's okay to feel bummed about it for a bit. that was real income and a real relationship."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1rirozj/client_wants_to_switch_from_daily_billing_to/",
        "comment": "classic post-invoice dispute. without a signed quote you're in a harder spot than you should be... but not hopeless.\n\nkey question: do you have ANY written record of agreeing to a daily rate? even a message where she mentioned the daily rate and you quoted it and she didn't object? that counts.\n\nif so, reply referencing that. something like: \"as discussed, we agreed on a daily rate given the variable schedule. i've invoiced based on days made available, which is what we agreed to.\"\n\nfor next time: never start work without a signed quote. even a 2-line email saying \"i accept your quote of X per day\" is enough."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1rwqp7w/pulse_check_on_what_feels_like_a_bad_situation/",
        "comment": "yeah the contractor/employee line is real and a lot of companies push it because no one wants to test it.\n\ntechnically -- if they're controlling HOW you do your work (specific files, tracked to the minute, dictating tools) rather than just WHAT you deliver, that's more employee behavior than contractor. there's actually a legal test for this and these kinds of controls can tip the scale.\n\npractical options:\n1) push back on the specific thing bothering you most\n2) have a direct conversation with whoever set the new rules -- new PMs sometimes overcorrect and back off when pushed\n3) start looking for other work quietly, because 5 years in one client relationship is a concentration risk regardless"
    },
]


def h(a=0.5, b=2.0):
    time.sleep(random.uniform(a, b))


def login(page):
    """Log into Reddit using Firefox."""
    print("Navigating to Reddit login...")
    page.goto("https://www.reddit.com/login/", wait_until="domcontentloaded", timeout=30000)
    h(2, 4)

    # Firefox can see the login form
    try:
        page.wait_for_selector('input[name="username"]', timeout=10000)
        page.fill('input[name="username"]', REDDIT_USERNAME)
        h(0.8, 1.5)
        page.fill('input[name="password"]', REDDIT_PASSWORD)
        h(0.8, 1.5)

        # Try different button selectors
        for btn_sel in [
            'button:text("Log In")',
            'button:text-is("Log In")',
            'button.w-full',
            'button[class*="login"]',
            'button[class*="submit"]',
        ]:
            try:
                btn = page.locator(btn_sel).first
                if btn.is_visible(timeout=2000):
                    btn.click()
                    print(f"Clicked button: {btn_sel}")
                    h(4, 6)
                    break
            except:
                continue
        else:
            # Fallback: press Enter
            page.keyboard.press("Enter")
            h(4, 6)

        url_after = page.url
        print(f"URL after login: {url_after}")
        return "login" not in url_after.lower()

    except Exception as e:
        print(f"Login failed: {e}")
        return False


def post_comment(page, post_url, comment_text):
    """Post a comment on a Reddit post."""
    print(f"\nPosting on: {post_url[-50:]}")
    try:
        page.goto(post_url, wait_until="domcontentloaded", timeout=30000)
        h(3, 5)

        # Check if we're still logged in
        page_text = page.evaluate("() => document.body.innerText.slice(0, 200)")
        if "Log In" in page_text and "Log out" not in page_text:
            print("Not logged in on this page")
            return False

        # Find the comment textarea
        textarea = None
        try:
            page.wait_for_selector('textarea', timeout=10000)
            textarea = page.locator('textarea').first
            if not textarea.is_visible(timeout=3000):
                textarea = None
        except:
            pass

        if not textarea:
            # Try scrolling to find it
            page.keyboard.press("End")
            h(1, 2)
            try:
                textarea = page.locator('textarea').first
                if not textarea.is_visible(timeout=3000):
                    textarea = None
            except:
                pass

        if not textarea:
            print("No textarea found")
            return False

        # Click and fill the textarea
        textarea.click()
        h(0.5, 1)
        textarea.fill(comment_text)
        h(1, 2)

        # Find submit button
        submit_btns = [
            'button:text("Comment")',
            'button:text-is("Comment")',
            'button[type="submit"]',
            'button:text("Save")',
        ]

        for btn_sel in submit_btns:
            try:
                btn = page.locator(btn_sel).last
                if btn.is_visible(timeout=3000):
                    btn.click()
                    h(2, 4)
                    print(f"Comment submitted via: {btn_sel}")
                    return True
            except:
                continue

        print("Could not find submit button")
        return False

    except Exception as e:
        print(f"Error posting comment: {e}")
        return False


def main():
    results = []

    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1366, "height": 768},
            locale="en-US",
            timezone_id="America/New_York",
        )
        page = context.new_page()

        logged_in = login(page)
        print(f"\nLogin result: {'SUCCESS' if logged_in else 'FAILED'}")

        if not logged_in:
            print("Cannot post comments without login. Saving comments for manual posting.")
            browser.close()
            # Write comments to file for manual posting
            with open("/tmp/reddit-comments-to-post.json", "w") as f:
                json.dump(COMMENTS, f, indent=2)
            print("Comments saved to /tmp/reddit-comments-to-post.json")
            return

        # Post comments with delays
        for i, item in enumerate(COMMENTS):
            success = post_comment(page, item["post_url"], item["comment"])
            results.append({
                "url": item["post_url"],
                "success": success,
                "preview": item["comment"][:80]
            })

            if i < len(COMMENTS) - 1:
                wait_time = random.uniform(20, 40)
                print(f"Waiting {wait_time:.0f}s before next comment...")
                time.sleep(wait_time)

        browser.close()

    print("\n=== RESULTS ===")
    for r in results:
        status = "OK" if r["success"] else "FAIL"
        print(f"[{status}] {r['url'][-60:]}")

    with open("/tmp/reddit-comment-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nResults saved to /tmp/reddit-comment-results.json")


if __name__ == "__main__":
    main()
