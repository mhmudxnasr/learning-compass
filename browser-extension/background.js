const DEFAULT_ORIGIN = 'http://localhost:8787'

async function openCapture(source) {
  const saved = await chrome.storage.local.get({ appOrigin: DEFAULT_ORIGIN })
  const origin = String(saved.appOrigin || DEFAULT_ORIGIN).replace(/\/$/, '')
  const href = `${origin}/#/home?capture=${encodeURIComponent(source)}`
  await chrome.tabs.create({ url: href })
}

async function openAnchor({ sourceUrl, quote, title = '' }) {
  const saved = await chrome.storage.local.get({ appOrigin: DEFAULT_ORIGIN })
  const origin = String(saved.appOrigin || DEFAULT_ORIGIN).replace(/\/$/, '')
  const params = new URLSearchParams({ mode: 'practice', focus: 'notes', anchor_url: sourceUrl, anchor_quote: quote })
  if (title) params.set('anchor_title', title)
  const href = `${origin}/#/learn?${params.toString()}`
  await chrome.tabs.create({ url: href })
}

async function openAnchorLimitError(selectionLength) {
  const saved = await chrome.storage.local.get({ appOrigin: DEFAULT_ORIGIN })
  const origin = String(saved.appOrigin || DEFAULT_ORIGIN).replace(/\/$/, '')
  const params = new URLSearchParams({ mode: 'practice', focus: 'notes', anchor_error: 'selection_too_large', anchor_length: String(selectionLength) })
  await chrome.tabs.create({ url: `${origin}/#/learn?${params.toString()}` })
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'capture-page', title: 'Capture page to Learning Compass', contexts: ['page', 'link'] })
  chrome.contextMenus.create({ id: 'capture-selection', title: 'Anchor selection in Learning Compass', contexts: ['selection'] })
})

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.url) await openCapture(tab.url)
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'capture-selection' && info.selectionText) {
    const quote = info.selectionText.trim()
    if (quote.length > 10000) {
      await openAnchorLimitError(quote.length)
      return
    }
    if (tab?.url && /^https?:\/\//i.test(tab.url)) {
      await openAnchor({ sourceUrl: tab.url, quote, title: tab.title || '' })
    } else {
      await openCapture(quote)
    }
    return
  }
  const source = info.linkUrl || tab?.url
  if (source) await openCapture(source)
})
