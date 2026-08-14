import subprocess
import json

existing_urls = set()
try:
    with open('scratch/empty_lessons.json') as f:
        lessons = json.load(f)
except:
    lessons = []

# Fetch existing DB URLs
try:
    out = subprocess.check_output(['python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py', 'request', 'GET', '/recommendations/list?limit=200', '--raw'])
    recs = json.loads(out).get('recommendations', [])
    for r in recs:
        if r.get('video_url'): existing_urls.add(r['video_url'])
except Exception as e:
    print("Failed to fetch existing DB recs:", e)

print(f"Loaded {len(existing_urls)} existing URLs from DB")

def check_curl(url):
    cmd = [
        'curl', '-sIL', '-o', '/dev/null', '-w', '%{http_code}',
        '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--max-time', '10', url
    ]
    try:
        res = subprocess.check_output(cmd).decode('utf-8').strip()
        return res
    except Exception as e:
        return 'ERR'

print("Curl test function ready")
