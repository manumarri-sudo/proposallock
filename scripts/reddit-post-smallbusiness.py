#!/usr/bin/env python3
"""Post to r/smallbusiness using old Reddit form API (no OAuth needed).
Usage: REDDIT_PASSWORD=xxx python3 reddit-post-smallbusiness.py
"""
import os
import sys
import json
import time
import urllib.request
import urllib.parse
import urllib.error

USERNAME = "launchstack"
PASSWORD = os.environ.get("REDDIT_PASSWORD", "")
SUBREDDIT = "smallbusiness"

TITLE = "Anyone keep track of how much you've lost to clients who ghosted after delivery?"

BODY = """I started doing this last year because I wanted to actually know the number. Not guess. Know.

In 18 months I've had four clients receive completed work and then just disappear. Total unpaid: $7,400.

One of them gave specific feedback on revisions. Complimented the final product in writing. Said payment was coming "this week." Then stopped opening emails.

I also tracked the time I spend chasing invoices. Works out to about 2.5 hours per week across all active clients. That's 130 hours a year. Three full work weeks of "hi, just checking in on that invoice" emails.

The part I kept coming back to is that I designed this situation myself. I was sending deliverables and then invoicing. From the client's perspective -- they already had everything they needed. The incentive to pay was just goodwill, I guess.

I've been experimenting with flipping the workflow. Send a preview, not the full deliverables. Payment clears, then full files release. Curious if others have done this and how it went with clients.

The standard advice is "get a 50% deposit," but that still leaves you sending the other half on faith.

What's actually working for you?"""

def make_request(url, data=None, headers=None, cookie_jar=None):
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
    }
    if headers:
        req_headers.update(headers)
    if cookie_jar:
        req_headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookie_jar.items())

    if data:
        encoded = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(url, data=encoded, headers=req_headers, method="POST")
    else:
        req = urllib.request.Request(url, headers=req_headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            cookies = {}
            set_cookie = resp.getheader("Set-Cookie")
            if set_cookie:
                for part in set_cookie.split(";"):
                    part = part.strip()
                    if "=" in part and not any(k in part.lower() for k in ["path", "domain", "expires", "httponly", "secure", "samesite", "max-age"]):
                        k, v = part.split("=", 1)
                        cookies[k.strip()] = v.strip()
            return resp.status, body, cookies
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8"), {}


def login(username, password):
    print(f"Logging in as u/{username}...")
    status, body, cookies = make_request(
        "https://old.reddit.com/api/login",
        data={
            "user": username,
            "passwd": password,
            "api_type": "json",
            "rem": "false",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    print(f"  Login status: {status}")
    try:
        result = json.loads(body)
        errors = result.get("json", {}).get("errors", [])
        if errors:
            print(f"  Errors: {errors}")
            return None, None
        modhash = result.get("json", {}).get("data", {}).get("modhash", "")
        # reddit_session cookie comes from cookie header
        session_cookie = cookies.get("reddit_session", "")
        print(f"  Modhash: {modhash[:10]}..." if modhash else "  No modhash")
        print(f"  Session cookie: {'found' if session_cookie else 'missing'}")
        return modhash, cookies
    except json.JSONDecodeError:
        print(f"  Non-JSON response: {body[:200]}")
        return None, None


def submit_post(modhash, cookies, subreddit, title, text):
    print(f"Submitting to r/{subreddit}...")
    status, body, _ = make_request(
        "https://old.reddit.com/api/submit",
        data={
            "api_type": "json",
            "kind": "self",
            "sr": subreddit,
            "title": title,
            "text": text,
            "uh": modhash,
            "resubmit": "true",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        cookie_jar=cookies
    )
    print(f"  Submit status: {status}")
    try:
        result = json.loads(body)
        errors = result.get("json", {}).get("errors", [])
        if errors:
            print(f"  Errors: {errors}")
            return None
        url = result.get("json", {}).get("data", {}).get("url", "")
        post_id = result.get("json", {}).get("data", {}).get("id", "")
        print(f"  Post URL: {url}")
        print(f"  Post ID: {post_id}")
        return url
    except json.JSONDecodeError:
        print(f"  Non-JSON: {body[:300]}")
        return None


def verify_post(post_url):
    """Verify removed_by_category is null via JSON API."""
    json_url = post_url.rstrip("/") + "/.json"
    print(f"Verifying: {json_url}")
    status, body, _ = make_request(json_url)
    try:
        data = json.loads(body)
        post = data[0]["data"]["children"][0]["data"]
        removed_by = post.get("removed_by_category")
        score = post.get("score", 0)
        selftext = post.get("selftext", "")[:50]
        print(f"  removed_by_category: {removed_by}")
        print(f"  score: {score}")
        print(f"  selftext: {selftext}")
        return removed_by is None and selftext != "[removed]"
    except Exception as e:
        print(f"  Verify error: {e}")
        return False


if __name__ == "__main__":
    if not PASSWORD:
        print("ERROR: REDDIT_PASSWORD not set")
        sys.exit(1)

    modhash, cookies = login(USERNAME, PASSWORD)
    if not modhash:
        print("Login failed")
        sys.exit(1)

    time.sleep(2)
    post_url = submit_post(modhash, cookies, SUBREDDIT, TITLE, BODY)
    if not post_url:
        print("Submission failed")
        sys.exit(1)

    time.sleep(5)
    is_live = verify_post(post_url)
    if is_live:
        print(f"\nSUCCESS: Post is LIVE at {post_url}")
    else:
        print(f"\nWARNING: Post may have been removed at {post_url}")

    sys.exit(0 if is_live else 1)
