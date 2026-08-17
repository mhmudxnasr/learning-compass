export function cleanProfileLabel(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim() || raw
}

export function profileTasteLabel(item: { label?: unknown; branch_label?: unknown; topic?: unknown }): string {
  for (const value of [item.label, item.branch_label, item.topic]) {
    const label = cleanProfileLabel(value)
    if (label) return label
  }
  return 'Topic'
}
