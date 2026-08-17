const DEFAULT_ORIGIN = 'http://localhost:8787'

async function openCapture(source) {
  const saved = await chrome.storage.local.get({ appOrigin: DEFAULT_ORIGIN })
  const origin = String(saved.appOrigin || DEFAULT_ORIGIN).replace(/\/$/, '')
  const href = `${origin}/#/library?mode=triage&focus=inbox&capture=${encodeURIComponent(source)}`
  await chrome.tabs.create({ url: href })
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'capture-page', title: 'Capture page to Learning Compass', contexts: ['page', 'link'] })
  chrome.contextMenus.create({ id: 'capture-selection', title: 'Capture selection to Learning Compass', contexts: ['selection'] })
})

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.url) await openCapture(tab.url)
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'capture-selection' && info.selectionText) {
    const source = tab?.url ? `${info.selectionText.trim()}\n\nSource: ${tab.url}` : info.selectionText.trim()
    await openCapture(source)
    return
  }
  const source = info.linkUrl || tab?.url
  if (source) await openCapture(source)
})
