"""Native edges only: canonical clients retain policy and transport ownership."""
from .tools import dispatch, bind_turn

S = {"type": "string"}
I = {"type": "integer"}
B = {"type": "boolean"}
A = {"type": "array", "items": S}
DEFINITIONS = {
    "compass_read": ("Read a narrow live Compass path through the first-party site client. Load the Compass router/owner first. Use field for a bounded projection. No arbitrary origin or SQL.", {"path": S, "field": S}, ["path"]),
    "compass_capabilities": ("Discover a filtered Compass capability once, before an unknown route or mutation. Reuse results within the turn.", {"q": S, "domain": S, "method": {"enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]}}, ["q"]),
    "compass_mutate": ("Execute an explicitly authorized guarded Compass request via /agent/request. Pass method, path, body, stable idempotency_key, verify, and required confirmation/precondition in request. No automatic retries; preserve ambiguous outcomes. Load site-operator first.", {"request": {"type": "object"}}, ["request"]),
    "compass_extract": ("Acquire a complete source using the canonical extract_source.py. Returns hash-verified text and receipt files, not a summary. Captions first; YouTube audio only after proven absence. Does not author or publish. Default audio fallback is off; enable only under media-transcription-systems.", {"source": S, "kind": {"enum": ["auto", "article", "youtube", "audio", "pdf", "epub", "document", "text"]}, "languages": S, "allow_audio": B, "verified_transcript_receipt": S, "canonical_source": S}, ["source"]),
    "compass_pdf_evidence": ("Extract page-anchored PDF text, native annotations, and ink coordinates into local JSON. Optional Arabic/English OCR for empty pages. Handwriting recognition is NOT certified; ink remains marked for vision review. No Compass write.", {"path": S, "ocr": B, "first_page": I, "last_page": I}, ["path"]),
    "compass_notebooklm": ("Use the installed NotebookLM CLI only after its skill routes an explicit task. Exact notebook UUID required except list/create/doctor. Supports safe reads, source add, ask, and explicitly authorized no-wait generation. Never resets conversations, polls, deletes, shares, or writes Compass lifecycle state automatically.", {"action": {"enum": ["doctor", "list", "sources", "artifacts", "source_get", "source_text", "artifact_get", "create", "add_source", "ask", "generate"]}, "notebook_id": S, "source_id": S, "artifact_id": S, "text": S, "source": S, "format": {"enum": ["quiz", "audio", "mind-map", "infographic", "slide-deck", "video", "cinematic-video", "data-table", "report"]}, "prompt_file": S, "language": S}, ["action"]),
    "compass_exa_search": ("Optional Exa discovery, separate from existing default web search. Requires EXA_API_KEY. Returns source links and excerpts, not validated recommendations. Use only for explicit research/recommendations; never sends private Compass context automatically.", {"query": S, "limit": I}, ["query"]),
}

def register(ctx):
    ctx.register_hook("pre_tool_call", bind_turn)
    for name, (description, properties, required) in DEFINITIONS.items():
        def handler(args, _name=name, **kwargs):
            return dispatch(_name, args)
        ctx.register_tool(name=name, toolset="compass_native", schema={"name": name, "description": description, "parameters": {"type": "object", "properties": properties, "required": required, "additionalProperties": False}}, handler=handler)
