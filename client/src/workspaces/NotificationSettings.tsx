import { useState } from 'preact/hooks'
import { api, formatDate } from '../api'
import { useData } from '../app/useData'
import { notificationErrorMessage } from './notificationErrors'

type NotificationState = {
  browser?: { enabled?: boolean; subscription_id?: string } | null
  subscriptions?: Array<{ id: string; channel: string; enabled: number; created_at: string }>
  deliveries?: Array<{
    id: string
    channel: string
    status: string
    error?: string | null
    attempted_at: string
    delivered_at?: string | null
  }>
}
type VapidState = { configured?: boolean; public_key?: string | null }
const DEVICE_SUBSCRIPTION_KEY = 'learning-compass:push-subscription-id'

function applicationServerKey(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const raw = atob(padded)
    if (raw.length !== 65 || raw.charCodeAt(0) !== 4) throw new Error('Invalid P-256 public key')
    return Uint8Array.from(raw, (character) => character.charCodeAt(0))
  } catch (cause) {
    throw new Error('notification_configuration_invalid', { cause })
  }
}

export function NotificationSettings() {
  const notifications = useData<NotificationState>('/notifications')
  const vapid = useData<VapidState>('/notifications/vapid')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [deviceSubscriptionId, setDeviceSubscriptionId] = useState(() => {
    try {
      return localStorage.getItem(DEVICE_SUBSCRIPTION_KEY) || ''
    } catch {
      return ''
    }
  })
  const supported =
    typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  const enabled = Boolean(
    deviceSubscriptionId &&
    notifications.data?.subscriptions?.some((item) => item.id === deviceSubscriptionId && item.enabled),
  )
  const latest = notifications.data?.deliveries?.find((item) => item.channel === 'browser')

  const enable = async () => {
    if (!supported || !vapid.data?.configured || !vapid.data.public_key) {
      setMessage(
        'Reminders are unavailable here. Use a browser with notification support. If setup is missing, ask Hermes to configure browser notifications.',
      )
      return
    }
    setWorking(true)
    setMessage('Enabling reminders…')
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        const key = applicationServerKey(vapid.data.public_key)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key.buffer as ArrayBuffer,
        })
      }
      const value = subscription.toJSON()
      const result = await api<{ id: string }>('/notifications/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint, keys: value.keys || {} }),
      })
      try {
        localStorage.setItem(DEVICE_SUBSCRIPTION_KEY, result.id)
      } catch {}
      setDeviceSubscriptionId(result.id)
      setMessage('Browser reminders are enabled on this device.')
      notifications.reload()
    } catch (error) {
      setMessage(notificationErrorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const disable = async () => {
    const id = deviceSubscriptionId
    if (!id) return
    setWorking(true)
    setMessage('Disabling reminders…')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await subscription.unsubscribe()
      await api(`/notifications/push/${encodeURIComponent(id)}`, { method: 'DELETE' })
      try {
        localStorage.removeItem(DEVICE_SUBSCRIPTION_KEY)
      } catch {}
      setDeviceSubscriptionId('')
      setMessage('Browser reminders are disabled on this device.')
      notifications.reload()
    } catch (error) {
      setMessage(notificationErrorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const testDelivery = async () => {
    setWorking(true)
    setMessage('Sending a test reminder…')
    try {
      const result = await api<{ status?: string; error?: string | null }>('/notifications/test', {
        method: 'POST',
        body: JSON.stringify({ channel: 'browser' }),
      })
      setMessage(result.status === 'delivered' ? 'Test reminder delivered.' : notificationErrorMessage(result.error))
      notifications.reload()
    } catch (error) {
      setMessage(notificationErrorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  return (
    <article class="preference-setting-group notification-settings">
      <div class="preference-group-heading">
        <span>Delivery</span>
        <h3>Browser reminders</h3>
        <p>Enable due-recall notifications explicitly on each device.</p>
      </div>
      <div class="setting-row">
        <div>
          <strong>Device status</strong>
          <span>
            {!supported
              ? 'Push is unavailable in this browser.'
              : notifications.error || vapid.error
                ? 'Reminder status could not be loaded. Check your connection and retry.'
                : notifications.loading || vapid.loading
                  ? 'Checking this device…'
                  : !vapid.data?.configured
                    ? 'Reminder delivery has not been configured yet.'
                    : enabled
                      ? 'This browser has an active push subscription.'
                      : 'Notifications remain off until you enable them.'}
          </span>
        </div>
        <span class={`setting-value ${enabled ? 'is-active' : ''}`}>{enabled ? 'Enabled' : 'Off'}</span>
      </div>
      <div class="notification-setting-actions">
        {(notifications.error || vapid.error) && (
          <button
            type="button"
            class="button secondary"
            onClick={() => {
              notifications.reload()
              vapid.reload()
            }}
          >
            Retry status
          </button>
        )}
        {enabled ? (
          <button type="button" class="button secondary" disabled={working} onClick={disable}>
            Disable
          </button>
        ) : (
          <button
            type="button"
            class="button primary"
            disabled={working || notifications.loading || vapid.loading}
            onClick={enable}
          >
            Enable reminders
          </button>
        )}
        <button type="button" class="button secondary" disabled={working || !enabled} onClick={testDelivery}>
          Send test
        </button>
      </div>
      <details class="notification-help">
        <summary>Reminder troubleshooting</summary>
        <p>
          For blocked permission, allow notifications in this browser’s site settings and try again. For an expired
          subscription, disable reminders here and enable them again.
        </p>
        <p>
          Missing or invalid delivery keys need a server repair. Ask Hermes: “Check browser notification setup and
          repair the delivery keys.” After setup is repaired, enable reminders and send a test from this device.
        </p>
      </details>
      {latest && (
        <small class="notification-last-delivery">
          Last attempt {formatDate(latest.attempted_at)} · {latest.status}
          {latest.error ? ` · ${notificationErrorMessage(latest.error)}` : ''}
        </small>
      )}
      {message && (
        <output class="settings-status" aria-live="polite">
          {message}
        </output>
      )}
    </article>
  )
}
