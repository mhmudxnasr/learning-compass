import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'

test('native prompt gate rejects schema drift, budget overflow, and unloaded memory without a model call', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      `
import importlib.util
spec = importlib.util.spec_from_file_location('prompt_gate', 'scripts/verify-hermes-prompt.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
report = dict(system_prompt_bytes=10, tool_schema_bytes=5, fixed_payload_bytes=15,
              skills_index_bytes=2, tools=['read'], tool_schema_sha256='hash',
              memory={'USER.md': dict(chars=4, readable=True, fully_loaded=True, tail_loaded=True)})
contract = dict(max_system_prompt_bytes=10, max_tool_schema_bytes=5, max_fixed_payload_bytes=15,
                max_skills_index_bytes=2, expected_tools=['read'], tool_schema_sha256='hash')
assert module.validate(report, contract, {'USER.md': 4}) == []
assert module.validate({**report, 'tool_schema_sha256': 'changed'}, contract, {'USER.md': 4})
assert module.validate({**report, 'tools': ['read', 'write']}, contract, {'USER.md': 4})
assert module.validate({**report, 'fixed_payload_bytes': 16}, contract, {'USER.md': 4})
report['memory']['USER.md']['fully_loaded'] = False
assert module.validate(report, contract, {'USER.md': 4})
`,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
