const invalidIpv4 = (host: string) => {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || !parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return false
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && ((parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) || (parts[1] === 88 && parts[2] === 99) || parts[1] === 168)) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || (parts[1] === 51 && parts[2] === 100))) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || parts[0] >= 224
}

export function validatePublicHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value || value.length >= 2048 || !/^https?:\/\/[^\s<>"']+$/i.test(value)) throw new Error('invalid_public_url')
  const url = new URL(value)
  if (url.username || url.password) throw new Error('url_credentials_not_allowed')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const invalidIpv6 = host === '::1' || host === '::' || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host) || host.startsWith('2001:db8:')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || invalidIpv4(host) || invalidIpv6) throw new Error('private_or_local_url')
  url.hash = ''
  return url.toString()
}
