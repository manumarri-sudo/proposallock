#!/usr/bin/env python3
"""Debug Reddit login page selectors with stealth mode."""
import os
import time
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

USERNAME = os.environ.get("REDDIT_USERNAME", "")
PASSWORD = os.environ.get("REDDIT_PASSWORD", "")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 800}
    )
    page = context.new_page()
    Stealth().apply_stealth_sync(page)

    print("Navigating to Reddit login...")
    page.goto("https://www.reddit.com/login/", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    print(f"URL: {page.url}")
    print(f"Title: {page.title()}")

    body_text = page.inner_text("body")[:300]
    print(f"Page body: {body_text}")

    inputs = page.locator("input").all()
    print(f"\nFound {len(inputs)} input elements:")
    for i, inp in enumerate(inputs):
        try:
            attrs = {
                'type': inp.get_attribute('type'),
                'name': inp.get_attribute('name'),
                'id': inp.get_attribute('id'),
                'placeholder': inp.get_attribute('placeholder'),
            }
            print(f"  [{i}] {attrs}")
        except Exception as e:
            print(f"  [{i}] error: {e}")

    page.screenshot(path="/tmp/reddit-login-stealth.png")
    print("\nScreenshot saved to /tmp/reddit-login-stealth.png")
    browser.close()
