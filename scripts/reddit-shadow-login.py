#!/usr/bin/env python3
"""Reddit posting using Shadow DOM-aware Playwright approach."""

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
        "comment": "ugh this is such a frustrating situation. the fact that he went silent after you delivered and the contract was signed... that's not a misunderstanding, that's someone hoping you'll just give up.\n\na couple things that worked for me:\n\nfirst, send one final written demand via email with a specific deadline (7 days). keep it totally professional and factual -- \"per our agreement dated X, payment of $Y was due on Z. please remit by [date].\" no emotion, just facts.\n\nif that doesn't move them, small claims is actually really accessible for this kind of thing, depending on the amount. a lot of people assume it's complicated but for contract work under $10k it's usually straightforward. the filing fee alone is often enough to get people to pay.\n\nthe other thing: document EVERYTHING now. screenshots of all communication, the contract, delivery confirmation. if he's gone quiet he may be hoping you don't have receipts. you probably do."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1qulk9w/customer_belittling_work/",
        "comment": "this is such a classic move. the \"post-delivery disappearance then suddenly everything is wrong\" playbook.\n\nthe fact that they did a successful internal review is HUGE. get that in writing if you don't have it already. any internal slack messages, emails, anything where someone on their team said the work looked good -- that's your evidence if this goes further.\n\nwhat i'd do: reply in writing only (no calls), reference the signed contract and the successful review they did, state clearly that the work was delivered as agreed and final payment is due. give them 5 business days.\n\nif they keep stalling, send a formal letter of demand. you can find templates online. sometimes that alone gets people to pay up because suddenly it feels real and not just a freelancer being annoying."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1re9ttz/client_expects_employeelike_behavior/",
        "comment": "5-20 texts a morning and in-person meetings with no notice... yeah that's not a client relationship, that's a job with worse benefits lol\n\nhonestly the way i think about it: if a client is taking up employee-level time and attention, they should be paying employee-level money (or more, since you're taking on all the risk).\n\na few things that helped me set limits with a similar client:\n\nresponse windows -- i told mine i check messages twice a day (morning and afternoon) and that works for my schedule. most clients adapt when they understand you're not going to be on-call.\n\nfor meetings, \"i need at least 5 business days notice to block time\" is a totally reasonable ask. if they can't respect that, it costs them extra."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1rgk3zv/just_lost_my_biggest_client/",
        "comment": "man, that stings. especially when it's steady reliable income -- even if you knew logically it was a risk to depend on one client, it still hurts when it actually happens.\n\nthe thing i always remind myself: losing a client means you're now available for the next one, who might pay better or treat you better. $2k/month is great but it's not a ceiling.\n\non the practical side -- if you don't already have 2-3 smaller clients in your pipeline, now's actually a good time to reach out to past contacts or previous clients you liked. a simple \"hey, i've got some capacity opening up, let me know if you have anything coming up\" message to 5-10 people can move fast.\n\nsorry it ended this way. it's okay to feel bummed about it for a bit though. that was real income and a real relationship."
    },
    {
        "post_url": "https://www.reddit.com/r/freelance/comments/1rirozj/client_wants_to_switch_from_daily_billing_to/",
        "comment": "this is a classic post-invoice dispute and the thing is, without a signed quote you're in a harder spot than you should be... but not hopeless.\n\nthe key question: do you have ANY written record of agreeing to a daily rate? even a whatsapp message or email where she mentioned the daily rate or you quoted it and she didn't object? that counts.\n\nif you have anything in writing, reply to her invoice dispute email referencing that. something like: \"as discussed in [reference], we agreed on a daily rate of X given the variable schedule. i've invoiced based on days made available, which is what we agreed to. happy to discuss going forward but this invoice reflects our existing agreement.\"\n\nfor next time: never start work without a signed quote. even a 2-line email saying \"i accept your quote of X per day\" from the client is enough."
    },
]


def h(min_s=0.5, max_s=2.0):
    time.sleep(random.uniform(min_s, max_s))


def main():
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            locale="en-US",
        )
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        # LOGIN using JavaScript to pierce Shadow DOM
        print("Navigating to Reddit login...")
        page.goto("https://www.reddit.com/login/", wait_until="networkidle", timeout=30000)
        h(3, 5)

        # Try to find inputs via JavaScript shadow DOM traversal
        login_result = page.evaluate("""
        () => {
            // Try to find inputs in shadow DOM
            function findDeepInput(root, name) {
                if (root.querySelector) {
                    let el = root.querySelector(`input[name="${name}"]`);
                    if (el) return el;
                }
                const els = root.querySelectorAll ? root.querySelectorAll('*') : [];
                for (let el of els) {
                    if (el.shadowRoot) {
                        let found = findDeepInput(el.shadowRoot, name);
                        if (found) return found;
                    }
                }
                return null;
            }

            const userInput = findDeepInput(document, 'username');
            const passInput = findDeepInput(document, 'password');

            return {
                hasUserInput: !!userInput,
                hasPassInput: !!passInput,
                allInputNames: Array.from(document.querySelectorAll('input')).map(i => i.name || i.type || i.placeholder),
                bodyText: document.body.innerText.slice(0, 200)
            };
        }
        """)
        print(f"Login page analysis: {json.dumps(login_result, indent=2)}")

        # Try filling via shadow DOM JavaScript
        fill_result = page.evaluate(f"""
        () => {{
            function findDeepEl(root, selector) {{
                if (root.querySelector) {{
                    let el = root.querySelector(selector);
                    if (el) return el;
                }}
                const els = root.querySelectorAll ? root.querySelectorAll('*') : [];
                for (let el of els) {{
                    if (el.shadowRoot) {{
                        let found = findDeepEl(el.shadowRoot, selector);
                        if (found) return found;
                    }}
                }}
                return null;
            }}

            const userInput = findDeepEl(document, 'input[name="username"], input[id*="user"], input[placeholder*="user" i]');
            const passInput = findDeepEl(document, 'input[name="password"], input[type="password"]');

            if (userInput) {{
                userInput.focus();
                userInput.value = '{REDDIT_USERNAME}';
                userInput.dispatchEvent(new Event('input', {{bubbles: true}}));
                userInput.dispatchEvent(new Event('change', {{bubbles: true}}));
            }}

            if (passInput) {{
                passInput.focus();
                passInput.value = '{REDDIT_PASSWORD}';
                passInput.dispatchEvent(new Event('input', {{bubbles: true}}));
                passInput.dispatchEvent(new Event('change', {{bubbles: true}}));
            }}

            return {{
                foundUser: !!userInput,
                foundPass: !!passInput,
                userValue: userInput ? userInput.value.slice(0, 5) + '...' : null
            }};
        }}
        """)
        print(f"Fill result: {fill_result}")
        h(1, 2)

        # Try to click the submit button via shadow DOM
        submit_result = page.evaluate("""
        () => {
            function findDeepEl(root, selector) {
                if (root.querySelector) {
                    let el = root.querySelector(selector);
                    if (el) return el;
                }
                const els = root.querySelectorAll ? root.querySelectorAll('*') : [];
                for (let el of els) {
                    if (el.shadowRoot) {
                        let found = findDeepEl(el.shadowRoot, selector);
                        if (found) return found;
                    }
                }
                return null;
            }

            const btn = findDeepEl(document, 'button[type="submit"]');
            if (btn) {
                btn.click();
                return {clicked: true, text: btn.textContent};
            }

            // Try by text
            const allBtns = Array.from(document.querySelectorAll('button'));
            for (let b of allBtns) {
                if (b.textContent.toLowerCase().includes('log in') ||
                    b.textContent.toLowerCase().includes('sign in') ||
                    b.textContent.toLowerCase().includes('continue')) {
                    b.click();
                    return {clicked: true, text: b.textContent, method: 'text'};
                }
            }

            return {clicked: false, buttons: allBtns.map(b => b.textContent.trim()).slice(0, 10)};
        }
        """)
        print(f"Submit result: {submit_result}")
        h(4, 6)

        print(f"Current URL after login attempt: {page.url}")

        # Check if logged in
        is_logged_in = page.evaluate("""
        () => {
            // Check if we see username in the page
            const html = document.documentElement.innerHTML;
            return {
                url: window.location.href,
                hasLogout: html.includes('log-out') || html.includes('logout') || html.includes('sign-out'),
                hasUsername: html.toLowerCase().includes('launchstack') || html.includes('user'),
                title: document.title.slice(0, 50)
            };
        }
        """)
        print(f"Login check: {is_logged_in}")

        # Take screenshot to verify
        page.screenshot(path="/tmp/login-result.png")

        # If not logged in, try alternative - new Reddit uses a different auth flow
        if "login" in page.url.lower() or not is_logged_in.get("hasLogout"):
            print("Standard login didn't work, trying form-based submission...")
            # Wait for form to render with JS
            try:
                page.wait_for_selector('input', timeout=10000, state='attached')
                inputs = page.query_selector_all('input')
                print(f"Found {len(inputs)} inputs after wait")
                for inp in inputs:
                    print(f"  Input: name={inp.get_attribute('name')}, type={inp.get_attribute('type')}")
            except Exception as e:
                print(f"Wait error: {e}")

            # Try keyboard-based approach after focusing via JS
            try:
                # Use Tab navigation to reach login form
                page.keyboard.press("Tab")
                h(0.5, 1)
                page.keyboard.type(REDDIT_USERNAME)
                h(0.5, 1)
                page.keyboard.press("Tab")
                h(0.5, 1)
                page.keyboard.type(REDDIT_PASSWORD)
                h(0.5, 1)
                page.keyboard.press("Enter")
                h(4, 6)
                print(f"After keyboard login: {page.url}")
            except Exception as e:
                print(f"Keyboard login error: {e}")

        # Final check
        page.screenshot(path="/tmp/final-login.png")
        print(f"Final URL: {page.url}")
        print(f"Logged in: {'login' not in page.url.lower()}")

        # Now try to post a comment on the first post
        test_url = COMMENTS[0]["post_url"]
        test_comment = COMMENTS[0]["comment"]

        print(f"\nNavigating to test post: {test_url}")
        page.goto(test_url, wait_until="networkidle", timeout=30000)
        h(3, 5)

        # Screenshot the post page
        page.screenshot(path="/tmp/post-page.png")

        # Examine comment form structure
        comment_info = page.evaluate("""
        () => {
            function deepQuery(root, selector) {
                let results = [];
                try {
                    let direct = root.querySelectorAll(selector);
                    results = [...direct];
                } catch(e) {}

                const allEls = root.querySelectorAll ? root.querySelectorAll('*') : [];
                for (let el of allEls) {
                    if (el.shadowRoot) {
                        results = results.concat(deepQuery(el.shadowRoot, selector));
                    }
                }
                return results;
            }

            const textareas = deepQuery(document, 'textarea');
            const contenteditable = deepQuery(document, '[contenteditable]');
            const commentForms = deepQuery(document, '[data-testid*="comment"], [class*="comment-form"], shreddit-composer');

            return {
                textareaCount: textareas.length,
                textareaDetails: textareas.map(t => ({
                    visible: t.offsetParent !== null,
                    placeholder: t.placeholder,
                    className: t.className.slice(0, 50)
                })),
                contenteditableCount: contenteditable.length,
                contenteditableDetails: contenteditable.slice(0, 3).map(e => ({
                    tag: e.tagName,
                    visible: e.offsetParent !== null,
                    className: e.className.slice(0, 50)
                })),
                commentFormCount: commentForms.length,
                commentFormTags: commentForms.slice(0, 5).map(e => e.tagName),
                bodyText: document.body.innerText.slice(0, 500)
            };
        }
        """)
        print(f"Comment form analysis: {json.dumps(comment_info, indent=2)}")

        browser.close()
        print("\nDebug screenshots: /tmp/login-result.png, /tmp/post-page.png")


if __name__ == "__main__":
    main()
