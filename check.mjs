import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('https://recommendations-worker.mhmudnasr30.workers.dev/#/curate/queue', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const bb = document.getElementById('batch-bar');
  const cs = getComputedStyle(bb);
  return { position: cs.position, bottom: cs.bottom, left: cs.left, top: cs.top, width: cs.width, height: cs.height };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '/tmp/after.png', fullPage: false });
await browser.close();
