/** Clean same-origin fetch without browser prompt modals. */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'same-origin' })
}
