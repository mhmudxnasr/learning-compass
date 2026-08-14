import urllib.request
import urllib.error
import ssl
import json
import time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

def verify_url(url):
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            status = resp.status
            final_url = resp.geturl()
            content_type = resp.headers.get('Content-Type', '')
            return True, status, final_url, content_type
    except urllib.error.HTTPError as e:
        # Some academic servers return 403 to bots or require specific headers, but 200/301/302 are standard
        return False, e.code, str(e), ''
    except Exception as e:
        return False, 0, str(e), ''

# Test candidates
print("Script template ready")
