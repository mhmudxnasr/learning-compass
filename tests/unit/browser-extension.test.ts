import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (name: string) => readFileSync(new URL(`../../browser-extension/${name}`, import.meta.url), 'utf8')

test('the capture extension has a complete least-privilege options flow', () => {
  const manifest = JSON.parse(read('manifest.json'))
  const options = read('options.html')
  const config = read('config.js')

  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.permissions, ['activeTab', 'contextMenus', 'storage'])
  assert.equal(manifest.options_page, 'options.html')
  assert.match(options, /id="origin-form"/)
  assert.match(options, /type="module" src="options\.js"/)
  assert.match(config, /https:\/\/recommendations-worker\.mhmudnasr30\.workers\.dev/)
})
