import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log('PAGE ERROR:', err.message);
  });
  page.on('requestfailed', req => console.log('NET FAIL:', req.url()));
  page.on('response', resp => {
    if (resp.status() >= 400) console.log('HTTP', resp.status(), resp.url());
  });

  await page.goto('https://recommendations-worker.mhmudnasr30.workers.dev', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/tmp/worker-screenshot-verify.png', fullPage: true });
  console.log('Screenshot saved');

  await browser.close();

  if (errors.length === 0) {
    console.log('VERIFICATION PASSED: No JS errors found');
  } else {
    console.log('VERIFICATION FAILED: Found', errors.length, 'errors');
    writeFileSync('/tmp/worker-verify-errors.json', JSON.stringify(errors, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
