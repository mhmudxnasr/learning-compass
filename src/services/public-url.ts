const invalidIpv4 = (host: string) => {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || !parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return false
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 &&
      ((parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) ||
        (parts[1] === 88 && parts[2] === 99) ||
        parts[1] === 168)) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || (parts[1] === 51 && parts[2] === 100))) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
    parts[0] >= 224
  )
}

// WHATWG URL parsing canonicalizes ::ffff:127.0.0.1 to ::ffff:7f00:1.
// Reject the mapped range outright so a private IPv4 target cannot bypass the
// dotted-quad checks above. Public-only fetches do not need mapped literals.
const isIpv4MappedIpv6 = (host: string) => host.toLowerCase().startsWith('::ffff:')

// PushManager endpoints are browser-vendor capabilities, not user-selected
// webhooks. A fixed vendor-origin policy avoids a DNS-preflight/fetch
// time-of-check gap that the standard Workers fetch API cannot pin.
const TRUSTED_WEB_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
])
const isTrustedWebPushHost = (host: string) => TRUSTED_WEB_PUSH_HOSTS.has(host) || host.endsWith('.notify.windows.com')

export function validatePublicHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value || value.length >= 2048 || !/^https?:\/\/[^\s<>"']+$/i.test(value))
    throw new Error('invalid_public_url')
  const url = new URL(value)
  if (url.username || url.password) throw new Error('url_credentials_not_allowed')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const invalidIpv6 =
    host.includes(':') &&
    (host === '::1' ||
      host === '::' ||
      isIpv4MappedIpv6(host) ||
      /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host) ||
      host.startsWith('2001:db8:'))
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    invalidIpv4(host) ||
    invalidIpv6
  )
    throw new Error('private_or_local_url')
  url.hash = ''
  return url.toString()
}

export function validatePushEndpoint(value: unknown) {
  const endpoint = String(value || '').trim()
  if (endpoint.startsWith('browser://')) {
    if (!/^browser:\/\/[A-Za-z0-9._~-]{1,160}$/.test(endpoint)) throw new Error('invalid_browser_push_endpoint')
    return endpoint
  }
  const publicUrl = validatePublicHttpUrl(endpoint)
  const url = new URL(publicUrl)
  if (url.protocol !== 'https:') throw new Error('push_endpoint_requires_https')
  if (!isTrustedWebPushHost(url.hostname.toLowerCase()) || (url.port && url.port !== '443'))
    throw new Error('push_endpoint_origin_not_allowed')
  return publicUrl
}
