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


class Handler(BaseHTTPRequestHandler):
    path_seen = None
    body_seen = None

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        Handler.path_seen = self.path
        Handler.body_seen = json.loads(self.rfile.read(length) or b"{}")
        payload = json.dumps({"ok": True, "verified": True, "receipt": {"target": "/feedback/record"}}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

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
proc.terminate()
server.shutdown()
server.server_close()

assert response["result"]["isError"] is False, response
assert Handler.path_seen == "/agent/request", Handler.path_seen
body_seen = Handler.body_seen
assert isinstance(body_seen, dict), body_seen
assert body_seen["method"] == "POST", body_seen
assert body_seen["path"] == "/feedback/record", body_seen
assert body_seen["body"]["rating"] == 6.0, body_seen
assert body_seen["body"]["disposition"] == "drop", body_seen
print(f"MCP handshake and guarded feedback mutation OK; {len(tool_names)} Compass tools exposed")
