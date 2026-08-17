#!/usr/bin/env python3
import json
import os
import subprocess
import sys

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
print(f"MCP handshake OK; {len(tool_names)} Compass tools exposed")
