#!/usr/bin/env python3
"""Repair the 2026-08-12 visual batch without touching the canonical site.

This is intentionally a small, deterministic repair pass: it keeps the mined
source prose and embedded assets, but removes the generic retrieval-question
copy and repairs manifest provenance/placement metadata before re-rendering.
The caller must still run the critic, full artifact validator, PDF inspection,
and serialized upload/delete workflow.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path("/home/mahmud/visual-learn-artifacts")
DATA = {
    "power-dynamics": (
        ["إزاي تعريف Power هنا يغيّر تشخيصك لتعطيل قرار؟", "إيه الفرق العملي بين Role Power وResource Power في الموقف؟", "إزاي ممكن يتحول توزيع السلطة إلى Burnout؟", "مين صاحب النفوذ الناقص في قرار متعطل، وإيه التجربة الآمنة لاختباره؟"],
        ["diagram", "comparison", "causal_diagram", "process_flow"],
        "medium: definition → power forms → burnout mechanism → workplace diagnosis",
    ),
    "paths-power": (
        ["إيه القاعدة الأولى التي تمنعك من تعطيل نفوذك بنفسك؟", "إزاي يتغير سلوكك لو اعتبرت Power وصفاً للواقع لا حكماً أخلاقياً؟", "إيه الذي يجعل Brand اختصاراً لتوقع الآخرين منك؟", "إيه علاقة ضعيفة واحدة ستبنيها بقيمة محددة هذا الأسبوع؟"],
        ["process_flow", "causal_diagram", "comparison", "process_flow"],
        "long: seven rules → ethical tension → brand/network mechanism → weekly experiment",
    ),
    "business-acquisitions": (
        ["إيه الإشارة في retention التي كشفت أن هذا cohort business مختلف؟", "إزاي يشتغل Brand وcommunity كـ moat بدلاً من مجرد تسويق؟", "إيه ترتيب الانتقال من niche إلى acquisition في القصة؟", "إيه اختبار integration الذي يجب أن يسبق صفقة جديدة؟"],
        ["data_visualization", "comparison", "timeline", "process_flow"],
        "long: retention signal → moat → acquisition chronology → integration test",
    ),
    "negotiation": (
        ["ليه يبدأ التفاوض من setup والمصالح قبل السعر؟", "إيه القيمة الجديدة التي يمكن خلقها قبل تقسيمها؟", "مين صاحب القرار وما البديل الحقيقي لكل طرف؟", "إيه معلومة ناقصة ستجمعها قبل تقديم أي offer؟"],
        ["process_flow", "causal_diagram", "comparison", "process_flow"],
        "short: preparation → value creation → decision structure → pre-offer checklist",
    ),
    "cashflow": (
        ["إزاي يختلف cash received عن invoice issued في التنبؤ؟", "إيه مكونات forecast الأسبوعي القابل للتحديث؟", "أي افتراض يضغط على cash buffer في downside scenario؟", "إيه المصروف الذي ستؤجله أو تلغيه إذا ظهر أسوأ رصيد قادم؟"],
        ["causal_diagram", "process_flow", "comparison", "process_flow"],
        "long: cash timing → forecast construction → scenarios → operating decision",
    ),
    "psych-safety": (
        ["إيه التكلفة الاجتماعية التي جعلت الممرضة تختار الصمت؟", "إزاي يعمل Impression Management ضد التعلم؟", "إيه الذي يميز Psychological Safety عن الراحة أو غياب accountability؟", "ما السؤال الذي ستفتتح به مراجعة لكشف weak signals؟"],
        ["case_study", "causal_diagram", "comparison", "process_flow"],
        "short: concrete cases → silence mechanism → precise definition → team protocol",
    ),
    "decisions": (
        ["إيه الذي يجعل gut feeling غير قابل للفحص وحده؟", "كيف تكشف الأهداف والبدائل ما يخفيه الانطباع الأول؟", "إزاي تفصل بين جودة القرار ونتيجة سبّبها الحظ؟", "أي قرار يستحق process أكبر، وأي قرار لا يستحق committee؟"],
        ["causal_diagram", "process_flow", "comparison", "decision_tree"],
        "medium: why structure → objectives/options → luck boundary → proportional use",
    ),
    "cpr-aed": (
        ["إيه الذي لا تثبته مشاهدة الفيديو وحدها في مهارة CPR/AED؟", "إزاي يختلف instructor-led عن blended learning؟", "ما الحد الذي يجعل التسجيل الرسمي والتدريب العملي ضروريين؟", "ما الذي يجب مراجعته من Red Cross الحالي قبل أي إجراء؟"],
        ["process_flow", "comparison", "boundary", "boundary"],
        "micro: learning pathway → delivery modes → certification boundary → current-guidance caveat",
    ),
}


class VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"style", "script"}:
            self.hidden += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"style", "script"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def repair(slug: str) -> None:
    questions, types, density = DATA[slug]
    directory = ROOT / slug
    html_path = directory / f"{slug}.html"
    html = html_path.read_text(encoding="utf-8")
    marker = "سؤال استرجاع:</strong>"
    cursor = 0
    for question in questions:
        pos = html.find(marker, cursor)
        if pos < 0:
            raise RuntimeError(f"{slug}: expected four retrieval prompts")
        start = pos + len(marker)
        end = html.find("<br", start)
        if end < 0:
            raise RuntimeError(f"{slug}: malformed retrieval prompt")
        html = html[:start] + " " + question + html[end:]
        cursor = end + 3
    html_path.write_text(html, encoding="utf-8")

    parser = VisibleText()
    parser.feed(html)
    word_count = len(re.findall(r"\b[\w’'-]+\b", " ".join(parser.parts)))
    html = re.sub(r'(<meta\s+name=["\']word-count["\']\s+content=["\'])\d+(["\'])', rf'\g<1>{word_count}\g<2>', html, count=1, flags=re.I)
    html_path.write_text(html, encoding="utf-8")

    manifest_path = directory / "images.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    visuals = manifest.get("visuals", [])
    if len(visuals) != 4:
        raise RuntimeError(f"{slug}: expected four source-specific visuals, got {len(visuals)}")
    for index, visual in enumerate(visuals):
        visual["type"] = types[index]
        visual["claim_ids"] = [f"claim-{index + 1}"]
        visual["placement"] = {"section_id": f"section-{index + 1}", "order": 0, "required": True}
    manifest["visual_plan"] = {
        "density": density,
        "selection_rationale": "Each visual maps one distinct source claim and is used once in the corresponding source section.",
    }
    manifest["critic"] = {"status": "not_run", "defects": []}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    for slug in DATA:
        repair(slug)
    print(f"repaired {len(DATA)} source workspaces")
