# Architecture

The Worker owns API routes and scheduled intelligence. The Vite/Preact client is a static asset bundle served through the Worker’s Assets binding. D1 stores relational state and structured notes; R2 stores large source artifacts. The client uses hash routes so the Worker remains a single-page shell.

Hermes polls D1 jobs every two minutes. Extraction jobs run `learning-notes-extractor`; feedback jobs run `taste-mapper`. The worker is idempotent through job keys, leases, and bounded retries. D1 writes happen before Obsidian archive copies.

RSS and Atom subscriptions are stored in `feed_sources`; imported GUIDs link to Inbox recommendations through `feed_entries`. The Worker checks enabled feeds on its six-hour schedule, uses conditional HTTP headers, caps each response at 2 MB and 20 entries, and rejects private/local URLs and unsafe redirect targets.

The client uses route-level data contracts, IndexedDB for offline mutation queuing, local storage for preferences and session state, and a cache-busting service worker. Atlas is a lazy-loaded Cytoscape canvas boundary: it derives clusters from the canonical graph response, starts with major R1 branches, and progressively expands descendants without adding graph code to the base client bundle.
