import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const scripts = '/home/mahmud/.hermes/skills/lite-visual/scripts'
function python(code: string) {
  const result = spawnSync('python3', ['-c', `import sys; sys.path.insert(0,${JSON.stringify(scripts)})\n` + code], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

test('bulk PDF inspection checks every page, preserves separators, and rejects a blank or non-A4 middle page', () => {
  python(`import tempfile,fitz
from pathlib import Path
import validate_artifact as v
text='Every page must preserve its complete readable text and the original source order.'
with tempfile.TemporaryDirectory() as folder:
 path=Path(folder)/'pages.pdf'
 for mode in ['valid','blank','letter']:
  document=fitz.open()
  for index in range(3):
   page=document.new_page(width=612 if mode=='letter' and index==1 else 595,height=792 if mode=='letter' and index==1 else 842)
   if not(mode=='blank' and index==1):page.insert_text((40,50),text,fontsize=10)
  document.save(path);document.close()
  if mode=='valid':
   actual=v.run;calls=[]
   def recorded(command,label,cwd=None):
    calls.append(command);return actual(command,label,cwd)
   v.run=recorded
   assert v.check_pdf(path,' '.join([text]*3),text,{'scope':[text]})['pages']==3
   assert len(calls)==3, calls
   v.run=actual
  else:
   try:v.check_pdf(path,' '.join([text]*3),text,{})
   except v.ValidationError as error:
    assert 'page 2' in str(error),error
    assert ('near-empty' if mode=='blank' else 'not A4') in str(error),error
   else:raise AssertionError(mode+' PDF passed')`)
})

test('bounded commands preserve raw output and terminate descendant work on timeout', () => {
  python(`import os,time,tempfile,json
from pathlib import Path
from process_runtime import execute,ProcessFailure
assert execute([sys.executable,'-c',"print('one\\\\ftwo\\\\f'.replace('\\\\f','\\f'))"],'page-boundary fixture').endswith('\\f\\n')
with tempfile.TemporaryDirectory() as folder:
 marker=Path(folder)/'late-write'
 child="import time;from pathlib import Path;time.sleep(1.5);Path("+repr(str(marker))+").write_text('leaked')"
 parent="import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',"+repr(child)+"]);time.sleep(60)"
 started=time.monotonic()
 try:execute([sys.executable,'-c',parent],'stall fixture',timeout=.3)
 except ProcessFailure as error:assert 'timed out' in str(error)
 else:raise AssertionError('stall accepted')
 assert time.monotonic()-started < 3
 time.sleep(1.6)
 assert not marker.exists(),'descendant survived its timeout'
os.environ['LITE_VISUAL_STEP_TIMEOUT_SECONDS']='nan'
try:execute([sys.executable,'-c','pass'],'invalid limit')
except ProcessFailure:pass
else:raise AssertionError('invalid deadline accepted')`)
})

test('a busy workspace fails promptly and an exception releases its lock', () => {
  python(`import tempfile,time
from pathlib import Path
import run_workflow as w
with tempfile.TemporaryDirectory() as folder:
 root=Path(folder)
 with w.workspace_lock(root):
  started=time.monotonic()
  try:
   with w.workspace_lock(root):raise AssertionError('duplicate lock accepted')
  except w.WorkflowError as error:assert 'workspace busy' in str(error)
  assert time.monotonic()-started < 1
 try:
  with w.workspace_lock(root):raise ValueError('preflight failed')
 except ValueError:pass
 with w.workspace_lock(root):pass`)
})

test('fast browser inspection still rejects fixed overlays and hidden final paragraphs in a long article', () => {
  python(`import tempfile
from pathlib import Path
import validate_artifact as v
text='الفكرة هنا إننا نفهم السبب خطوة بخطوة ونوضح إزاي النتيجة حصلت وإمتى التفسير ده يفضل صحيح.'
with tempfile.TemporaryDirectory() as folder:
 path=Path(folder)/'article.html'
 for mode in ['valid','last-hidden','overlay']:
  paragraphs=''.join('<p id="p-'+str(i)+'">'+text+'</p>' for i in range(60))
  css='#p-59{visibility:hidden}' if mode=='last-hidden' else ''
  overlay='<div style="position:fixed;inset:0;background:white;z-index:9999"></div>' if mode=='overlay' else ''
  path.write_text('<html dir="rtl"><meta charset="utf-8"><style>body{font-size:18px;line-height:1.9;background:white;color:#111;margin:20px}p{overflow-wrap:anywhere}'+css+'</style><body><article data-canonical-content="true">'+paragraphs+'</article>'+overlay+'</body></html>')
  if mode=='valid':assert v.check_browser(path,0)['print_reading_text_nodes']==60
  else:
   try:v.check_browser(path,0)
   except v.ValidationError as error:assert 'unreadable' in str(error),error
   else:raise AssertionError(mode+' passed')`)
})
