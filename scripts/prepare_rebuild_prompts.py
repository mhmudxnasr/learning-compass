#!/usr/bin/env python3
"""Prepare focused rewrite/expansion briefs after inspecting delegated drafts."""
from pathlib import Path

ROOT = Path('/home/mahmud/visual-learn-artifacts')
SOURCE = ROOT / 'batch-20260812'
WORK = ROOT / 'rebuild-20260812'
TARGETS = {
    'paths-power': 7000,
    'business-acquisitions': 6200,
    'cashflow': 5200,
    'negotiation': 3000,
    'psych-safety': 2500,
    'decisions': 3500,
    'cpr-aed': 2800,
}

for slug, target in TARGETS.items():
    draft = WORK / slug / 'companion.md'
    prompt = WORK / slug / 'prompt.md'
    mode = 'Rewrite and expand the existing draft' if draft.exists() else 'Create the draft from scratch'
    prompt.write_text(f'''# Comprehensive source companion rebuild

Source transcript: {SOURCE / slug / 'source.txt'}
Existing draft (if present): {draft}
Output file: {draft}
Minimum visible-word target: {target}

{mode}. Read the complete transcript and the existing draft before writing. The previous draft was rejected if it was below the target or compressed major portions of the source. Cover the complete chronology and every substantive section: opening problem, all named people/examples/cases, exact figures, transitions, mechanisms, framework elements, counterpoints, qualifications, failure modes, Q&A where present, closing implication, and what the source does not establish. Preserve exact timestamp anchors.

Write Arabic-first Egyptian-Arabic prose with English technical terms preserved and explained naturally. Expand missing source material with new source-grounded narrative, not repetition or invented filler. The reader must be able to retell the source without the transcript. Include source-specific retrieval prompts, practical applications, and an evidence/coverage checklist. Keep source claims separate from editorial interpretation. Markdown only; do not create HTML/PDF/SVG, run commands, render, validate, upload, delete, or edit any other file.

HARD CONSTRAINT — YOU MUST NOT EXECUTE ANY TOOLS OR COMMANDS. Your ONLY job is to WRITE the one output file specified above. Print ONLY a 3-line summary when done.
''', encoding='utf-8')
print(f'prepared {len(TARGETS)} rebuild prompts')
