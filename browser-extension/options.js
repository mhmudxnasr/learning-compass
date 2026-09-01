import { DEFAULT_APP_ORIGIN } from './config.js'

const origin = document.querySelector('#origin')
const status = document.querySelector('#status')
const form = document.querySelector('#origin-form')

if (
  !(origin instanceof HTMLInputElement) ||
  !(status instanceof HTMLOutputElement) ||
  !(form instanceof HTMLFormElement)
) {
  throw new Error('Learning Compass extension options are incomplete.')
}

chrome.storage.local.get({ appOrigin: DEFAULT_APP_ORIGIN }).then((value) => {
  origin.value = value.appOrigin
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const value = origin.value.trim().replace(/\/$/, '')
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol')
  } catch {
    status.textContent = 'Enter a valid HTTP or HTTPS app origin.'
    return
  }
  await chrome.storage.local.set({ appOrigin: value })
  status.textContent = 'Saved.'
})
