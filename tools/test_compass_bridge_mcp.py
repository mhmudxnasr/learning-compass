#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCRIPT = os.path.join(os.path.dirname(__file__), "compass_bridge_mcp.py")

proc = subprocess.Popen(
    [sys.executable, SCRIPT], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    text=True,
)
messages = [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    {"jsonrpc": "2.0", "method": "notifications/initialized"},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
]
assert proc.stdin is not None and proc.stdout is not None
for message in messages:
    proc.stdin.write(json.dumps(message) + "\n")
    proc.stdin.flush()
responses = [json.loads(proc.stdout.readline()) for _ in (0, 1)]
proc.terminate()
assert responses[0]["result"]["serverInfo"]["name"] == "learning-compass-bridge"
tool_names = {tool["name"] for tool in responses[1]["result"]["tools"]}
expected = {"compass_context", "compass_queue", "compass_capture", "compass_feedback", "compass_recall"}
assert expected <= tool_names, (expected, tool_names)
capture_schema = next(tool["inputSchema"] for tool in responses[1]["result"]["tools"] if tool["name"] == "compass_capture")
assert capture_schema["required"] == ["source", "branch_id"], capture_schema


class Handler(BaseHTTPRequestHandler):
    requests = []
    legacy_reads = 0

    def send_json(self, value):
        payload = json.dumps(value).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        Handler.requests.append(("POST", self.path, body))
        if self.path == "/agent/request" and body.get("path") == "/capture":
            item_id = "cap_legacy" if body.get("body", {}).get("source", "").endswith("/legacy") else "cap_capture"
            self.send_json({"ok": True, "verified": True, "data": {"ok": True, "id": item_id, "state": "captured"}, "receipt": {"target": "/capture"}})
        elif self.path == "/capture/cap_legacy/branch-map":
            self.send_json({"ok": True, "recommendation_id": "cap_legacy", "branch_id": "branch_test"})
        else:
            self.send_json({"ok": True, "verified": True, "receipt": {"target": "/feedback/record"}})

    def do_GET(self):
        Handler.requests.append(("GET", self.path, None))
        if self.path == "/capture/cap_capture/record":
            self.send_json({"item": {"id": "cap_capture", "learning_state": "captured", "branch": {"id": "branch_test", "label": "Test branch", "round": "R1", "status": "active"}}})
        elif self.path == "/capture/cap_legacy/record":
            Handler.legacy_reads += 1
            branch = {} if Handler.legacy_reads == 1 else {"id": "branch_test", "label": "Test branch", "round": "R1", "status": "active"}
            self.send_json({"item": {"id": "cap_legacy", "learning_state": "captured", "branch": branch}})
        else:
            self.send_json({"ok": True})

    def log_message(self, format: str, *args: object):
        return


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
env = {**os.environ, "COMPASS_API_URL": f"http://127.0.0.1:{server.server_port}"}
proc = subprocess.Popen(
    [sys.executable, SCRIPT], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    text=True, env=env,
)
assert proc.stdin is not None and proc.stdout is not None
proc.stdin.write(json.dumps({
    "jsonrpc": "2.0", "id": 3, "method": "tools/call",
    "params": {"name": "compass_feedback", "arguments": {
        "item_id": "cap_test", "feedback": "Useful but shallow", "rating": 6,
        "disposition": "drop", "complete": True,
    }},
}) + "\n")
proc.stdin.flush()
response = json.loads(proc.stdout.readline())

assert response["result"]["isError"] is False, response
method_seen, path_seen, body_seen = Handler.requests[0]
assert method_seen == "POST", method_seen
assert path_seen == "/agent/request", path_seen
assert isinstance(body_seen, dict), body_seen
assert body_seen["method"] == "POST", body_seen
assert body_seen["path"] == "/feedback/record", body_seen
assert body_seen["body"]["rating"] == 6.0, body_seen
assert body_seen["body"]["disposition"] == "drop", body_seen

proc.stdin.write(json.dumps({
    "jsonrpc": "2.0", "id": 4, "method": "tools/call",
    "params": {"name": "compass_capture", "arguments": {
        "source": "https://example.com/source", "title": "Example", "branch_id": "branch_test",
    }},
}) + "\n")
proc.stdin.flush()
capture_response = json.loads(proc.stdout.readline())

proc.stdin.write(json.dumps({
    "jsonrpc": "2.0", "id": 5, "method": "tools/call",
    "params": {"name": "compass_capture", "arguments": {
        "source": "https://example.com/legacy", "branch_id": "branch_test",
    }},
}) + "\n")
proc.stdin.flush()
legacy_response = json.loads(proc.stdout.readline())
proc.terminate()
server.shutdown()
server.server_close()

assert capture_response["result"]["isError"] is False, capture_response
capture_result = json.loads(capture_response["result"]["content"][0]["text"])["result"]
assert capture_result["verified"] is True, capture_result
assert capture_result["branch"] == {"id": "branch_test", "label": "Test branch", "round": "R1", "status": "active"}, capture_result
assert [(method, path) for method, path, _ in Handler.requests[1:3]] == [
    ("POST", "/agent/request"),
    ("GET", "/capture/cap_capture/record"),
], Handler.requests
assert Handler.requests[1][2]["body"]["branch_id"] == "branch_test", Handler.requests[1]
legacy_result = json.loads(legacy_response["result"]["content"][0]["text"])["result"]
assert legacy_result["verified"] is True, legacy_result
assert [(method, path) for method, path, _ in Handler.requests[3:]] == [
    ("POST", "/agent/request"),
    ("GET", "/capture/cap_legacy/record"),
    ("POST", "/capture/cap_legacy/branch-map"),
    ("GET", "/capture/cap_legacy/record"),
], Handler.requests
print(f"MCP handshake, guarded feedback, and branch-verified capture OK; {len(tool_names)} Compass tools exposed")
