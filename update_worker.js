const fs = require('fs');
const path = require('path');

// update_worker.js — simplified: no more vault file bundling.
// The worker engine source is deployed directly via `npx wrangler deploy`.
// Obsidian vault files are no longer synced into the worker.
console.log('Skipping vault file bundling (disabled per user request).');
console.log('Worker source remains unchanged.');
