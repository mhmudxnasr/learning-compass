import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('compass_test', ROOT / '__init__.py', submodule_search_locations=[str(ROOT)])
plugin = importlib.util.module_from_spec(spec); sys.modules[spec.name] = plugin; spec.loader.exec_module(plugin)
tools = sys.modules['compass_test.tools']

class NativeTests(unittest.TestCase):
    def test_registration_and_guard(self):
        class Context:
            def __init__(self): self.tools = {}
            def register_hook(self, name, callback): self.hook = callback
            def register_tool(self, **kwargs): self.tools[kwargs['name']] = kwargs
        ctx = Context(); plugin.register(ctx)
        self.assertEqual(set(ctx.tools), set(tools.HANDLERS))
        bad = json.loads(ctx.tools['compass_mutate']['handler']({'request': {'method':'POST','path':'/capture','body':{}}}))
        self.assertFalse(bad['ok'])
        self.assertIn('idempotency', bad['message'])
        with patch.object(tools, 'run', return_value={'ok': True}) as run:
            tools.mutate({'request': {'method':'POST','path':'/capture','body':{},'dry_run':True}})
            argv = run.call_args.args[0]
            self.assertEqual(argv[2], 'mutate')
            self.assertNotIn('/capture', argv)

    def test_turn_context_is_scoped_and_inherited(self):
        with patch.dict(os.environ, {}, clear=True):
            tools.bind_turn(turn_id='one', session_id='session')
            first = tools.child_env()['HERMES_TURN_ID']
            tools.bind_turn(turn_id='one', session_id='session')
            self.assertEqual(first, tools.child_env()['HERMES_TURN_ID'])
            tools.bind_turn(turn_id='two', session_id='session')
            self.assertNotEqual(first, tools.child_env()['HERMES_TURN_ID'])
            with patch.dict(os.environ, {'HERMES_TURN_ID':'caller-turn'}):
                self.assertEqual(tools.child_env()['HERMES_TURN_ID'], 'caller-turn')
            tools.bind_turn()
            self.assertNotIn('HERMES_TURN_ID', tools.child_env())

    def test_origin_rejected(self):
        self.assertFalse(json.loads(tools.dispatch('compass_read', {'path': 'https://evil.example/a'}))['ok'])

    def test_notebook_no_reset_or_poll(self):
        nb = 'c475e0ed-1966-4e0d-ae66-9e154c3fdedd'
        cmd = tools.notebook_command({'action':'ask','notebook_id':nb,'text':'What is the source?'})
        self.assertNotIn('--new', cmd); self.assertNotIn('--yes', cmd)
        for action in ('delete','poll','share'):
            with self.assertRaises(ValueError): tools.notebook_command({'action':action,'notebook_id':nb})
        with self.assertRaises(ValueError): tools.notebook_command({'action':'ask','notebook_id':nb,'text':'--new'})
        with self.assertRaises(ValueError): tools.notebook_command({'action':'sources','notebook_id':'c475'})
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'prompt.txt'; p.write_text('Teach in Egyptian Arabic.')
            # Real CLI help verifies quiz does not accept --language.
            cmd = tools.notebook_command({'action':'generate','notebook_id':nb,'format':'quiz','prompt_file':str(p)})
            self.assertIn('--no-wait',cmd); self.assertNotIn('--language',cmd)

    def test_output_bound_and_timeout(self):
        self.assertEqual(tools.run([sys.executable,'-c','print("x"*20000)'])['error'],'output_limit')
        self.assertEqual(tools.run([sys.executable,'-c','import time; time.sleep(10)'],timeout=.1)['error'],'timeout')

    def test_scanned_pdf_ocr(self):
        import fitz
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = fitz.open(); page = original.new_page()
            page.insert_text((40,70), 'Scanned evidence preserves page anchors and source meaning.', fontsize=18)
            image = page.get_pixmap(matrix=fitz.Matrix(2,2)).tobytes('png')
            scanned = fitz.open(); page = scanned.new_page(); page.insert_image(page.rect, stream=image)
            source = root/'scan.pdf'; scanned.save(source); scanned.close(); original.close()
            with patch.object(tools, 'workspace', side_effect=lambda: Path(tempfile.mkdtemp(dir=root))):
                result = tools.pdf_evidence({'path':str(source), 'ocr':True})
            self.assertTrue(result['ok'], result)
            evidence = json.loads(Path(result['data']['path']).read_text())
            self.assertIn('Scanned evidence', evidence['pages'][0]['text'])
            self.assertEqual(evidence['pages'][0]['method'], 'tesseract-ara+eng')
            self.assertFalse(evidence['pages'][0]['ocr_verified'])

    def test_local_extraction_and_pdf(self):
        import fitz
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); source = root/'source.txt'
            source.write_text('A deterministic test source preserves all its words and its provenance rather than silently inventing missing evidence.')
            with patch.object(tools, 'workspace', side_effect=lambda: Path(tempfile.mkdtemp(dir=root))):
                result = tools.extract({'source':str(source),'kind':'text'})
                self.assertTrue(result['ok'],result)
                self.assertEqual(Path(result['text_path']).read_text().strip(), source.read_text())
                pdf = root/'fixture.pdf'; doc = fitz.open(); p = doc.new_page()
                p.insert_text((50,50),'This fixture preserves source text and highlighted evidence for a reliable page anchored extraction.')
                p.add_highlight_annot(p.search_for('source text'))
                p.add_ink_annot([[(50,100),(60,110),(70,100)]])
                doc.save(pdf); doc.close()
                result = tools.pdf_evidence({'path':str(pdf),'ocr':False})
                self.assertTrue(result['ok'],result)
                evidence = json.loads(Path(result['data']['path']).read_text())
                self.assertEqual(evidence['pages'][0]['page'],1)
                self.assertEqual(len(evidence['pages'][0]['annotations']),2)
                self.assertEqual(evidence['pages'][0]['annotations'][1]['handwriting_status'],'requires_vision_review')

if __name__ == '__main__': unittest.main()
