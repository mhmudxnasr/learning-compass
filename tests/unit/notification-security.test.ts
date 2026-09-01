import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validatePublicHttpUrl, validatePushEndpoint } from '../../src/services/public-url.ts'
import { redactSensitiveText } from '../../src/lib.ts'

test('browser push endpoints are in-app identifiers or public HTTPS URLs only', () => {
  assert.equal(validatePushEndpoint('browser://local-device'), 'browser://local-device')
  assert.equal(
    validatePushEndpoint('https://FCM.GoogleApis.com/fcm/send/subscription#fragment'),
    'https://fcm.googleapis.com/fcm/send/subscription',
  )
  assert.equal(
    validatePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/subscription'),
    'https://updates.push.services.mozilla.com/wpush/v2/subscription',
  )
  assert.equal(
    validatePushEndpoint('https://web.push.apple.com/Q/subscription'),
    'https://web.push.apple.com/Q/subscription',
  )
  assert.equal(
    validatePushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=opaque'),
    'https://wns2-db5p.notify.windows.com/w/?token=opaque',
  )
  for (const endpoint of [
    'browser://',
    'browser://bad/path',
    `browser://${'x'.repeat(161)}`,
    'http://push.example.com/subscription',
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://10.0.0.2/push',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/push',
    'https://[::ffff:127.0.0.1]/push',
    'https://[::ffff:10.0.0.1]/push',
    'https://[::ffff:169.254.169.254]/latest/meta-data',
    'https://user:secret@push.example.com/subscription',
    'https://push.example.com/subscription',
    'https://fcm.googleapis.com:8443/fcm/send/subscription',
  ])
    assert.throws(() => validatePushEndpoint(endpoint))
})

test('public URL validation rejects IPv4-mapped private IPv6 literals before any fetch', () => {
  for (const endpoint of [
    'https://[::ffff:127.0.0.1]/push',
    'https://[::ffff:10.0.0.1]/push',
    'https://[::ffff:169.254.169.254]/latest/meta-data',
  ])
    assert.throws(() => validatePublicHttpUrl(endpoint), /private_or_local_url/)
})

test('web push delivery never follows an endpoint redirect', () => {
  const source = readFileSync('src/api/notifications.ts', 'utf8')
  assert.match(source, /fetch\(endpoint,\s*\{[\s\S]*?method: 'POST',[\s\S]*?redirect: 'manual'/)
  assert.match(source, /Push service redirects are not allowed/)
})

test('operational error text redacts credentials and stays bounded', () => {
  const samples = [
    ['authoriz', 'ation=credential-value'].join(''),
    '{"api_key":"json-credential-value"}',
    'https://provider.example/run?key=query-credential-value&mode=safe',
    'x-goog-api-key: header-credential-value',
  ]
  for (const sample of samples) {
    const redacted = redactSensitiveText(new Error(`upstream failed: ${sample}`), 200)
    assert.doesNotMatch(redacted, /credential-value/)
    assert.match(redacted, /\[redacted\]/)
  }
  assert.ok(redactSensitiveText('x'.repeat(200), 80).length <= 80)
})
