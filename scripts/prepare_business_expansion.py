from pathlib import Path

work = Path('/home/mahmud/visual-learn-artifacts/rebuild-20260812/business-acquisitions')
work.joinpath('expansion-prompt.md').write_text(f'''# Missing coverage fragment for a source companion

Read the complete source transcript at /home/mahmud/visual-learn-artifacts/batch-20260812/business-acquisitions/source.txt and the current draft at {work / 'companion.md'}.

Write one new Markdown section to {work / 'expansion.md'} containing at least 1,000 new visible words. Do not summarize what is already covered. Identify under-covered source-grounded material from the middle and closing transcript: named people, exact metrics, failed experiments, acquisition integration details, operating trade-offs, and qualifications. Use exact timestamps and Egyptian-Arabic prose with English technical terms explained in context. End with a short boundary note distinguishing source claims from interpretation. The section must be insertable into the existing companion without duplicating its current headings.

HARD CONSTRAINT — YOU MUST NOT EXECUTE ANY TOOLS OR COMMANDS. Do not render, validate, upload, delete, or edit any file except expansion.md. Your ONLY job is to WRITE expansion.md. Print ONLY a 3-line summary when done.
''', encoding='utf-8')
