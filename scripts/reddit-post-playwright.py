"""
Reddit comment poster via Playwright (cloud browser).
Posts karma-building comments to r/freelance threads.
"""
import asyncio
import os
import json

# Reddit credentials
REDDIT_USERNAME = os.environ.get("REDDIT_USERNAME", "launchstack")
REDDIT_PASSWORD = os.environ.get("REDDIT_PASSWORD", "")

# Comments to post (thread_id, comment_text)
COMMENTS = [
    {
        "thread_url": "https://www.reddit.com/r/freelance/comments/1p65rry/client_ghosted_me_twice_then_used_my_whole/",
        "comment": """honestly this is the thing nobody talks about enough. the proposal itself has value -- you're basically doing a technical discovery sprint for free just to win the work

i've started keeping my proposals really thin. like "here's what i'd build, here's a rough timeline, here's the price." the actual stack choices, API docs, architecture decisions -- none of that until there's money moving.

the "i'll build it with AI" crowd was always going to find a way. best case is filtering them out before you spend 10 hours writing a spec"""
    },
    {
        "thread_url": "https://www.reddit.com/r/freelance/comments/1rirozj/client_wants_to_switch_from_daily_billing_to/",
        "comment": """no signed contract is the core problem here -- everything else flows from that. until something is in writing, you're working on a handshake and handshakes don't hold up when money is on the line

on the daily vs hourly thing: get the contract signed first, then invoice for what you've already done under the terms you verbally agreed to. if she pushes back on "i never agreed to daily," you have the emails where she asked for availability "1/2 to 3/4 days per week" -- that's daily framing

personally i'd send a short email: "before we continue, i'd like to get a quick agreement signed on rates and scope so we're both protected. i'll send it over today." if she refuses to sign anything, that tells you what you need to know about this client"""
    },
    {
        "thread_url": "https://www.reddit.com/r/SideProject/comments/1s0eux8/",
        "comment": """first paying customer for my first project took about 6 weeks from launch. but that was mostly because i spent 4 of those weeks building features nobody asked for instead of talking to people

second project: 3 days. because i posted in communities where the exact problem existed and had 5 conversations before writing a line of code

the biggest variable isn't the product -- it's whether you're in front of people who already have the problem"""
    }
]


async def post_comment(page, thread_url, comment_text):
    """Navigate to a Reddit thread and post a comment."""
    print(f"Navigating to: {thread_url}")
    await page.goto(thread_url, wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(3)

    # Look for the comment box
    # Reddit has different comment box selectors depending on the UI version
    comment_box = None

    # Try new Reddit UI
    selectors = [
        '[data-testid="comment-submission-form-richtext"]',
        '.CommentFormDropzone',
        '[placeholder="Add a comment"]',
        'div[contenteditable="true"]',
        '.public-DraftEditor-content',
    ]

    for selector in selectors:
        try:
            element = await page.query_selector(selector)
            if element:
                comment_box = element
                print(f"Found comment box with selector: {selector}")
                break
        except:
            pass

    if not comment_box:
        print(f"Could not find comment box on {thread_url}")
        # Take screenshot for debugging
        await page.screenshot(path=f"/tmp/reddit_debug_{thread_url.split('/')[-2]}.png")
        return None

    # Click the comment box to focus it
    await comment_box.click()
    await asyncio.sleep(1)

    # Type the comment
    await page.keyboard.type(comment_text, delay=20)
    await asyncio.sleep(1)

    # Find and click submit button
    submit_selectors = [
        'button[type="submit"]:has-text("Comment")',
        'button:has-text("Comment")',
        '[data-testid="comment-submit-button"]',
        'button.submit',
    ]

    submit_btn = None
    for selector in submit_selectors:
        try:
            btn = await page.query_selector(selector)
            if btn:
                submit_btn = btn
                print(f"Found submit button with: {selector}")
                break
        except:
            pass

    if not submit_btn:
        print("Could not find submit button")
        await page.screenshot(path=f"/tmp/reddit_submit_debug.png")
        return None

    await submit_btn.click()
    await asyncio.sleep(5)

    # Get current URL as evidence
    current_url = page.url
    print(f"Posted! Current URL: {current_url}")
    return current_url


async def login_to_reddit(page):
    """Log into Reddit."""
    print("Logging into Reddit...")
    await page.goto("https://www.reddit.com/login", wait_until="domcontentloaded")
    await asyncio.sleep(3)

    # Fill username
    username_field = await page.query_selector('#login-username, input[name="username"], input[id="username"]')
    if username_field:
        await username_field.click()
        await username_field.fill(REDDIT_USERNAME)
        print(f"Filled username: {REDDIT_USERNAME}")
    else:
        print("Could not find username field")
        await page.screenshot(path="/tmp/reddit_login_debug.png")
        return False

    # Fill password
    password_field = await page.query_selector('#login-password, input[name="password"], input[id="password"]')
    if password_field:
        await password_field.click()
        await password_field.fill(REDDIT_PASSWORD)
        print("Filled password")
    else:
        print("Could not find password field")
        return False

    # Submit
    submit = await page.query_selector('button[type="submit"]')
    if submit:
        await submit.click()
        print("Clicked login button")
    else:
        await page.keyboard.press("Enter")

    await asyncio.sleep(5)

    # Verify login
    current_url = page.url
    print(f"After login URL: {current_url}")

    # Check if we're logged in by looking for user avatar
    logged_in = await page.query_selector('[data-testid="user-drawer-trigger"], #USER_DROPDOWN_ID, .userAvatar')
    if logged_in or "reddit.com" in current_url and "login" not in current_url:
        print("Login appears successful!")
        return True
    else:
        print("Login may have failed")
        await page.screenshot(path="/tmp/reddit_post_login.png")
        return False


async def main():
    from playwright.async_api import async_playwright

    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        # Login
        logged_in = await login_to_reddit(page)

        if logged_in:
            # Post comments
            for comment_data in COMMENTS:
                try:
                    url = await post_comment(page, comment_data["thread_url"], comment_data["comment"])
                    results.append({
                        "thread": comment_data["thread_url"],
                        "result": url or "failed",
                        "status": "success" if url else "failed"
                    })
                    await asyncio.sleep(60)  # Wait 60s between comments
                except Exception as e:
                    print(f"Error posting to {comment_data['thread_url']}: {e}")
                    results.append({
                        "thread": comment_data["thread_url"],
                        "result": str(e),
                        "status": "error"
                    })
        else:
            results.append({"status": "login_failed"})

        await browser.close()

    print("\n=== RESULTS ===")
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    asyncio.run(main())
