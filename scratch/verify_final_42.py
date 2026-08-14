import subprocess
import json

def check_curl(url):
    cmd = [
        'curl', '-sIL', '-o', '/dev/null', '-w', '%{http_code}',
        '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--max-time', '12', url
    ]
    try:
        res = subprocess.check_output(cmd).decode('utf-8').strip()
        return res
    except Exception as e:
        return 'ERR'

with open('scratch/curated_42_items.json') as f:
    items = json.load(f)

# Update item 11 (Oscillation)
for it in items:
    if it['lesson_id'] == 'lesson_path_item_1786576312330_c622ba7e':
        it['source_title'] = "Chaos and Nonlinear Dynamics in Systems"
        it['creator'] = "Stanford Encyclopedia of Philosophy"
        it['content_type'] = "article"
        it['url'] = "https://plato.stanford.edu/entries/chaos/"
        it['why_this_fits'] = "Provides a rigorous foundation for oscillatory behavior, periodic attractors, feedback delays, and nonlinear dynamical instability."

with open('scratch/curated_42_items.json', 'w') as f:
    json.dump(items, f, indent=2)

# Verify all 42
failed = []
urls_seen = set()
lesson_ids_seen = set()

# Get existing DB URLs
out = subprocess.check_output(['python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py', 'request', 'GET', '/recommendations/list?limit=200', '--raw'])
recs = json.loads(out).get('recommendations', [])
existing_urls = set(r.get('video_url') for r in recs if r.get('video_url'))

path_out = subprocess.check_output(['python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py', 'request', 'GET', '/learning/core/threads/thread_1786576304649_69e7c056/path', '--raw'])
path_data = json.loads(path_out)
for s in path_data.get('stages', []):
    for src in s.get('sources', []):
        if src.get('video_url'): existing_urls.add(src['video_url'])
    for l in s.get('lessons', []):
        for src in l.get('sources', []):
            if src.get('video_url'): existing_urls.add(src['video_url'])

print(f"Checking {len(items)} items against {len(existing_urls)} existing DB URLs...")

for idx, it in enumerate(items):
    u = it['url']
    lid = it['lesson_id']
    if u in urls_seen:
        print(f"DUPLICATE URL: {u}")
        failed.append((idx+1, it['lesson_title'], u, "DUPLICATE_URL"))
    if u in existing_urls:
        print(f"URL ALREADY IN DB: {u}")
        failed.append((idx+1, it['lesson_title'], u, "URL_ALREADY_IN_DB"))
    if lid in lesson_ids_seen:
        print(f"DUPLICATE LESSON ID: {lid}")
        failed.append((idx+1, it['lesson_title'], u, "DUPLICATE_LESSON_ID"))
    
    urls_seen.add(u)
    lesson_ids_seen.add(lid)
    code = check_curl(u)
    if code != "200":
        failed.append((idx+1, it['lesson_title'], u, f"HTTP_{code}"))
    print(f"[{idx+1:02d}/42] HTTP {code} | {it['level']} -> {it['lesson_title']}: {it['source_title']} ({u})")

print(f"\nFinal verification summary: Success={42 - len(failed)}/42, Failed={len(failed)}")
if failed:
    for f in failed:
        print("  FAIL:", f)
    exit(1)
else:
    print("ALL 42 SOURCES VERIFIED 100% OK!")
