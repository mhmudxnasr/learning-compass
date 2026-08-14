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

def verify_url(url):
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            content = resp.read(15000).decode('utf-8', errors='ignore')
            title_m = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE | re.DOTALL)
            title = title_m.group(1).strip() if title_m else "No title found"
            title = re.sub(r'\s+', ' ', title)
            return True, resp.status, resp.geturl(), title
    except Exception as e:
        return False, 0, str(e), ""

test_dict = {
    # 1. Level 0: Second-order effects
    "L0_second_order": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7152349/",
        "https://fs.blog/second-order-thinking/"
    ],
    # 2. Level 0: Modeling exercise
    "L0_exercise": [
        "https://systemdynamics.org/introduction-to-system-dynamics-modeling/",
        "https://ocw.mit.edu/courses/15-988-system-dynamics-self-study-fall-1998-spring-1999/pages/syllabus/"
    ],
    # 3. Level 1: Stocks and flows
    "L1_stocks_flows": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC9358742/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC3005886/",
        "https://systemdynamics.org/introduction-to-system-dynamics-modeling/"
    ],
    # 4. Level 1: Patterns over time
    "L1_patterns_time": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC8309193/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC5446050/"
    ],
    # 5. Level 1: Mental models
    "L1_mental_models": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7197479/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC4163172/",
        "https://fs.blog/mental-models/"
    ],
    # 6. Level 1: Linear vs systemic causality
    "L1_linear_vs_systemic": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC4163172/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC6486026/"
    ],
    # 7. Level 1: Modeling exercise
    "L1_exercise": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC6013904/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC5894109/"
    ],
    # 8. Level 1: One real-world application
    "L1_application": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7323869/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7098485/"
    ],
    # 9. Level 2: Exponential growth
    "L2_exponential_growth": [
        "https://www.albartlett.org/presentations/arithmetic_population_energy.html",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7270278/"
    ],
    # 10. Level 2: Limits to growth
    "L2_limits_to_growth": [
        "https://www.clubofrome.org/publication/the-limits-to-growth/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC9930777/"
    ],
    # 11. Level 2: Oscillation
    "L2_oscillation": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC2824982/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC4634286/"
    ],
    # 12. Level 2: Overshoot and collapse
    "L2_overshoot_collapse": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC10030275/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7482877/"
    ],
    # 13. Level 2: Policy resistance
    "L2_policy_resistance": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC8900693/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC5568600/"
    ],
    # 14. Level 2: Modeling exercise
    "L2_exercise": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC8268804/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC6486026/"
    ],
    # 15. Level 2: One real-world application
    "L2_application": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC8170281/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7188185/"
    ]
}

results = {}
for k, urls in test_dict.items():
    print(f"Testing {k}...")
    for u in urls:
        ok, status, final_url, title = verify_url(u)
        print(f"  [{ok}] {status} | {u} -> {title[:60]}")
        if ok:
            results[k] = (u, title)
            break

print("\nSummary of successful verified URLs:", len(results))
