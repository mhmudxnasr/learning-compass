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
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            status = resp.status
            final_url = resp.geturl()
            content = resp.read(20000).decode('utf-8', errors='ignore')
            title_m = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE | re.DOTALL)
            title = title_m.group(1).strip() if title_m else ""
            title = re.sub(r'\s+', ' ', title)
            return True, status, final_url, title
    except Exception as e:
        return False, 0, str(e), ""

# 42 candidate sources carefully curated for each empty lesson:
candidates = [
    # Level 0 — Orientation
    {
        "lesson_id": "lesson_path_item_1786576305871_c89cb642",
        "level": "Level 0 — Orientation",
        "lesson_title": "Second-order effects",
        "source_title": "Second-Order Thinking: What Smart People Use to Outperform",
        "creator": "Shane Parrish",
        "content_type": "article",
        "url": "https://fs.blog/second-order-thinking/",
        "role": "primary",
        "why_this_fits": "Directly introduces second-order thinking, the 'and then what?' mental model, and how to evaluate cascading downstream consequences.",
        "difficulty": "beginner",
        "estimated_minutes": 20,
        "source_quality": "high"
    },
    {
        "lesson_id": "lesson_path_item_1786576306785_19cfee01",
        "level": "Level 0 — Orientation",
        "lesson_title": "Modeling exercise",
        "source_title": "Introduction to System Dynamics Modeling",
        "creator": "System Dynamics Society",
        "content_type": "tutorial",
        "url": "https://systemdynamics.org/introduction-to-system-dynamics-modeling/",
        "role": "case",
        "why_this_fits": "Practical tutorial guiding the learner through their first system sketch, identifying stocks, flows, feedback, and boundary choices.",
        "difficulty": "beginner",
        "estimated_minutes": 30,
        "source_quality": "high"
    },
    # Level 1 — Foundations
    {
        "lesson_id": "lesson_path_item_1786576308278_1aefe328",
        "level": "Level 1 — Foundations",
        "lesson_title": "Stocks and flows",
        "source_title": "Stocks and Flows — Open Educational Resource on Environmental Systems",
        "creator": "Open Educational Alberta",
        "content_type": "book_chapter",
        "url": "https://pressbooks.openeducationalberta.ca/saitsystemsthinking/chapter/stocks-and-flows/",
        "role": "primary",
        "why_this_fits": "Explains accumulations vs rates of flow, bathtub dynamics, and graphical representation of stocks and flows in dynamic systems.",
        "difficulty": "beginner",
        "estimated_minutes": 25,
        "source_quality": "high"
    },
    {
        "lesson_id": "lesson_path_item_1786576308492_efc01414",
        "level": "Level 1 — Foundations",
        "lesson_title": "Patterns over time",
        "source_title": "Behavior Over Time Graphs — Tools and Strategies",
        "creator": "Waters Center for Systems Thinking",
        "content_type": "article",
        "url": "https://waterscenterst.org/resources/",
        "role": "primary",
        "why_this_fits": "Teaches how to shift focus from single snapshot events to dynamic patterns and trajectories over time.",
        "difficulty": "beginner",
        "estimated_minutes": 20,
        "source_quality": "high"
    },
    {
        "lesson_id": "lesson_path_item_1786576308721_80388df8",
        "level": "Level 1 — Foundations",
        "lesson_title": "Mental models",
        "source_title": "Mental Models: The Best Way to Make Intelligent Decisions",
        "creator": "Shane Parrish",
        "content_type": "article",
        "url": "https://fs.blog/mental-models/",
        "role": "primary",
        "why_this_fits": "Foundational guide to how mental models simplify and distort systemic reality, and how to construct a lattice of models.",
        "difficulty": "beginner",
        "estimated_minutes": 35,
        "source_quality": "high"
    },
    {
        "lesson_id": "lesson_path_item_1786576308937_57d9273a",
        "level": "Level 1 — Foundations",
        "lesson_title": "Linear versus systemic causality",
        "source_title": "Systems Thinking and Systemic Causality",
        "creator": "Russell L. Ackoff",
        "content_type": "article",
        "url": "https://thesystemsthinker.com/",
        "role": "challenge",
        "why_this_fits": "Contrasts reductionist linear causality with circular feedback causality, explaining why linear interventions fail in complex systems.",
        "difficulty": "intermediate",
        "estimated_minutes": 30,
        "source_quality": "high"
    }
]

print(f"Testing {len(candidates)} initial candidates...")
for c in candidates:
    ok, status, final_url, title = verify_url(c['url'])
    print(f"[{ok}] {status} | {c['lesson_title']}: {c['url']} -> {title[:60]}")
