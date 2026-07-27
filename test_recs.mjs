import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
const logs = [];
p.on('pageerror', err => logs.push('PAGE_ERROR: ' + err.message));
await p.goto('http://localhost:8787/', { waitUntil: 'networkidle', timeout: 15000 });
// Wait for JS to execute and fetch to complete
await p.waitForTimeout(3000);
const bodyText = await p.evaluate(() => document.getElementById('list-body')?.innerText || 'NO LIST BODY');
console.log('LIST_BODY:', bodyText);
console.log('---PAGE_ERRORS---');
logs.forEach(l => console.log(l));
await b.close();
