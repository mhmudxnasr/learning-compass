#!/bin/bash
cd /home/mahmud/recommendations-worker || exit 1

# Debounce logic to prevent multiple rapid deployments
deploy() {
    echo "Updating worker source..."
    node update_worker.js
    echo "Deploying to Cloudflare..."
    npx wrangler deploy
    echo "Deploy complete!"
}

# Run once at startup
deploy

echo "Watching files for changes..."
inotifywait -m -e close_write \
  "/home/mahmud/Documents/Obsidian Vault/06 - Taste Map/Profile.md" \
  "/home/mahmud/Documents/Obsidian Vault/06 - Taste Map/Recommendations  — Mahmood.md" \
  "/home/mahmud/Documents/Obsidian Vault/06 - Taste Map/Schema.md" \
  "/home/mahmud/Documents/Obsidian Vault/06 - Taste Map/Taste Engine — Master System Guide.md" \
  "/home/mahmud/.agents/skills/visual-learn/SKILL.md" |
while read -r directory events filename; do
    echo "Detected change in $filename"
    
    # Simple debounce: wait 2 seconds, then read and discard any other pending events
    sleep 2
    while read -r -t 0.1; do :; done
    
    deploy
done
