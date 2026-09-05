import assert from 'node:assert/strict'
import test from 'node:test'
import { notificationErrorMessage } from '../../client/src/workspaces/notificationErrors.ts'

test('notification failures explain a concrete recovery without leaking browser or server diagnostics', () => {
  for (const [error, expected] of [
    [new Error('atob: invalid base64'), /keys need repair/],
    ['notification_configuration_invalid', /Ask Hermes to repair/],
    [new Error('NotAllowedError: permission denied'), /site permissions/],
    [new Error('Failed to fetch'), /connection/],
    ['410 Gone: expired subscription', /Disable reminders, then enable/],
    ['internal exception at worker line 100', /Try again/],
  ] as const) {
    const message = notificationErrorMessage(error)
    assert.match(message, expected)
    assert.doesNotMatch(message, /atob|base64|worker line|NotAllowedError/)
  }
})
