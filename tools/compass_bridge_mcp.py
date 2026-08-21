#!/usr/bin/env python3
"""Learning Compass Bridge MCP server.

A dependency-free stdio MCP server for Hermes. It exposes high-level Compass
operations and delegates all state access to the Worker's protocol-v2
read routes and guarded /agent/request surface. It never accesses D1/R2 directly.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.error
import urllib.request
import uuid
from typing import Any

BASE_URL = os.environ.get(
    "COMPASS_API_URL", "https://recommendations-worker.mhmudnasr30.workers.dev"
).rstrip("/")
API_TOKEN = os.environ.get("COMPASS_API_TOKEN") or os.environ.get("API_TOKEN", "")
AGENT_NAME = "hermes-compass-bridge"


def compact(value: Any, limit: int = 1800) -> Any:
    """Keep tool output useful without dumping large product responses."""
    if isinstance(value, dict):
        preferred = (
            "ok", "verified", "id", "status", "state", "title", "label", "round", "source", "url",
            "thread", "threads", "branch", "branches", "items", "queue", "recall",
            "due", "count", "total", "returned", "receipt", "data", "error", "message", "blocker",
        )
        out = {k: compact(value[k]) for k in preferred if k in value}
        if not out:
            out = {k: compact(v) for k, v in list(value.items())[:24]}
        return out
    if isinstance(value, list):
        return [compact(v) for v in value[:12]]
    if isinstance(value, str) and len(value) > limit:
        return value[:limit] + "…"
    return value


def http_json(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        BASE_URL + path,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "user-agent": "HermesCompassBridge/1.0",
            "x-agent-name": AGENT_NAME,
            "x-api-token": API_TOKEN,
        },
    )
    return _open_json(request)


def _open_json(request: urllib.request.Request) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = {"message": raw[:500]}
        return {"ok": False, "verified": False, "http_status": exc.code, **detail}
    except Exception as exc:
        return {"ok": False, "verified": False, "error": type(exc).__name__, "message": str(exc)}


def http_get(path: str) -> dict[str, Any]:
    request = urllib.request.Request(
        BASE_URL + path,
        method="GET",
        headers={"user-agent": "HermesCompassBridge/1.0", "x-agent-name": AGENT_NAME, "x-api-token": API_TOKEN},
    )
    return _open_json(request)


def site_request(method: str, path: str, body: dict[str, Any] | None = None, *, dry_run: bool = False, confirm: bool = False) -> dict[str, Any]:
    if method == "GET":
        return http_get(path)
    args: dict[str, Any] = {"method": method, "path": path, "dry_run": dry_run, "confirm": confirm}
    if body is not None:
        args["body"] = body
    if method != "GET":
        args["idempotency_key"] = f"hermes-bridge:{method}:{path}:{uuid.uuid4()}"
    return http_json("/agent/request", args)


def receipt(result: dict[str, Any]) -> dict[str, Any]:
    data = compact(result)
    if isinstance(data, dict) and "receipt" in data:
        return data
    return {"result": data}


def tool_call(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "compass_context":
        return receipt(site_request("GET", "/agent/context"))
    if name == "compass_status":
        return receipt(site_request("GET", "/agent/briefing"))
    if name == "compass_recommendation_context":
        return receipt(site_request("GET", "/compass/context"))
    if name == "compass_pick":
        return receipt(site_request("GET", "/compass/pick"))
    if name == "compass_job_health":
        return receipt(site_request("GET", "/agent/jobs/health"))
    if name == "compass_activity":
        return receipt(site_request("GET", "/agent/activity?limit=20"))
    if name == "compass_evidence_search":
        query = str(args.get("query", "")).strip()
        path = "/search/evidence?q=" + urllib.parse.quote(query)
        return receipt(site_request("GET", path))
    if name == "compass_queue":
        return receipt(site_request("GET", "/capture/queue"))
    if name == "compass_recall":
        path = "/learning/srs/due"
        if args.get("limit"):
            path += "?limit=" + str(max(1, min(int(args["limit"]), 100)))
        return receipt(site_request("GET", path))
    if name == "compass_threads":
        return receipt(site_request("GET", "/learning/core/threads"))
    if name == "compass_branch_deck":
        return receipt(site_request("GET", "/brain/branch-deck"))
    if name == "compass_branch_suggest":
        return receipt(site_request("POST", "/brain/branch-suggest", {"mode": args.get("mode", "surprise"), "prompt": args.get("prompt", "")}))
    if name == "compass_capture":
        body = {"source": args["source"], "branch_id": args["branch_id"]}
        if args.get("title"):
            body["title"] = args["title"]
        if args.get("branch_reason"):
            body["branch_reason"] = args["branch_reason"]
        captured = site_request("POST", "/capture", body)
        capture_data = captured.get("data") or (captured.get("receipt") or {}).get("mutation_or_job", {}).get("data") or captured
        item_id = capture_data.get("id") or capture_data.get("recommendation_id")
        if not captured.get("ok") or not item_id:
            return receipt(captured)
        record = http_get(f"/capture/{urllib.parse.quote(str(item_id), safe='')}/record")
        branch = (record.get("item") or {}).get("branch") or record.get("branch") or {}
        if branch.get("id") != args["branch_id"] or not branch.get("round"):
            mapped = http_json(
                f"/capture/{urllib.parse.quote(str(item_id), safe='')}/branch-map",
                {
                    "branch_id": args["branch_id"],
                    "confidence": "high",
                    "reason": args.get("branch_reason", "Compatibility repair after atomic capture readback"),
                },
            )
            if not mapped.get("ok"):
                return receipt({"ok": False, "captured": compact(captured), "record": compact(record), "branch_mapping": compact(mapped), "blocker": "atomic capture branch readback failed and compatibility repair was rejected"})
            record = http_get(f"/capture/{urllib.parse.quote(str(item_id), safe='')}/record")
            branch = (record.get("item") or {}).get("branch") or record.get("branch") or {}
        verified_branch = (
            branch.get("id") == args["branch_id"]
            and bool(branch.get("label"))
            and bool(branch.get("round"))
            and str(branch.get("status", "")).lower() != "pruned"
        )
        return receipt({
            "ok": bool(record.get("ok", True)) and verified_branch,
            "verified": verified_branch,
            "id": item_id,
            "state": (record.get("item") or {}).get("learning_state") or capture_data.get("state"),
            "branch": branch,
            "record": compact(record),
            **({} if verified_branch else {"blocker": "capture branch/round readback failed"}),
        })
    if name == "compass_start":
        item_id = args["item_id"]
        body = {"recommendation_id": item_id, "thread_id": args["thread_id"], "target_kind": args.get("target_kind", "original")}
        if args.get("target_artifact_id"):
            body["target_artifact_id"] = args["target_artifact_id"]
        return receipt(site_request("POST", "/sessions/start", body))
    if name == "compass_feedback":
        body = {"recommendation_id": args["item_id"], "feedback": args["feedback"], "complete": bool(args.get("complete", True))}
        if args.get("rating") is not None:
            body["rating"] = float(args["rating"])
        if args.get("disposition"):
            body["disposition"] = args["disposition"]
        return receipt(site_request("POST", "/feedback/record", body))
    if name == "compass_visualise":
        return receipt(site_request("POST", f"/capture/{args['item_id']}/visualise", {"mode": args.get("mode", "lite_visual")}))
    raise ValueError(f"Unknown tool: {name}")


TOOLS = [
    ("compass_context", "Read the bounded canonical Learning Compass context: active Threads, Queue, gaps, and component health.", {}),
    ("compass_status", "Show a compact Learning Compass dashboard briefing.", {}),
    ("compass_recommendation_context", "Read the bounded context required before researching Compass recommendations.", {}),
    ("compass_pick", "Read the newest active ready or started Compass Pick.", {}),
    ("compass_job_health", "Read Hermes job queue health, stale leases, retries, and failures.", {}),
    ("compass_activity", "Read recent verified Hermes receipts, jobs, and pending proposals.", {}),
    ("compass_evidence_search", "Search source-anchored evidence and return durable locators for learning work.", {"query": {"type": "string", "minLength": 2}, "required": ["query"]}),
    ("compass_queue", "Read the curated five-item Learning Compass Queue.", {}),
    ("compass_recall", "Read due spaced-recall cards.", {"limit": {"type": "integer", "minimum": 1, "maximum": 100}}),
    ("compass_threads", "List active Learning Threads and progression state.", {}),
    ("compass_branch_deck", "Read reviewable branch suggestions and map candidates.", {}),
    ("compass_branch_suggest", "Request grounded review-before-commit branch ideas; this does not commit a branch.", {"mode": {"type": "string", "enum": ["surprise", "expand", "bridge", "challenge"]}, "prompt": {"type": "string"}}),
    ("compass_capture", "Capture a URL or source into Library → All sources, map its verified branch, and return branch/round readback.", {"source": {"type": "string"}, "title": {"type": "string"}, "branch_id": {"type": "string", "minLength": 1}, "branch_reason": {"type": "string"}, "required": ["source", "branch_id"]}),
    ("compass_start", "Start a Compass item in a Thread and return the verified session receipt.", {"item_id": {"type": "string"}, "thread_id": {"type": "string"}, "target_kind": {"type": "string"}, "target_artifact_id": {"type": "string"}, "required": ["item_id", "thread_id"]}),
    ("compass_feedback", "Record a reflection, optional rating, and disposition for a consumed Compass item.", {"item_id": {"type": "string"}, "feedback": {"type": "string"}, "rating": {"type": "number", "minimum": 0, "maximum": 10}, "disposition": {"type": "string", "enum": ["retain", "apply", "reference", "drop"]}, "complete": {"type": "boolean"}, "required": ["item_id", "feedback"]}),
    ("compass_visualise", "Request a source-specific Arabic Lite Visual companion for a captured item.", {"item_id": {"type": "string"}, "mode": {"type": "string", "enum": ["lite_visual"]}, "required": ["item_id"]}),
]


def tool_schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    required = required or properties.pop("required", []) if isinstance(properties, dict) else []
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


def handle(message: dict[str, Any]) -> dict[str, Any] | None:
    method = message.get("method")
    ident = message.get("id")
    if method == "notifications/initialized":
        return None
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": ident, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "learning-compass-bridge", "version": "1.0.0"}}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": ident, "result": {}}
    if method == "tools/list":
        entries = []
        for name, description, props in TOOLS:
            p = dict(props)
            required = p.pop("required", [])
            entries.append({"name": name, "description": description, "inputSchema": {"type": "object", "properties": p, "required": required, "additionalProperties": False}})
        return {"jsonrpc": "2.0", "id": ident, "result": {"tools": entries}}
    if method == "tools/call":
        params = message.get("params") or {}
        try:
            result = tool_call(str(params.get("name")), params.get("arguments") or {})
            text = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
            nested = result.get("result") if isinstance(result.get("result"), dict) else {}
            is_error = bool(result.get("error")) or result.get("ok") is False or nested.get("ok") is False
            return {"jsonrpc": "2.0", "id": ident, "result": {"content": [{"type": "text", "text": text}], "isError": is_error}}
        except Exception as exc:
            return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32000, "message": str(exc)}}
    if ident is not None:
        return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": f"Method not found: {method}"}}
    return None


for line in sys.stdin:
    try:
        response = handle(json.loads(line))
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()
    except Exception as exc:
        sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}) + "\n")
        sys.stdout.flush()
