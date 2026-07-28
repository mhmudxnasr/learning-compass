import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const t0 = Date.now();
await page.goto('https://recommendations-worker.mhmudnasr30.workers.dev/#/map/canvas', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(100);
const initRender = await page.evaluate(() => {
  const t0 = performance.now();
  // Simulate clicking the canvas tab from a different view
  const tabs = document.querySelectorAll('.ws-subnav a, .ws-subnav button, [data-sub]');
  console.log('TABS:', tabs.length);
  // Force measurement of node creation
  return { time: performance.now() - t0, nodes: document.querySelectorAll('.canvas-node').length };
});
console.log('First measure:', JSON.stringify(initRender));
await page.waitForTimeout(2000);
// Now measure switching FROM another tab TO canvas (the slow path)
const switchStart = Date.now();
await page.evaluate(() => { location.hash = '#/map/branches'; });
await page.waitForTimeout(2000);
await page.evaluate(() => { location.hash = '#/map/canvas'; });
// Measure how long until nodes appear
let measured = false;
const obs = await page.evaluate(() => new Promise(resolve => {
  const t0 = performance.now();
  const check = () => {
    const n = document.querySelectorAll('.canvas-node').length;
    if (n > 0) { resolve({ time: performance.now() - t0, count: n }); }
    else { requestAnimationFrame(check); }
  };
  check();
}));
console.log('Switch render time:', JSON.stringify(obs));
await browser.close();
