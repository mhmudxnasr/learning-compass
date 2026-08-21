# Learning Compass Capture extension

This is a deliberately small Manifest V3 capture seam. It requests only `activeTab`, `contextMenus`, and `storage`; it does not read page content in the background, store API tokens, or write directly to the Worker. The extension opens the app’s global capture dialog with the current URL or selected passage, and the normal capture flow creates a `captured` Library record.

## Install

1. Open the browser’s extensions page and enable developer mode.
2. Load this directory as an unpacked extension.
3. Open the extension options and set the Learning Compass app origin.
4. Use the toolbar button or page/selection context menu.

The origin must already be reachable from the browser. If private API mode is enabled, the browser session must already have the authorized app access path; the extension never receives or persists `API_TOKEN`.
