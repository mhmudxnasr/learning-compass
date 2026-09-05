export function notificationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/atob|base64|vapid|applicationserverkey|notification_configuration_invalid/i.test(message))
    return 'Notification keys need repair. Ask Hermes to repair browser notification setup, then enable reminders again.'
  if (/permission|denied|notallowed/i.test(message))
    return 'Allow notifications in this browser’s site permissions, then enable reminders again.'
  if (/network|fetch|offline|timeout/i.test(message))
    return 'Could not reach the reminder service. Check your connection and try again.'
  if (/expired|gone|subscription|410/i.test(message))
    return 'This browser’s reminder subscription needs renewal. Disable reminders, then enable them again.'
  return 'The reminder could not be delivered. Try again. If it still fails, ask Hermes to check browser notification delivery.'
}
