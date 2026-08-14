import subprocess
import json

thread_id = "thread_1786576304649_69e7c056"

# Re-read the thread path
path_cmd = [
    'python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py',
    'request', 'GET', f'/learning/core/threads/{thread_id}/path', '--raw'
]
path_out = subprocess.check_output(path_cmd).decode('utf-8')
path_data = json.loads(path_out)

stages = path_data.get('stages', [])
print(f"Total Stages in Thread: {len(stages)}")

total_lessons = 0
lessons_with_sources = 0
lessons_without_sources = 0
all_attached_sources = []
empty_lessons = []

for s_idx, s in enumerate(stages):
    s_title = s.get('title')
    lessons = s.get('lessons', [])
    print(f"\nStage {s_idx}: {s_title} ({len(lessons)} lessons)")
    for l_idx, l in enumerate(lessons):
        total_lessons += 1
        sources = l.get('sources', [])
        if sources:
            lessons_with_sources += 1
            src_info = ", ".join([f"{src.get('recommendation_id')} ({src.get('role')})" for src in sources])
            print(f"  [OK] L{l_idx+1:02d}: {l['title']} -> {src_info}")
            for src in sources:
                all_attached_sources.append({
                    "stage_index": s_idx,
                    "stage_title": s_title,
                    "lesson_id": l['id'],
                    "lesson_title": l['title'],
                    "rec_id": src.get('recommendation_id'),
                    "role": src.get('role'),
                    "video_url": src.get('video_url'),
                    "title": src.get('title')
                })
        else:
            lessons_without_sources += 1
            empty_lessons.append((s_idx, s_title, l['id'], l['title']))
            print(f"  [EMPTY] L{l_idx+1:02d}: {l['title']} ({l['id']})")

print("\n" + "="*80)
print(f"FINAL AUDIT RESULTS:")
print(f"Total lessons in thread: {total_lessons}")
print(f"Lessons with sources: {lessons_with_sources}")
print(f"Lessons without sources: {lessons_without_sources}")
print(f"Total attached sources across all lessons: {len(all_attached_sources)}")
print("="*80)

if lessons_without_sources > 0:
    print("UNRESOLVED LESSONS:")
    for el in empty_lessons:
        print(f"  Stage {el[0]} ({el[1]}): {el[3]} ({el[2]})")
else:
    print("SUCCESS: 100% OF LESSONS (71/71) NOW HAVE ATTACHED SOURCES!")
