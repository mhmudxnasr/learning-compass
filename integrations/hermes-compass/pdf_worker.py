"""Page-anchored evidence extraction, not handwriting interpretation."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import fitz


def extract_pdf(source, destination, first=1, last=0, ocr=True):
    source = Path(source); destination = Path(destination)
    with fitz.open(source) as doc:
        if doc.needs_pass: raise ValueError("Encrypted PDF needs an unlocked user copy")
        last = last or len(doc)
        if not 1 <= first <= last <= len(doc): raise ValueError("Invalid page range")
        if last - first >= 200: raise ValueError("Maximum 200 pages per call; use explicit batches")
        rows = []
        for index in range(first - 1, last):
            page = doc[index]; text = page.get_text(); method = "text-layer"
            if ocr and len(text.strip()) < 30:
                with tempfile.TemporaryDirectory() as directory:
                    image = Path(directory) / "page.png"
                    page.get_pixmap(matrix=fitz.Matrix(2, 2)).save(image)
                    result = subprocess.run(["tesseract", str(image), "stdout", "-l", "ara+eng"], capture_output=True, text=True, timeout=90, check=True)
                    text = result.stdout; method = "tesseract-ara+eng"
            annotations = []
            for annotation in page.annots() or []:
                kind = annotation.type[1]
                record = {"type": kind, "rect": list(annotation.rect), "content_verbatim": annotation.info.get("content", ""), "author": annotation.info.get("title", ""), "vertices": annotation.vertices, "handwriting_status": "requires_vision_review" if kind == "Ink" else "not_applicable"}
                if kind == "Highlight" and annotation.vertices:
                    vertices = annotation.vertices
                    record["highlighted_text"] = " ".join(page.get_textbox(fitz.Quad(vertices[n:n+4]).rect) for n in range(0, len(vertices), 4))
                annotations.append(record)
            rows.append({"page": index + 1, "text": text, "method": method, "ocr_verified": False if method.startswith("tesseract") else None, "annotations": annotations})
        payload = {"schema": "compass-pdf-evidence/v1", "source": str(source), "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "total_pages": len(doc), "first_page": first, "last_page": last, "whole_document": first == 1 and last == len(doc), "pages": rows, "handwriting_policy": "Ink is preserved as coordinates; OCR is uncertain machine text, never verified verbatim handwriting."}
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    return {"ok": True, "path": str(destination), "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "pages_extracted": len(rows), "total_pages": payload["total_pages"], "annotations": sum(len(row["annotations"]) for row in rows), "ocr_pages": sum(row["method"].startswith("tesseract") for row in rows), "whole_document": payload["whole_document"]}


if __name__ == "__main__":
    print(json.dumps(extract_pdf(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5] == "ocr")))
