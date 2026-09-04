"""Inspect native Hermes offline and enforce the checked-in prompt contract.

Uses Hermes's inspection agent with dummy credentials. No model request is made;
only sizes, tool names, schema hashes, and memory-loading booleans leave the process.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
HERMES = Path.home() / '.hermes'
sys.path.insert(0, str(HERMES / 'hermes-agent'))


def measure():
    from hermes_cli.prompt_size import _build_inspection_agent, _SKILLS_BLOCK_RE, _tool_name
    from agent.system_prompt import build_system_prompt

    agent = _build_inspection_agent('telegram')
    prompt = build_system_prompt(agent)
    tools = sorted(agent.tools or [], key=_tool_name)
    tool_json = json.dumps(tools, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    skills = _SKILLS_BLOCK_RE.search(prompt)
    memory = {}
    for name in ['MEMORY.md', 'USER.md']:
        text = (HERMES / 'memories' / name).read_text().strip()
        memory[name] = {
            'chars': len(text),
            'readable': bool(text),
            'fully_loaded': bool(text) and text in prompt,
            'tail_loaded': bool(text) and text[-80:] in prompt,
        }
    return {
        'platform': 'telegram',
        'system_prompt_bytes': len(prompt.encode()),
        'tool_schema_bytes': len(tool_json.encode()),
        'fixed_payload_bytes': len(prompt.encode()) + len(tool_json.encode()),
        'skills_index_bytes': len(skills.group(0).encode()) if skills else 0,
        'tools': sorted(_tool_name(tool) for tool in tools),
        'tool_schema_sha256': hashlib.sha256(tool_json.encode()).hexdigest(),
        'memory': memory,
    }


def validate(report, contract, limits):
    errors = []
    for field in ['system_prompt_bytes', 'tool_schema_bytes', 'fixed_payload_bytes', 'skills_index_bytes']:
        if report[field] > contract['max_' + field]:
            errors.append(f"{field}: {report[field]}/{contract['max_' + field]}")
    if report['tools'] != sorted(contract['expected_tools']):
        errors.append('native tool inventory changed')
    if report['tool_schema_sha256'] != contract['tool_schema_sha256']:
        errors.append('native tool schema changed')
    for name, memory in report['memory'].items():
        if memory['chars'] > limits[name]:
            errors.append(f'{name} exceeds its character budget')
        if not all(memory[key] for key in ['readable', 'fully_loaded', 'tail_loaded']):
            errors.append(f'{name} is missing or truncated in the actual prompt')
    return errors


if __name__ == '__main__':
    runtime = HERMES / 'hermes-agent' / 'venv'
    if Path(sys.prefix).resolve() != runtime.resolve():
        os.execv(str(runtime / 'bin/python'), [str(runtime / 'bin/python'), __file__, *sys.argv[1:]])
    report = measure()
    if '--measure' in sys.argv:
        print(json.dumps(report, indent=2))
    else:
        contract = json.loads((ROOT / 'docs/hermes-prompt-budget.json').read_text())
        limits = json.loads((ROOT / 'docs/hermes-contract.json').read_text())['runtime_budgets']['memory_chars']
        errors = validate(report, contract, limits)
        print(json.dumps({'ok': not errors, 'errors': errors, **report}, indent=2))
        sys.exit(bool(errors))
