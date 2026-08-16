import { chromium } from 'playwright'

async function run() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  page.on('console', msg => console.log('LOG [', msg.type(), ']:', msg.text()))
  page.on('pageerror', err => console.log('UNCAUGHT EXCEPTION:', err.message, '\nStack:', err.stack))

  const urls = [
    'https://recommendations-worker.mhmudnasr30.workers.dev/#/home',
    'https://recommendations-worker.mhmudnasr30.workers.dev/#/library/queue',
    'https://recommendations-worker.mhmudnasr30.workers.dev/#/library/source/rec_1786505440065_6rwvj',
    'https://recommendations-worker.mhmudnasr30.workers.dev/#/library/source/cap_1786503096603_244a1b',
    'https://recommendations-worker.mhmudnasr30.workers.dev/#/learn',
    'https://recommendations-worker.mhmudnasr30.workers.dev/#/map',
    'https://recommendations-worker.mhmudnasr30.workers.dev/#/settings',
  ]

  for (const u of urls) {
    console.log(`\n================ Testing ${u} ================`)
    await page.goto(u)
    await page.waitForTimeout(2000)
    const errorBoundary = await page.$('.app-error-boundary')
    if (errorBoundary) {
      console.error('CRASH DETECTED ON', u, ':\n', await errorBoundary.innerText())
    } else {
      console.log('OK, page title:', await page.title(), 'body length:', (await page.innerText('body')).length)
    }
  }

  await browser.close()
}

run().catch(console.error)
