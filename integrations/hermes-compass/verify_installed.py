"""Final installed-runtime verification; saves compact evidence, not notebook data."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import yaml

ROOT = Path(__file__).resolve().parent
HOME = Path.home()/'.hermes'
sys.path.insert(0,str(HOME/'hermes-agent'))
import model_tools
from tools.registry import registry

report = {}
for command in (["python",str(ROOT/'test_native.py'),'-v'],['hermes','plugins','doctor','compass-native','--ci']):
    result=subprocess.run(command,capture_output=True,text=True,timeout=90)
    assert result.returncode == 0, result.stdout+result.stderr
    report[' '.join(command)] = result.stdout+result.stderr
for name in ('plugin.yaml','__init__.py','tools.py','pdf_worker.py'):
    assert (ROOT/name).read_bytes() == (HOME/'plugins/compass-native'/name).read_bytes()
report['installed_hashes']={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ('plugin.yaml','__init__.py','tools.py','pdf_worker.py')}
for tool,args in [('compass_read',{'path':'/health','field':'status'}),('compass_notebooklm',{'action':'list'}),('compass_mutate',{'request':{'method':'POST','path':'/analytics/hermes/improvements','body':{'conversation_id':'20260905_003942_473fb5'},'dry_run':True}})]:
    result=json.loads(model_tools.handle_function_call(tool,args,session_id='native-tools-verification',turn_id='final',enabled_toolsets=['compass_native']))
    assert result['ok'],result
    if tool=='compass_mutate': assert result['data']['dry_run'] and result['data']['ok']
    report[tool]={'ok':True,'exit_code':result['exit_code']}
# Native tool registration is verified by runtime dispatch above, not file text.
report['tool_names']=[name for name in registry.get_all_tool_names() if name.startswith('compass_')]
# Check active skill metadata without rewriting historical snapshots.
paths=['workflow/learning-compass-site-operator','workflow/learning-compass-operating-system','media/media-transcription-systems','learning-notes-extractor','notebooklm','personal/taste-rec']
for relative in paths:
    p=HOME/'skills'/relative/'SKILL.md'; text=p.read_text(); front=yaml.safe_load(text.split('---',2)[1]); assert front.get('name') and front.get('description')
report['skill_frontmatter']='passed'
report['retired_skills_archived']=all((HOME/'skill-archives/native-compass-tools'/name/'SKILL.md').exists() for name in ['learning-compass-bridge','learning-thread-curation','learning-compass-visual-companion-operations'])
assert report['retired_skills_archived']
report['global_gate']='not_run: execute npm run verify:release separately for the complete repository release gate'
(ROOT/'verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ('installed_hashes',) and not k.startswith(('python ','hermes '))},indent=2))
