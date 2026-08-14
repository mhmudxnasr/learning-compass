import json
import time
import subprocess

with open('scratch/curated_42_items.json') as f:
    items = json.load(f)

thread_id = "thread_1786576304649_69e7c056"
now_ts = int(time.time() * 1000)

push_payload = []
for idx, it in enumerate(items):
    rec_id = f"rec_{now_ts}_{idx+1:02d}_sys"
    it['rec_id'] = rec_id
    push_payload.append({
        "id": rec_id,
        "video_title": it['source_title'],
        "creator": it['creator'],
        "content_type": it['content_type'],
        "video_url": it['url'],
        "why_this": it['why_this_fits'],
        "context_brief": f"Curated for {it['level']} lesson '{it['lesson_title']}': {it['why_this_fits']}",
        "status": "active",
        "verified": "2026-08-14"
    })

print(f"Pushing {len(push_payload)} recommendations...")

# Call /recommendations/push using site_request.py
push_cmd = [
    'python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py',
    'request', 'POST', '/recommendations/push', json.dumps(push_payload), '--raw'
]
push_res = subprocess.check_output(push_cmd).decode('utf-8')
print("Push response:", push_res)

# Now attach each recommendation to its lesson
print("\nAttaching sources to lessons...")
attached_count = 0
for idx, it in enumerate(items):
    lesson_id = it['lesson_id']
    rec_id = it['rec_id']
    role = it.get('role', 'primary')
    
    attach_body = {
        "recommendation_id": rec_id,
        "role": role,
        "position": 0
    }
    
    attach_cmd = [
        'python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py',
        'request', 'POST', f'/learning/core/threads/{thread_id}/lessons/{lesson_id}/sources',
        json.dumps(attach_body), '--raw'
    ]
    try:
        attach_res = subprocess.check_output(attach_cmd).decode('utf-8')
        attached_count += 1
        print(f"[{idx+1:02d}/42] Attached {rec_id} ({role}) to {it['lesson_title']} ({lesson_id}) -> {attach_res.strip()}")
    except Exception as e:
        print(f"[{idx+1:02d}/42] FAILED attaching to {lesson_id}: {e}")

print(f"\nTotal attached: {attached_count}/42")

# Save updated items with rec_id
with open('scratch/curated_42_items_attached.json', 'w') as f:
    json.dump(items, f, indent=2)
