#!/usr/bin/env bash
set -euo pipefail

repo="/home/mahmud/recommendations-worker"
units="/home/mahmud/.config/systemd/user"
install -d -m 0755 "$units"
install -m 0644 "$repo/ops/systemd/learning-compass-backup.service" "$units/learning-compass-backup.service"
install -m 0644 "$repo/ops/systemd/learning-compass-backup.timer" "$units/learning-compass-backup.timer"
systemctl --user daemon-reload
systemctl --user enable --now learning-compass-backup.timer
systemctl --user list-timers learning-compass-backup.timer --no-pager
