# Learning Compass Capture extension

This is a deliberately small Manifest V3 capture seam. It requests only `activeTab`, `contextMenus`, and `storage`; it does not read page content in the background, store API tokens, or write directly to the Worker. The extension opens the app’s global capture dialog with the current URL or selected passage, and the normal capture flow creates a `captured` Library record.

## Install

1. Open the browser’s extensions page and enable developer mode.
2. Load this directory as an unpacked extension.
3. Open the extension options and confirm the Learning Compass app origin. It defaults to the production Worker and can be changed for a local or alternate deployment.
4. Use the toolbar button or page/selection context menu.

The origin must be an HTTP or HTTPS URL reachable from the browser. Ordinary Learning Compass reads and writes are public; the extension never receives or persists an API credential or creates a browser unlock session.
