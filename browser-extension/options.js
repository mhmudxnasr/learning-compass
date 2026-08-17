const origin = document.querySelector('#origin')
const status = document.querySelector('#status')
chrome.storage.local.get({ appOrigin: 'http://localhost:8787' }).then((value) => { origin.value = value.appOrigin })
document.querySelector('#save').addEventListener('click', async () => {
  const value = origin.value.trim().replace(/\/$/, '')
  try { new URL(value) } catch { status.textContent = 'Enter a valid app origin.'; return }
  await chrome.storage.local.set({ appOrigin: value })
  status.textContent = 'Saved.'
})
