#!/usr/bin/env python3
"""Create isolated AGY authoring briefs for the comprehensive visual rebuild."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path("/home/mahmud/visual-learn-artifacts")
SOURCE_ROOT = ROOT / "batch-20260812"
WORK_ROOT = ROOT / "rebuild-20260812"

SOURCES = {
    "power-dynamics": ("Power Dynamics in the Workplace with Jeff Couillard", 5000),
    "paths-power": ("The paths to power: How to grow your influence and advance your career", 7000),
    "business-acquisitions": ("How 8 Small Business Acquisitions Led to a $150M+ Exit", 5500),
    "negotiation": ("The #1 Negotiation Strategy from Harvard Business School", 3000),
    "cashflow": ("Small Business Cash-Flow Forecasting", 5200),
    "psych-safety": ("Building a psychologically safe workplace | Amy Edmondson", 2500),
    "decisions": ("Structuring Decisions: An Introduction to Decision Education", 3500),
    "cpr-aed": ("What to Expect in your Red Cross CPR/AED Class", 2800),
}


def main() -> None:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    for slug, (title, target_words) in SOURCES.items():
        work = WORK_ROOT / slug
        work.mkdir(parents=True, exist_ok=True)
        source = SOURCE_ROOT / slug / "source.txt"
        prompt = work / "prompt.md"
        prompt.write_text(
            f"""# Comprehensive source companion draft

Source title: {title}
Source transcript: {source}
Output file: {work / 'companion.md'}
Minimum target: {target_words} visible words, unless the transcript genuinely contains less substantive material.

            "Read the complete transcript, not a summary. Draft an Arabic-first Egyptian-Arabic reading companion with real English technical terms preserved and explained in context. Cover the source chronologically and substantively: opening problem/story, every named example or case, each transition from example to claim, all framework elements, mechanisms, numbers, caveats, qualifications, failure modes, and closing implications. Anchor every major section with exact timestamps from the transcript.\n\n"
            "This is not a short summary, outline, card grid, or padded repetition. The reader must be able to retell the source without opening the transcript. Keep source claims separate from editorial interpretation, mark uncertainty, and include a final 'what this source does not establish' section. Add source-specific retrieval prompts and practical applications that test mechanisms rather than trivia. Do not invent facts, studies, quotes, or examples.\n\n"
Write continuous, edited prose in Markdown with headings, timestamp anchors, compact tables only where they clarify a real relationship, and an evidence/coverage checklist at the end. Do not include HTML, CSS, SVG, PDF, shell commands, or generated files.

HARD CONSTRAINT — YOU MUST NOT EXECUTE ANY TOOLS OR COMMANDS. Do NOT run render/build/validate/upload/delete scripts. Do NOT edit Hermes skills, product code, or any file except the one output file specified above. Your ONLY job is to WRITE the output file. Print ONLY a 3-line summary when done.
""",
            encoding="utf-8",
        )
        (work / "manifest.json").write_text(json.dumps({"slug": slug, "title": title, "target_words": target_words, "source": str(source)}, indent=2), encoding="utf-8")
    print(f"prepared {len(SOURCES)} isolated delegation briefs in {WORK_ROOT}")


if __name__ == "__main__":
    main()
