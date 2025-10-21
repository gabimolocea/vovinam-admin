#!/usr/bin/env python3
"""
Simple smoke test: GET /api/ and exit 0 on HTTP 200, non-zero otherwise.

Usage:
  From repo root (uses the backend venv python):
    .\venv\Scripts\python.exe .\scripts\smoke_test.py

Or with curl:
  curl -i http://127.0.0.1:8000/api/
"""
import sys
import urllib.request
import urllib.error

URLS = [
    "http://127.0.0.1:8000/health/",
    "http://127.0.0.1:8000/api/",
    "http://127.0.0.1:8000/",
]

def try_url(url):
    req = urllib.request.Request(url, headers={"User-Agent": "smoke-test/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.getcode()
            body = resp.read(500).decode('utf-8', errors='replace')
            print(f"GET {url} -> {status}")
            print("--- response preview ---")
            print(body)
            return status
    except urllib.error.HTTPError as e:
        print(f"GET {url} -> HTTPError: {e.code} {e.reason}")
        return e.code
    except urllib.error.URLError as e:
        print(f"GET {url} -> URLError: {e.reason}")
        return None
    except Exception as e:
        print(f"GET {url} -> Error: {e}")
        return None


def main():
    for url in URLS:
        status = try_url(url)
        if status == 200:
            print("Smoke test PASSED")
            return 0
    print("Smoke test FAILED: none of the URLs returned 200")
    return 2

if __name__ == '__main__':
    sys.exit(main())
