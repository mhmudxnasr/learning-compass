import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const manifest = JSON.parse(readFileSync(new URL('../../client/public/manifest.json', import.meta.url), 'utf8'))
const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8')
const entry = readFileSync(new URL('../../client/src/app/entry.tsx', import.meta.url), 'utf8')
const android = readFileSync(new URL('../../client/src/app/android.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../../client/public/sw.js', import.meta.url), 'utf8')
const server = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('Android manifest is installable and keeps capture inside the canonical source ledger', () => {
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/#/home')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.some((icon: any) => icon.sizes === '192x192' && icon.type === 'image/png'))
  assert.ok(manifest.icons.some((icon: any) => icon.sizes === '512x512' && icon.type === 'image/png'))
  assert.ok(manifest.icons.some((icon: any) => icon.purpose === 'maskable'))
  assert.equal(manifest.share_target?.action, '/api/share-target')
  assert.equal(manifest.shortcuts?.[0]?.url, '/#/home?action=capture')
  assert.equal(manifest.launch_handler?.client_mode, 'navigate-existing')
})

test('launcher assets have the exact Android dimensions and are served without private API auth', () => {
  for (const [name, size] of [['compass-192.png', 192], ['compass-512.png', 512], ['compass-maskable-512.png', 512]] as const) {
    const png = readFileSync(new URL(`../../client/public/icons/${name}`, import.meta.url))
    assert.ok(png.length > 1000, `${name} is missing or empty`)
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${name} is not a PNG`)
    assert.equal(png.readUInt32BE(16), size, `${name} has the wrong width`)
    assert.equal(png.readUInt32BE(20), size, `${name} has the wrong height`)
  }
  assert.match(server, /path\.startsWith\('\/icons\/'\)/)
  assert.match(server, /app\.get\('\/icons\/\*', \(c\) => c\.env\.ASSETS\.fetch/)
  assert.match(server, /app\.get\('\/manifest\.json', async \(c\) =>/)
})

test('the app links its manifest, registers the service worker, and exposes a respectful install action', () => {
  assert.match(html, /<link rel="manifest" href="\/manifest\.json" \/>/)
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/)
  assert.match(entry, /initAndroidExperience\(\)/)
  assert.match(android, /serviceWorker\.register\('\/sw\.js'/)
  assert.match(android, /beforeinstallprompt/)
  assert.match(android, /DISMISS_FOR_MS = 30 \* 24 \* 60 \* 60 \* 1000/)
  assert.match(worker, /cacheShell\(\)/)
  assert.match(worker, /CORE_DATA = \['\/dashboard\/briefing'\]/)
  assert.match(worker, /learning-compass-shell-v\d+/)
  assert.match(worker, /learning-compass-html-artifacts-v1/)
  assert.match(worker, /isArtifactNavigation\(url\)/)
  assert.match(worker, /cache\.put\(request, response\.clone\(\)\)/)
  assert.match(worker, /isAppShellNavigation\(url\)/)
  assert.match(worker, /\/icons\/compass-maskable-512\.png/)
  assert.match(server, /\/#\/library\/source\/\$\{encodeURIComponent\(result\.id\)\}/)
  assert.match(server, /action: 'capture', share: 'retry'/)
})
