"""Read-only live smoke and discovery trial; creates no learning content."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
from dotenv import load_dotenv
load_dotenv(Path.home()/'.hermes/.env', override=False)
ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('compass_smoke',ROOT/'__init__.py',submodule_search_locations=[str(ROOT)])
assert spec and spec.loader
plugin=importlib.util.module_from_spec(spec);sys.modules[spec.name]=plugin;spec.loader.exec_module(plugin)
tools=sys.modules['compass_smoke.tools']
results={}
for name,args in [('compass_read',{'path':'/health'}),('compass_capabilities',{'q':'feedback','method':'POST'}),('compass_notebooklm',{'action':'list'})]:
    started=time.monotonic(); r=json.loads(tools.dispatch(name,args));results[name]={'elapsed_seconds':round(time.monotonic()-started,3),'result':r}
    print(name, 'ok=',r.get('ok'))
# Both engines receive the same public research queries, never personal context.
sys.path.insert(0,str(Path.home()/'.hermes/hermes-agent'))
from plugins.web.tavily.provider import TavilyWebSearchProvider
provider=TavilyWebSearchProvider()
results['search_trial']=[]
for q in ['Mathur dark patterns at scale 2019 Princeton original research','ProPublica TurboTax free file investigation 2019']:
    row={'query':q}
    for name,fn in [('exa',lambda:tools.exa({'query':q,'limit':5})),('tavily',lambda:provider.search(q,5))]:
        start=time.monotonic(); r=fn();row[name]={'elapsed_seconds':round(time.monotonic()-start,3),'result':r}
        print(name,json.dumps(r,ensure_ascii=False)[:14000])
    results['search_trial'].append(row)
path=ROOT/'live-smoke.json';path.write_text(json.dumps(tools.redact(results),ensure_ascii=False,indent=2));print('Evidence:',path)
