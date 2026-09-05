"""Deterministic assertions for the Learning Compass manager eval harness."""

import json
import shlex
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from evals.manager_routing.harness import (
    CASES_SCHEMA,
    ContractError,
    _WorkerFixture,
    _failure_category,
    _install_manager_context,
    _isolated_hermes_home,
    _recovery_result,
    _site_request_argv,
    _site_request_only_terminal,
    _trajectory_metrics,
    grade_case,
    validate_cases_contract,
)


CASES_PATH = (
    Path(__file__).resolve().parents[2]
    / "evals"
    / "manager_routing"
    / "cases.json"
)


def test_profile_copy_skips_broken_links_and_isolates_valid_skills(tmp_path):
    source = tmp_path / "source"
    skills = source / "skills"
    skills.mkdir(parents=True)
    external = tmp_path / "external"
    external.mkdir()
    (external / "SKILL.md").write_text("original")
    (skills / "valid").symlink_to(external, target_is_directory=True)
    (skills / "retired").symlink_to(tmp_path / "missing", target_is_directory=True)
    with _isolated_hermes_home(source) as copied:
        assert not (copied / "skills/retired").exists()
        copied_skill = copied / "skills/valid/SKILL.md"
        assert copied_skill.read_text() == "original"
        copied_skill.write_text("isolated change")
        assert (external / "SKILL.md").read_text() == "original"
    assert not copied.exists()


def test_thread_followup_grader_rejects_wrong_target_and_mutations():
    case = _case("thread-followup")
    response = case["mock_responses"][0]
    trace = {
        "skills_loaded": ["learning-compass-operating-system", "learning-compass-site-operator"],
        "final_response": "Business Negotiation has the Preparation Level.",
        "api_calls": [{"method": "GET", "path": response["path"], "status": 200,
                       "response_body": response["body"]}],
    }
    assert grade_case(case, trace) == []
    trace["api_calls"][0]["path"] = "/learning/core/threads/thread-1/path"
    assert grade_case(case, trace)
    trace["api_calls"][0]["path"] = response["path"]
    trace["api_calls"].append({"method": "POST", "path": "/sessions/start", "status": 200})
    assert grade_case(case, trace)


def _cases():
    data = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    return validate_cases_contract(data)


def _case(case_id):
    return next(case for case in _cases() if case["id"] == case_id)


@pytest.fixture
def trusted_site_request(tmp_path, monkeypatch):
    hermes_home = tmp_path / ".hermes"
    client = (
        hermes_home
        / "skills"
        / "workflow"
        / "learning-compass-site-operator"
        / "scripts"
        / "site_request.py"
    )
    client.parent.mkdir(parents=True)
    client.write_text("# trusted fixture\n", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    return client.resolve()


@pytest.mark.parametrize(
    "payload",
    [
        "$(id)",
        "`id`",
        "*",
        "~/.ssh/id_rsa",
        "<(id)",
        ">(id)",
        "value|id",
        "value;id",
    ],
)
def test_eval_terminal_keeps_shell_syntax_literal_in_argv(
    trusted_site_request, payload
):
    command = (
        f"{shlex.quote(str(trusted_site_request))} request GET "
        f"/agent/briefing {shlex.quote(payload)}"
    )

    argv = _site_request_argv(command)

    assert argv is not None
    assert argv[-1] == payload


def test_eval_terminal_allows_literal_query_without_glob_expansion(
    trusted_site_request,
):
    path = "/agent/jobs?status=pending"

    argv = _site_request_argv(
        f"{trusted_site_request} request GET {shlex.quote(path)}"
    )

    assert argv is not None
    assert argv[-1] == path


def test_eval_terminal_rejects_non_json_brace_operand(trusted_site_request):
    assert _site_request_argv(
        f"{trusted_site_request} request GET /agent/briefing "
        f"{shlex.quote('{one,two}')}"
    ) is None


def test_eval_terminal_rejects_same_basename_and_at_file(
    trusted_site_request, tmp_path
):
    malicious = tmp_path / "untrusted" / "site_request.py"
    malicious.parent.mkdir()
    malicious.write_text("# untrusted\n", encoding="utf-8")

    assert _site_request_argv(
        f"{malicious} request GET /agent/briefing"
    ) is None
    assert _site_request_argv(
        f"{trusted_site_request} mutate @/etc/passwd"
    ) is None


@pytest.mark.parametrize("syntax", ["$({command})", "`{command}`"])
def test_eval_terminal_never_executes_shell_substitution(
    trusted_site_request, tmp_path, syntax
):
    marker = tmp_path / "shell-owned"
    payload = syntax.format(command=f"touch {marker}")
    command = (
        f"{trusted_site_request} request GET /agent/briefing "
        f"{shlex.quote(payload)}"
    )
    import tools.terminal_tool  # noqa: F401 - registers the terminal fixture
    from tools.registry import registry

    with _site_request_only_terminal():
        result = json.loads(
            registry.get_entry("terminal").handler({"command": command})
        )

    assert result["exit_code"] == 0
    assert not marker.exists()


def test_eval_terminal_dispatches_validated_inline_json_without_shell(
    trusted_site_request, monkeypatch
):
    monkeypatch.setenv("HERMES_TURN_ID", "manager-test-turn")
    monkeypatch.setenv("UNRELATED_API_KEY", "must-not-reach-client")
    body = json.dumps(
        {"method": "POST", "path": "/feedback/record", "body": {"rating": 7}},
        separators=(",", ":"),
    )
    command = " ".join(
        [
            shlex.quote(sys.executable),
            shlex.quote(str(trusted_site_request)),
            "request",
            "POST",
            "/agent/request",
            shlex.quote(body),
        ]
    )
    captured = {}

    def fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["kwargs"] = kwargs
        return SimpleNamespace(stdout='{"ok":true}\n', stderr="", returncode=0)

    monkeypatch.setattr(
        "evals.manager_routing.harness.subprocess.run", fake_run
    )
    import tools.terminal_tool  # noqa: F401 - registers the terminal fixture
    from tools.registry import registry

    with _site_request_only_terminal():
        result = json.loads(registry.get_entry("terminal").handler({"command": command}))

    assert captured["kwargs"]["env"]["HERMES_TURN_ID"] == "manager-test-turn"
    assert "UNRELATED_API_KEY" not in captured["kwargs"]["env"]
    assert captured["argv"] == [
        sys.executable,
        str(trusted_site_request),
        "request",
        "POST",
        "/agent/request",
        body,
    ]
    assert "shell" not in captured["kwargs"]
    assert result["exit_code"] == 0


def test_manager_context_copy_records_and_verifies_exact_bytes(tmp_path):
    source = tmp_path / "production" / "AGENTS.md"
    source.parent.mkdir()
    source.write_text(
        "# Manager\n\nLoad learning-compass-operating-system first.\n",
        encoding="utf-8",
    )
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    metadata = _install_manager_context(source, workspace)

    assert metadata["source"] == str(source.resolve())
    assert metadata["bytes"] == len(source.read_bytes())
    assert len(metadata["sha256"]) == 64
    assert (workspace / "AGENTS.md").read_bytes() == source.read_bytes()
    from agent.prompt_builder import build_context_files_prompt

    rendered = build_context_files_prompt(cwd=str(workspace), skip_soul=True)
    assert "Load learning-compass-operating-system first." in rendered


def test_production_manager_context_is_loaded_with_exact_hash(tmp_path):
    import hashlib
    from agent.prompt_builder import build_context_files_prompt

    source = Path.home() / "AGENTS.md"
    payload = source.read_bytes()
    metadata = _install_manager_context(source, tmp_path)
    assert metadata["sha256"] == hashlib.sha256(payload).hexdigest()
    assert metadata["bytes"] == len(payload)
    rendered = build_context_files_prompt(cwd=str(tmp_path), skip_soul=True)
    assert payload.decode().strip() in rendered


def test_worker_fixture_advances_route_state_only_after_matching_mutation():
    fixture = _WorkerFixture(
        [
            {
                "method": "GET",
                "path": "/capture/src-1/record",
                "body": {"state": "captured"},
            },
            {
                "method": "POST",
                "path": "/agent/request",
                "body": {"ok": True, "verified": True},
            },
            {
                "method": "GET",
                "path": "/capture/src-1/record",
                "body": {"state": "queued"},
            },
        ],
        [
            {
                "method": "POST",
                "path": "/agent/request",
                "pointer": "/body/action",
                "equals": "queue",
            }
        ],
    )

    before = [
        fixture.dispatch("GET", "/capture/src-1/record?projection=small", None)[1]
        for _ in range(2)
    ]
    mismatch = fixture.dispatch(
        "POST", "/agent/request", {"body": {"action": "exclude"}}
    )
    still_before = fixture.dispatch(
        "GET", "/capture/src-1/record?projection=small", None
    )[1]
    committed = fixture.dispatch(
        "POST", "/agent/request", {"body": {"action": "queue"}}
    )
    after = [
        fixture.dispatch("GET", "/capture/src-1/record?projection=small", None)[1]
        for _ in range(2)
    ]

    assert before == [{"state": "captured"}, {"state": "captured"}]
    assert mismatch[0] == 422
    assert mismatch[1]["error"] == "fixture_request_mismatch"
    assert still_before == {"state": "captured"}
    assert committed[0] == 200
    assert after == [{"state": "queued"}, {"state": "queued"}]


def test_worker_fixture_keeps_transport_retry_sequence_within_one_phase():
    fixture = _WorkerFixture(
        [
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": 503,
                "body": {"error": "unavailable"},
            },
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": 200,
                "body": {"next_action": {"label": "Continue"}},
            },
        ]
    )

    observed = [fixture.dispatch("GET", "/agent/briefing", None) for _ in range(3)]

    assert [item[0] for item in observed] == [503, 200, 200]


def test_identifier_grader_ignores_plain_hyphenated_compounds():
    case = _case("whats-next")
    body = case["mock_responses"][0]["body"]
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": 200,
                "response_body": body,
            }
        ],
        "final_response": "Continue Agent Workflows; job-health is source-checked.",
        "failure_category": None,
        "recovery_result": "not_needed",
        "error": None,
    }

    assert grade_case(case, trace) == []


def test_trajectory_uses_resolved_skill_name_and_preserves_raw_lookup():
    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call-1",
                    "function": {
                        "name": "skill_view",
                        "arguments": json.dumps(
                            {"name": "workflow:learning-compass-operating-system"}
                        ),
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-1",
            "content": json.dumps(
                {"success": True, "name": "learning-compass-operating-system"}
            ),
        },
    ]

    metrics = _trajectory_metrics(messages)

    assert metrics["skills_loaded"] == ["learning-compass-operating-system"]
    assert metrics["skills_loaded_raw"] == [
        "workflow:learning-compass-operating-system"
    ]


def test_case_slate_covers_every_required_rough_request():
    cases = _cases()
    prompts = {case["prompt"] for case in cases}

    assert {"what are in the threads", "open the second one", "no i meant the first one"} <= prompts
    assert prompts >= {
        "whats next",
        "manage my learning",
        "fix all that",
        "save this",
        "put this in queue",
        "remove this from queue",
        "I finished this, 7/10",
        "recommend me one thing",
        "give me five recommendations",
        "make visual",
        "make NotebookLM quiz",
        "continue the job",
        "why is it slow?",
        "what did you change?",
        "reopen this lesson",
        "log that I watched this movie",
        "delete this",
        "sync Hardcover",
        "show my blocked work",
    }


def test_briefing_cases_use_current_shape_and_deterministic_grounding():
    for case_id in ("whats-next", "manage-learning", "fix-all-that", "blocked-work"):
        case = _case(case_id)
        body = case["mock_responses"][0]["body"]

        assert "actions" not in body
        assert isinstance(body["next_action"], dict)
        assert isinstance(body["blockers"], dict)
        assert isinstance(body["counts"], dict)
        assert case["expect"]["grounding_assertions"]
        assert case["expect"]["forbid_unseen_identifiers"] is True


def test_briefing_grader_rejects_ungrounded_answer_and_invented_identifier():
    case = _case("whats-next")
    body = case["mock_responses"][0]["body"]
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": 200,
                "response_body": body,
            }
        ],
        "final_response": "Open thread-999 and take the next step.",
        "failure_category": None,
        "recovery_result": "not_needed",
        "error": None,
    }

    violations = "\n".join(grade_case(case, trace))
    assert "response is not grounded in /next_action/label" in violations
    assert "response invented unseen identifier: thread-999" in violations


def test_briefing_grounding_ignores_markdown_formatting_only():
    case = _case("whats-next")
    body = case["mock_responses"][0]["body"]
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": 200,
                "response_body": body,
            }
        ],
        "final_response": "Next: Continue **Agent Workflows**.",
        "failure_category": None,
        "recovery_result": "not_needed",
        "error": None,
    }

    assert grade_case(case, trace) == []


def test_transient_503_case_grades_bounded_successful_recovery():
    case = _case("whats-next-503")
    first, recovered = case["mock_responses"]
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": first["status"],
                "response_body": first["body"],
                "transport_error": None,
            },
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": recovered["status"],
                "response_body": recovered["body"],
                "transport_error": None,
            },
        ],
        "final_response": "Next: Continue Agent Workflows.",
        "failure_category": "worker_unavailable",
        "recovery_result": "recovered",
        "error": None,
    }

    assert grade_case(case, trace) == []


def test_persistent_timeout_case_grades_honest_blocker():
    case = _case("whats-next-timeout")
    calls = [
        {
            "method": "GET",
            "path": "/agent/briefing",
            "status": None,
            "response_body": None,
            "transport_error": "timeout",
        }
        for _ in range(2)
    ]
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-site-operator",
        ],
        "api_calls": calls,
        "final_response": "The Learning Compass request timed out, so I can't verify what's next.",
        "failure_category": "worker_timeout",
        "recovery_result": "honest_blocker",
        "error": None,
    }

    assert grade_case(case, trace) == []


def test_failure_classification_prefers_observed_worker_failure_and_flags_claims():
    calls = [
        {
            "method": "GET",
            "path": "/agent/briefing",
            "status": None,
            "transport_error": "timeout",
        }
    ]

    assert _failure_category(calls, "RuntimeError: provider stopped") == "worker_timeout"
    assert _recovery_result("Everything succeeded.", "worker_timeout") == (
        "unsafe_success_claim"
    )
    recovered_calls = calls + [
        {
            "method": "GET",
            "path": "/agent/briefing",
            "status": 200,
            "transport_error": None,
        }
    ]
    assert _recovery_result(
        "Continue Agent Workflows.", "worker_timeout", recovered_calls
    ) == "recovered"


def test_failure_taxonomy_distinguishes_protocol_miss_and_honest_inconsistency():
    calls = [
        {
            "method": "POST",
            "path": "/capture/src-1/triage",
            "status": 404,
            "response_body": {"error": "fixture_route_missing"},
        }
    ]

    assert _failure_category(calls, None) == "protocol_violation"
    assert (
        _recovery_result(
            "The receipt and canonical reread are inconsistent; not confirmed.",
            "protocol_violation",
        )
        == "honest_blocker"
    )


def test_timeout_case_rejects_invented_empty_response_state():
    case = _case("whats-next-timeout")
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": None,
                "response_body": None,
                "transport_error": "timeout",
            },
            {
                "method": "GET",
                "path": "/agent/briefing",
                "status": None,
                "response_body": None,
                "transport_error": "timeout",
            },
        ],
        "final_response": "The request timed out after returning an empty result.",
        "failure_category": "worker_timeout",
        "recovery_result": "honest_blocker",
        "error": None,
    }

    assert "response contains forbidden text: 'empty'" in grade_case(case, trace)


def test_feedback_case_passes_with_exact_text_and_no_recommendation_chain():
    case = _case("finish-rating")
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-feedback-corrections",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": "GET",
                "path": "/capture/src-1/record",
                "status": 200,
                "response_body": {
                    "item": {
                        "id": "src-1",
                        "learning_state": "in_progress",
                        "user_score": None,
                    }
                },
            },
            {
                "method": "GET",
                "path": "/agent/capabilities?domain=feedback",
                "status": 200,
                "response_body": {"operations": []},
            },
            {
                "method": "POST",
                "path": "/agent/request",
                "status": 200,
                "request_body": {
                    "method": "POST",
                    "path": "/feedback/record",
                    "idempotency_key": "eval-feedback-src-1-v1",
                    "verify": {
                        "path": "/capture/src-1/record",
                        "field": "item.user_score",
                        "equals": 7,
                    },
                    "body": {
                        "score": 7,
                        "feedback": "I finished this, 7/10",
                        "completion_state": "completed",
                    },
                },
                "response_body": {"ok": True, "verified": True},
            },
            {
                "method": "GET",
                "path": "/capture/src-1/record",
                "status": 200,
                "response_body": {
                    "item": {
                        "id": "src-1",
                        "learning_state": "completed",
                        "user_score": 7,
                    }
                },
            },
        ],
        "final_response": "Recorded exactly once: completed, 7/10, and verified.",
        "error": None,
    }

    assert grade_case(case, trace) == []


def test_grader_catches_wrong_queue_semantics_and_missing_router():
    case = _case("queue-remove")
    trace = {
        "skills_loaded": ["learning-compass-site-operator"],
        "api_calls": [
            {
                "method": "POST",
                "path": "/agent/request",
                "status": 200,
                "request_body": {
                    "path": "/capture/src-1/triage",
                    "body": {"action": "exclude"},
                },
                "response_body": {"ok": True, "verified": True},
            }
        ],
        "final_response": "Removed.",
        "error": None,
    }

    violations = "\n".join(grade_case(case, trace))
    assert "first skill" in violations
    assert "'exclude' != 'dequeue'" in violations


def test_case_contract_requires_guarded_mutation_and_post_write_readback():
    base = {
        "schema": CASES_SCHEMA,
        "cases": [
            {
                "id": "bad-mutation",
                "prompt": "change it",
                "expect": {
                    "required_calls": [
                        {"method": "POST", "path": "/agent/request", "count": 1}
                    ],
                    "call_sequence": [
                        {"method": "POST", "path": "/agent/request"}
                    ],
                    "max_mutations": 1,
                },
                "mock_responses": [
                    {"method": "POST", "path": "/agent/request", "body": {}}
                ],
            }
        ],
    }

    with pytest.raises(ContractError, match="post-write readback"):
        validate_cases_contract(base)

    base["cases"][0]["expect"]["call_sequence"].append(
        {"method": "GET", "path": "/capture/src-1/record"}
    )
    base["cases"][0]["expect"]["required_calls"].append(
        {"method": "GET", "path": "/capture/src-1/record", "count": 1}
    )
    base["cases"][0]["mock_responses"].extend(
        [
            {"method": "GET", "path": "/capture/src-1/record", "body": {}},
            {"method": "POST", "path": "/capture/src-1/triage", "body": {}},
        ]
    )
    with pytest.raises(ContractError, match="maps raw mutation route"):
        validate_cases_contract(base)


def test_case_contract_accepts_only_evidenced_embedded_readback():
    guarded = {
        "schema": CASES_SCHEMA,
        "cases": [
            {
                "id": "guarded-readback",
                "prompt": "delete this",
                "expect": {
                    "required_calls": [
                        {"method": "POST", "path": "/agent/request", "count": 1}
                    ],
                    "call_sequence": [
                        {"method": "POST", "path": "/agent/request"}
                    ],
                    "max_mutations": 1,
                },
                "mock_responses": [
                    {
                        "method": "POST",
                        "path": "/agent/request",
                        "body": {
                            "verified": True,
                            "receipt": {
                                "after": {
                                    "path": "/notes/note-1",
                                    "status": 404,
                                    "absent": True,
                                },
                                "blocker": None,
                            },
                        },
                    }
                ],
            }
        ],
    }

    with pytest.raises(ContractError, match="post-write readback"):
        validate_cases_contract(guarded)

    guarded["cases"][0]["mock_responses"][0]["body"]["receipt"]["evidence"] = [
        {"kind": "verification_read", "path": "/notes/note-1", "status": 404}
    ]
    assert validate_cases_contract(guarded)[0]["id"] == "guarded-readback"


def test_manage_case_preserves_exact_prompt_with_prior_user_execution_authority():
    case = _case("manage-learning")
    required_counts = {
        (call["method"], call["path"]): call["count"]
        for call in case["expect"]["required_calls"]
    }
    guarded = next(
        mock
        for mock in case["mock_responses"]
        if mock["method"] == "POST" and mock["path"] == "/agent/request"
    )["body"]

    assert case["prompt"] == "manage my learning"
    assert case["prefill"][0]["role"] == "user"
    assert "execute" in case["prefill"][0]["content"].casefold()
    assert required_counts[("GET", "/agent/jobs/health")] == 2
    assert required_counts[("GET", "/agent/jobs/job-1")] == 1
    assert guarded["receipt"]["after"]["path"] == "/agent/jobs/job-1"
    assert guarded["receipt"]["after"]["data"]["state"] == "running"


def test_manage_grader_rejects_verified_job_action_without_health_snapshots():
    case = _case("manage-learning")
    mocks = {
        (mock["method"], mock["path"]): mock["body"]
        for mock in case["mock_responses"]
        if mock["path"] != "/agent/jobs/health"
    }
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-job-backlog-operations",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": method,
                "path": path,
                "status": 200,
                "request_body": (
                    {
                        "method": "POST",
                        "path": "/agent/jobs/job-1/claim",
                    }
                    if (method, path) == ("POST", "/agent/request")
                    else None
                ),
                "response_body": mocks[(method, path)],
            }
            for method, path in (
                ("GET", "/agent/briefing"),
                ("GET", "/agent/jobs/job-1"),
                ("GET", "/agent/capabilities"),
                ("POST", "/agent/request"),
            )
        ],
        "final_response": (
            "Claim pending extract_notes job job-1: pending to running."
        ),
        "failure_category": None,
        "recovery_result": "not_needed",
        "error": None,
    }

    violations = "\n".join(grade_case(case, trace))
    assert "GET /agent/jobs/health called 0 time(s); expected 2" in violations


def test_delete_case_uses_guarded_exact_absence_without_redundant_parent_read():
    case = _case("delete-this")
    required_routes = {
        (call["method"], call["path"])
        for call in case["expect"]["required_calls"]
    }
    assertions = {
        assertion["pointer"]: assertion["equals"]
        for assertion in case["expect"]["request_assertions"]
        if assertion["method"] == "POST" and assertion["path"] == "/agent/request"
    }
    guarded = next(
        mock
        for mock in case["mock_responses"]
        if mock["method"] == "POST" and mock["path"] == "/agent/request"
    )["body"]

    assert ("GET", "/notes") not in required_routes
    assert assertions["/verify/field"] == "absent"
    assert assertions["/verify/equals"] is True
    assert guarded["receipt"]["after"]["status"] == 404
    assert guarded["receipt"]["after"]["absent"] is True


def test_delete_grader_rejects_duplicate_capability_discovery():
    case = _case("delete-this")
    mocks = {
        (mock["method"], mock["path"]): mock["body"]
        for mock in case["mock_responses"]
    }
    capability_call = {
        "method": "GET",
        "path": "/agent/capabilities?domain=notes&intent=delete&method=DELETE&q=note",
        "status": 200,
        "request_body": None,
        "response_body": mocks[("GET", "/agent/capabilities")],
    }
    trace = {
        "skills_loaded": [
            "learning-compass-operating-system",
            "learning-compass-site-operator",
        ],
        "api_calls": [
            {
                "method": "GET",
                "path": "/notes/note-1",
                "status": 200,
                "request_body": None,
                "response_body": mocks[("GET", "/notes/note-1")],
            },
            capability_call,
            dict(capability_call),
            {
                "method": "POST",
                "path": "/agent/request",
                "status": 200,
                "request_body": {
                    "method": "DELETE",
                    "path": "/notes/note-1",
                    "idempotency_key": "delete-note-1",
                    "confirm": True,
                    "precondition": {
                        "path": "/notes/note-1",
                        "field": "note.id",
                        "equals": "note-1",
                    },
                    "verify": {
                        "path": "/notes/note-1",
                        "field": "absent",
                        "equals": True,
                    },
                },
                "response_body": mocks[("POST", "/agent/request")],
            },
        ],
        "final_response": "Deleted Temporary note note-1 and verified absent.",
        "failure_category": None,
        "recovery_result": "not_needed",
        "error": None,
    }

    violations = "\n".join(grade_case(case, trace))
    assert "GET /agent/capabilities called 2 time(s); expected 1" in violations
    assert "API calls: 4 > 3" in violations

    trace["api_calls"].pop(2)
    precondition = trace["api_calls"][-1]["request_body"]["precondition"]
    precondition["field"] = "note.title"
    precondition["equals"] = "Temporary note"
    assert grade_case(case, trace) == []

    precondition["equals"] = "Another note"
    violations = "\n".join(grade_case(case, trace))
    assert "precondition is not grounded in a prior exact-target read" in violations


def test_contract_rejects_unknown_assertion_fields():
    malformed = {
        "schema": CASES_SCHEMA,
        "cases": [
            {
                "id": "bad",
                "prompt": "bad",
                "expect": {"max_magic": 1},
            }
        ],
    }

    with pytest.raises(ContractError, match="unknown field"):
        validate_cases_contract(malformed)
