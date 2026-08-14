import urllib.request
import urllib.error
import ssl
import json
import re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

def verify(url):
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            content = resp.read(15000).decode('utf-8', errors='ignore')
            title_m = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE | re.DOTALL)
            title = title_m.group(1).strip() if title_m else ""
            title = re.sub(r'\s+', ' ', title)
            return True, resp.status, resp.geturl(), title
    except Exception as e:
        return False, 0, str(e), ""

# Let's test specific candidates
test_candidates = [
    ("L0_second_order", "https://fs.blog/second-order-thinking/"),
    ("L0_exercise", "https://systemdynamics.org/introduction-to-system-dynamics-modeling/"),
    ("L1_stocks_flows", "https://ocw.mit.edu/courses/15-988-system-dynamics-self-study-fall-1998-spring-1999/pages/readings/"),
    ("L1_mental_models", "https://fs.blog/mental-models/"),
    ("L2_exponential_growth", "https://www.albartlett.org/presentations/arithmetic_population_energy.html"),
    ("L2_limits_to_growth", "https://www.clubofrome.org/publication/the-limits-to-growth/"),
    ("L4_paradigms", "https://donellameadows.org/archives/dancing-with-systems/"),
    ("L6_network_science", "http://networksciencebook.com/"),
    ("L6_abm", "https://www.complexityexplorer.org/courses/169-introduction-to-agent-based-modeling")
]

for name, url in test_candidates:
    ok, status, final_url, title = verify(url)
    print(f"[{ok}] {status} | {name}: {url} -> {title[:60]}")
