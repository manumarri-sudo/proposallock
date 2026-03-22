#!/usr/bin/env python3
"""Debug Reddit login and comment UI selectors."""

import os
import time
from playwright.sync_api import sync_playwright

REDDIT_USERNAME = os.environ.get("REDDIT_USERNAME", "launchstack")
REDDIT_PASSWORD = os.environ.get("REDDIT_PASSWORD", "")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        # Step 1: Login
        print("Going to login page...")
        page.goto("https://www.reddit.com/login/", wait_until="domcontentloaded")
        time.sleep(3)
        page.screenshot(path="/tmp/01-login-page.png")
        print(f"Login page URL: {page.url}")
        print(f"Page title: {page.title()}")

        # Try to find login inputs
        inputs = page.locator("input").all()
        print(f"Found {len(inputs)} input fields")
        for i, inp in enumerate(inputs):
            try:
                print(f"  Input {i}: type={inp.get_attribute('type')}, name={inp.get_attribute('name')}, id={inp.get_attribute('id')}, placeholder={inp.get_attribute('placeholder')}")
            except:
                pass

        # Find buttons
        buttons = page.locator("button").all()
        print(f"Found {len(buttons)} buttons")
        for i, btn in enumerate(buttons[:5]):
            try:
                print(f"  Button {i}: text='{btn.inner_text()[:50]}'")
            except:
                pass

        # Try to login
        try:
            page.fill('input[name="username"]', REDDIT_USERNAME)
            time.sleep(1)
            page.fill('input[name="password"]', REDDIT_PASSWORD)
            time.sleep(1)
            page.screenshot(path="/tmp/02-filled-login.png")

            # Find submit button
            page.click('button[type="submit"]')
            time.sleep(5)
            page.screenshot(path="/tmp/03-after-login.png")
            print(f"After login URL: {page.url}")
            print(f"After login title: {page.title()}")
        except Exception as e:
            print(f"Login error: {e}")
            # Try alternate login URL
            print("Trying new.reddit login...")
            page.goto("https://www.reddit.com/account/login", wait_until="domcontentloaded")
            time.sleep(3)
            page.screenshot(path="/tmp/01b-login-alt.png")
            print(f"Alt login URL: {page.url}")

        # Step 2: Go to a post and examine comment UI
        print("\nGoing to a test post...")
        page.goto("https://www.reddit.com/r/freelance/comments/1rgk3zv/just_lost_my_biggest_client/", wait_until="domcontentloaded")
        time.sleep(4)
        page.screenshot(path="/tmp/04-post-page.png")
        print(f"Post URL: {page.url}")

        # Scroll to see comments area
        page.keyboard.press("End")
        time.sleep(2)
        page.screenshot(path="/tmp/05-post-scrolled.png")

        # Look for comment elements
        print("\nSearching for comment box elements...")
        selectors = [
            'shreddit-composer',
            '[slot="commentform"]',
            'textarea[placeholder*="comment"]',
            'textarea[placeholder*="Comment"]',
            'div[data-testid="comment-textarea"]',
            'div[contenteditable="true"]',
            '.comment-form',
            'faceplate-form',
            '[name="comment-body"]',
        ]
        for sel in selectors:
            count = page.locator(sel).count()
            if count > 0:
                print(f"  FOUND: {sel} ({count} elements)")
                try:
                    el = page.locator(sel).first
                    print(f"    Visible: {el.is_visible()}")
                    print(f"    Inner HTML preview: {page.inner_html(sel)[:200]}")
                except Exception as ex:
                    print(f"    Error: {ex}")

        # Print all textarea elements
        textareas = page.locator("textarea").all()
        print(f"\nFound {len(textareas)} textarea elements")
        for i, ta in enumerate(textareas):
            try:
                print(f"  Textarea {i}: placeholder='{ta.get_attribute('placeholder')}', visible={ta.is_visible()}")
            except:
                pass

        # Check for "add comment" button or text
        text_elements = page.get_by_text("Add a comment", exact=False).all()
        print(f"\nFound {len(text_elements)} 'Add a comment' elements")

        # Print page source snippet around comment area
        html = page.content()
        if 'comment' in html.lower():
            # Find the position of comment form
            idx = html.lower().find('commentform')
            if idx > 0:
                print(f"\nComment form HTML snippet: {html[max(0,idx-100):idx+500]}")

        browser.close()
        print("\nDone. Screenshots saved to /tmp/")


if __name__ == "__main__":
    main()
