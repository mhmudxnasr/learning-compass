import urllib.request
import urllib.error
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

candidates = [
    # Level 0
    {"idx": 1, "lesson_id": "lesson_path_item_1786576305871_c89cb642", "title": "Second-order effects", 
     "urls": [
         "https://link.springer.com/chapter/10.1007/978-3-030-41064-3_3",
         "https://academic.oup.com/bioscience/article/19/12/1103/240562",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC7152349/",
         "https://fs.blog/second-order-thinking/"
     ]},
    {"idx": 2, "lesson_id": "lesson_path_item_1786576306785_19cfee01", "title": "Modeling exercise (L0)",
     "urls": [
         "https://ocw.mit.edu/courses/15-988-system-dynamics-self-study-fall-1998-spring-1999/pages/study-materials/",
         "https://systemdynamics.org/tools/introduction-to-system-dynamics/"
     ]},
    # Level 1
    {"idx": 3, "lesson_id": "lesson_path_item_1786576308278_1aefe328", "title": "Stocks and flows",
     "urls": [
         "https://systemdynamics.org/resources/stocks-and-flows/",
         "https://doi.org/10.1002/sdr.1452",
         "https://mitsloan.mit.edu/faculty/academic-groups/system-dynamics-group"
     ]},
    {"idx": 4, "lesson_id": "lesson_path_item_1786576308492_efc01414", "title": "Patterns over time",
     "urls": [
         "https://waterscenterst.org/systems-thinking-tools-and-strategies/behavior-over-time-graphs-botgs/",
         "https://thesystemsthinker.com/behavior-over-time-graphs-a-key-to-systems-thinking/"
     ]},
    {"idx": 5, "lesson_id": "lesson_path_item_1786576308721_80388df8", "title": "Mental models",
     "urls": [
         "https://thesystemsthinker.com/mental-models-negotiating-reality/",
         "https://doi.org/10.1002/sdr.4260080302"
     ]},
    {"idx": 6, "lesson_id": "lesson_path_item_1786576308937_57d9273a", "title": "Linear versus systemic causality",
     "urls": [
         "https://thesystemsthinker.com/from-linear-to-circular-thinking-a-systems-view/",
         "https://doi.org/10.1002/sres.2185"
     ]},
    {"idx": 7, "lesson_id": "lesson_path_item_1786576309932_21993e58", "title": "Modeling exercise (L1)",
     "urls": [
         "https://thesystemsthinker.com/the-palette-of-systems-thinking-tools/",
         "https://waterscenterst.org/systems-thinking-tools-and-strategies/causal-loop-diagrams-clds/"
     ]},
    {"idx": 8, "lesson_id": "lesson_path_item_1786576310148_3a99f8ad", "title": "One real-world application (L1)",
     "urls": [
         "https://thesystemsthinker.com/system-archetypes-at-a-glance/",
         "https://thesystemsthinker.com/systems-archetypes-i-diagnosing-systemic-issues-and-designing-high-leverage-interventions/"
     ]},
    # Level 2
    {"idx": 9, "lesson_id": "lesson_path_item_1786576311842_3031d6c2", "title": "Exponential growth",
     "urls": [
         "https://thesystemsthinker.com/exponential-growth-the-power-of-reinforcing-loops/",
         "https://albartlett.org/presentations/arithmetic_population_energy.html"
     ]},
    {"idx": 10, "lesson_id": "lesson_path_item_1786576312119_015b2779", "title": "Limits to growth",
     "urls": [
         "https://thesystemsthinker.com/limits-to-success-when-the-best-is-not-enough/",
         "https://www.clubofrome.org/publication/the-limits-to-growth/"
     ]},
    {"idx": 11, "lesson_id": "lesson_path_item_1786576312330_c622ba7e", "title": "Oscillation",
     "urls": [
         "https://thesystemsthinker.com/the-dynamics-of-delay-and-oscillation/",
         "https://doi.org/10.1002/sdr.4260050103"
     ]},
    {"idx": 12, "lesson_id": "lesson_path_item_1786576312587_703cd536", "title": "Overshoot and collapse",
     "urls": [
         "https://thesystemsthinker.com/overshoot-and-collapse/",
         "https://www.resilience.org/stories/2021-07-27/revisiting-limits-to-growth-an-update-and-review/"
     ]},
    {"idx": 13, "lesson_id": "lesson_path_item_1786576312803_db058f86", "title": "Policy resistance (L2)",
     "urls": [
         "https://thesystemsthinker.com/why-programs-fail-policy-resistance-and-unintended-consequences/",
         "https://doi.org/10.1002/sdr.4260100214"
     ]},
    {"idx": 14, "lesson_id": "lesson_path_item_1786576314019_e07c80e6", "title": "Modeling exercise (L2)",
     "urls": [
         "https://thesystemsthinker.com/loop-dominance-and-system-behavior/",
         "https://systemdynamics.org/resources/modeling-guidelines/"
     ]},
    {"idx": 15, "lesson_id": "lesson_path_item_1786576314228_072214e9", "title": "One real-world application (L2)",
     "urls": [
         "https://thesystemsthinker.com/the-beer-game-managing-supply-chains-systemically/",
         "https://mitsloan.mit.edu/teaching-resources-library/beer-game"
     ]}
]

for c in candidates:
    print(f"=== [{c['idx']}] {c['title']} ===")
    for u in c['urls']:
        try:
            req = urllib.request.Request(u, headers=headers)
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                print(f"  OK {resp.status}: {u} -> {resp.geturl()}")
        except Exception as e:
            print(f"  FAIL: {u} ({e})")
