"""Bounded, shell-free wrappers. Never bypass the canonical Worker guard."""
from __future__ import annotations
import hashlib
from contextvars import ContextVar
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError

HOME = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))).resolve()
SITE = HOME / "skills/workflow/learning-compass-site-operator/scripts/site_request.py"
EXTRACT = HOME / "skills/lite-visual/scripts/extract_source.py"
PYTHON = str(Path.home() / ".local/bin/python") if (Path.home() / ".local/bin/python").exists() else "python3"
NOTEBOOK = str(Path.home() / ".local/bin/notebooklm")
LIMIT = 12000
TURN = ContextVar("compass_native_turn", default=None)

def bind_turn(*, turn_id="", session_id="", **kwargs):
    identity = hashlib.sha256((str(session_id) + ":" + str(turn_id)).encode()).hexdigest() if turn_id else None
    TURN.set("compass-" + identity if identity else None)

def child_env():
    env = dict(os.environ)
    if "HERMES_TURN_ID" not in env and TURN.get(): env["HERMES_TURN_ID"] = TURN.get()
    return env

UUID = re.compile(r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$", re.I)


def client():
    name = "compass_native_site_client"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, SITE)
        if spec is None or spec.loader is None:
            raise ValueError("First-party site client unavailable")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
    return sys.modules[name]


def redact(data):
    return client().redact(data, tuple(v for k, v in os.environ.items() if v and len(v) > 7 and any(x in k.upper() for x in ("TOKEN", "SECRET", "API_KEY", "PASSWORD"))))


def workspace():
    base = HOME / "cache/compass-native"
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    return Path(tempfile.mkdtemp(prefix="run-", dir=base))


def local_file(value):
    p = Path(value).expanduser().resolve(strict=True)
    # Explicit artifact inputs only, never credentials or configuration.
    if not p.is_file() or p.name in {".env", "config.yaml", "auth.json", "storage_state.json"} or any(part in {".ssh", ".gnupg", ".notebooklm"} for part in p.parts):
        raise ValueError("Input is not an allowed source/artifact file")
    return p


def run(argv, *, timeout=120, input_text=None):
    """Disk-backed output bounds RAM; kill the whole process group on timeout."""
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        p = subprocess.Popen(argv, stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True, env=child_env())
        try:
            p.communicate(None if input_text is None else input_text.encode(), timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid, signal.SIGKILL)
            p.wait()
            return {"ok": False, "error": "timeout", "mutation_outcome_unknown": True, "retry": False}
        out.seek(0); raw = out.read(LIMIT + 1)
        err.seek(0); error = err.read(2000).decode("utf-8", "replace")
        if len(raw) > LIMIT:
            return {"ok": False, "exit_code": p.returncode, "error": "output_limit", "output_truncated": True, "hint": "Use a narrower query/projection; do not rerun a mutation."}
        text = raw.decode("utf-8", "replace").strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = {"text": text}
        return {"ok": p.returncode == 0, "exit_code": p.returncode, "data": data, **({"stderr": error} if p.returncode else {})}


def read(args):
    c = client(); c.validate_path(args["path"])
    argv = [PYTHON, str(SITE), "request", "GET", args["path"]]
    if args.get("field"):
        argv += ["--field", args["field"]]
    return run(argv)


def capabilities(args):
    argv = [PYTHON, str(SITE), "capabilities", "--q", args["q"]]
    for key in ("domain", "method"):
        if args.get(key): argv += ["--" + key, args[key]]
    return run(argv)


def mutate(args):
    payload = client().validate_mutation_payload(args["request"])
    with tempfile.TemporaryDirectory(prefix="compass-request-") as directory:
        path = Path(directory) / "request.json"
        path.write_text(json.dumps(payload, ensure_ascii=False)); path.chmod(0o600)
        return run([PYTHON, str(SITE), "mutate", "@" + str(path)], timeout=300)


def extract(args):
    source = args["source"]
    if not source.startswith(("https://", "http://")):
        source = str(local_file(source))
    work = workspace(); text = work / "source.txt"; receipt = work / "source-extraction.json"
    argv = [PYTHON, str(EXTRACT), source, "--kind", args.get("kind", "auto"), "--output", str(text), "--manifest", str(receipt), "--languages", args.get("languages", "ar,ar-SA,ar-EG,en")]
    if not args.get("allow_audio", False): argv += ["--no-audio-fallback"]
    if args.get("verified_transcript_receipt"):
        argv += ["--verified-transcript-receipt", str(local_file(args["verified_transcript_receipt"]))]
    if args.get("canonical_source"): argv += ["--canonical-source", args["canonical_source"]]
    result = run(argv, timeout=600)
    if receipt.exists():
        evidence = json.loads(receipt.read_text())
        digest = hashlib.sha256(text.read_bytes()).hexdigest() if text.exists() else None
        verified = evidence.get("status") == "complete" and digest is not None and evidence.get("content_sha256") == digest
        return {"ok": verified and result["ok"], "text_path": str(text) if text.exists() else None, "receipt_path": str(receipt), "hash_verified": verified, "receipt": evidence}
    return result


def pdf_evidence(args):
    # Heavy optional dependencies stay in the system Python used by the extractor.
    worker = Path(__file__).with_name("pdf_worker.py")
    path = local_file(args["path"])
    work = workspace()
    argv = [PYTHON, str(worker), str(path), str(work / "evidence.json"), str(args.get("first_page", 1)), str(args.get("last_page", 0)), "ocr" if args.get("ocr", True) else "text"]
    return run(argv, timeout=600)


def exact_id(args, key):
    val = args.get(key, "")
    if not UUID.fullmatch(val): raise ValueError(key + " must be a complete literal UUID")
    return val


def notebook_command(args):
    for key in ("text", "source"):
        if key in args and (not isinstance(args[key], str) or not args[key].strip() or args[key].startswith("-")):
            raise ValueError(key + " must be nonempty content, not a CLI option")
    action = args["action"]
    if action in {"ask", "create"} and not args.get("text"): raise ValueError("text required")
    if action == "add_source":
        if not args.get("source"): raise ValueError("source required")
        if not args["source"].startswith(("http://", "https://")):
            args = dict(args, source=str(local_file(args["source"])))
    if action == "doctor": return [NOTEBOOK, "doctor"]
    if action == "list": return [NOTEBOOK, "list", "--json"]
    if action == "create": return [NOTEBOOK, "create", args["text"], "--json"]
    nb = exact_id(args, "notebook_id")
    commands = {"sources": ["source", "list"], "artifacts": ["artifact", "list"], "source_get": ["source", "get", args.get("source_id", "")], "source_text": ["source", "fulltext", args.get("source_id", "")], "artifact_get": ["artifact", "get", args.get("artifact_id", "")], "add_source": ["source", "add", args.get("source", "")], "ask": ["ask", args.get("text", "")]}
    if action in {"source_get", "source_text"}: exact_id(args, "source_id")
    if action == "artifact_get": exact_id(args, "artifact_id")
    if action == "generate":
        fmt = args["format"]
        if fmt not in {"quiz", "audio", "mind-map", "infographic", "slide-deck", "video", "cinematic-video", "data-table", "report"}: raise ValueError("Unsupported format")
        prompt = local_file(args["prompt_file"])
        # CLI capability, not a universal language flag (quiz has none).
        help_result = subprocess.run([NOTEBOOK, "generate", fmt, "--help"], capture_output=True, text=True, timeout=15, check=True).stdout
        command = ["generate", fmt]
        if fmt == "mind-map":
            command += ["--kind", "note-backed", "--instructions", prompt.read_text()]
        else:
            command += ["--prompt-file", str(prompt), "--no-wait"]
        if "--language" in help_result:
            command += ["--language", args.get("language", "ar_eg")]
        if args.get("source_id"): command += ["-s", exact_id(args, "source_id")]
    else:
        if action not in commands: raise ValueError("Unsupported NotebookLM action")
        command = commands[action]
        if action == "source_text": command += ["-o", str(workspace() / "source.txt")]
    return [NOTEBOOK, *command, "-n", nb, "--json"]


def notebook(args):
    argv = notebook_command(args)
    if args["action"] not in {"doctor", "list"}:
        health = run([NOTEBOOK, "doctor"], timeout=30)
        if not health["ok"]: return health
    return run(argv, timeout=180)


def exa(args):
    key = os.environ.get("EXA_API_KEY")
    if not key: return {"ok": False, "error": "EXA_API_KEY is not configured in this Hermes process"}
    limit = args.get("limit", 5)
    if type(limit) is not int or not 1 <= limit <= 10: raise ValueError("limit must be 1–10")
    query = args["query"]
    if not isinstance(query, str) or not 1 <= len(query) <= 2000: raise ValueError("query must be 1–2000 characters")
    body = json.dumps({"query": query, "numResults": limit, "type": "auto", "contents": {"highlights": {"maxCharacters": 1000}}}).encode()
    request = Request("https://api.exa.ai/search", data=body, headers={"x-api-key": key, "Content-Type": "application/json"})
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None  # Never forward the provider credential across a redirect.
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            raw = response.read(1048577)
            if len(raw) > 1048576: raise ValueError("Exa response exceeds bound")
            data = json.loads(raw)
    except HTTPError as error:
        return {"ok": False, "status": error.code, "error": "Exa request rejected; no automatic retry"}
    return {"ok": True, "provider": "exa", "results": [{k: row.get(k) for k in ("url", "title", "author", "publishedDate", "highlights")} for row in data.get("results", [])], "costDollars": data.get("costDollars")}


HANDLERS = {"compass_read": read, "compass_capabilities": capabilities, "compass_mutate": mutate, "compass_extract": extract, "compass_pdf_evidence": pdf_evidence, "compass_notebooklm": notebook, "compass_exa_search": exa}

def dispatch(name, args):
    try:
        data = redact(HANDLERS[name](args))
        output = json.dumps(data, ensure_ascii=False)
        if len(output.encode()) > 24000:
            return json.dumps({"ok": False, "error": "output_limit", "hint": "Use a narrower projection. Do not replay a mutation."})
        return output
    except Exception as error:
        return json.dumps(redact({"ok": False, "error": type(error).__name__, "message": str(error)[:1000]}), ensure_ascii=False)
