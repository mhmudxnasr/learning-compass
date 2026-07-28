import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
p.on('console', m => logs.push(m.type()+': '+m.text()));
p.on('pageerror', e => logs.push('PAGEERROR: '+e.message));
p.on('requestfailed', r => logs.push('REQFAIL: '+r.url()+' '+r.failure()?.errorText));
p.on('response', r => { if (r.url().includes('cytoscape')) logs.push('cyResp: '+r.status()+' '+r.url()); });
await p.goto('https://recommendations-worker.mhmudnasr30.workers.dev/', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'Map' }).click();
await p.waitForTimeout(4000);
const info = await p.evaluate(() => ({
  hasCyLib: typeof window.cytoscape,
  mount: !!document.querySelector('.cy-mount'),
  canvasCount: document.querySelectorAll('.cy-mount canvas').length,
  stage: !!document.querySelector('.canvas-stage'),
  ctrls: !!document.querySelector('.canvas-ctrls'),
  zoomPct: document.querySelector('.canvas-zoom-pct')?.textContent,
  centerStat: document.querySelector('#cy-center-count')?.textContent,
}));
console.log('INFO', JSON.stringify(info, null, 1));
console.log('LOGS', logs.slice(0, 20).join('\n'));
await p.screenshot({ path: '/tmp/live_map.png' });
await b.close();
