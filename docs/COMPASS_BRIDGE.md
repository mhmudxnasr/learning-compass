# Compass Bridge

`tools/compass_bridge_mcp.py` exposes Learning Compass as a native Hermes MCP server.

## Runtime

- Transport: dependency-free stdio MCP.
- Hermes registration: `learning-compass-bridge` in `~/.hermes/config.yaml`.
- Canonical state: the live Worker API; the bridge never reads D1 or R2.
- Reads: direct public Worker GET routes with compact projection.
- Writes: guarded Worker `/agent/request`, with idempotency and the Worker's verification receipt.

The bridge is enabled for all Hermes surfaces that load the global MCP configuration, including CLI and configured gateway platforms. A new Hermes session or gateway reload is required before a currently running session sees newly registered tools.

## Tools

`compass_context`, `compass_status`, `compass_recommendation_context`, `compass_pick`, `compass_job_health`, `compass_activity`, `compass_evidence_search`, `compass_queue`, `compass_recall`, `compass_threads`, `compass_branch_deck`, `compass_branch_suggest`, `compass_capture`, `compass_start`, `compass_feedback`, and `compass_visualise`.

The tools deliberately do not expose destructive deletion, arbitrary route execution, direct SQL, or raw database access. Source exclusion remains a user decision, and recommendation creation remains governed by the existing Compass recommendation workflow.

## Environment

The default Worker URL is the production direct URL. To point at another authorized Worker, set `COMPASS_API_URL`. For private deployments where the Worker requires authentication, set `COMPASS_API_TOKEN` (or the existing `API_TOKEN`) through the Hermes process environment; the bridge sends it only as `x-api-token` and never puts it in the MCP command line or source files. Read-only tools remain read-only; mutations flow through guarded, idempotent `/agent/request`.

## Verification

```bash
npm run test:compass-bridge
hermes mcp test learning-compass-bridge
```

The live read smoke should exercise context, Queue, Threads, and due recall. Mutations should only be exercised with an explicitly intended user action, not a synthetic capture.
