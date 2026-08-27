/** Same-origin fetch used by every browser network boundary. */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'same-origin' })
}

export function __resetBrowserAuthForTests() {}
