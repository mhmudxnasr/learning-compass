export type TasteMapSettings = {
  appearance: { theme: 'system' | 'light' | 'dark'; density: 'balanced' | 'compact' }
  learning: { retention: 85 | 90 | 95; queue_cap: 5 }
  srs_drafts: { enabled: boolean; minimum_rating: number }
  ai_curation: { enrich_capture: boolean }
  profile_proposals: { review_required: boolean }
}

export const defaultSettings: TasteMapSettings = {
  appearance: { theme: 'system', density: 'balanced' },
  learning: { retention: 90, queue_cap: 5 },
  srs_drafts: { enabled: true, minimum_rating: 8 },
  ai_curation: { enrich_capture: true },
  profile_proposals: { review_required: true },
}

export async function loadSettings(DB: D1Database): Promise<TasteMapSettings> {
  const rows = await DB.prepare('SELECT setting_key,value_json FROM user_settings').all<{ setting_key: keyof TasteMapSettings; value_json: string }>()
  const settings: TasteMapSettings = structuredClone(defaultSettings)
  for (const row of rows.results || []) {
    try {
      const value = JSON.parse(row.value_json)
      if (row.setting_key === 'appearance') settings.appearance = { ...settings.appearance, ...value }
      if (row.setting_key === 'learning') settings.learning = { ...settings.learning, ...value, queue_cap: 5 }
      if (row.setting_key === 'srs_drafts') settings.srs_drafts = { ...settings.srs_drafts, ...value }
      if (row.setting_key === 'ai_curation') settings.ai_curation = { ...settings.ai_curation, ...value }
      if (row.setting_key === 'profile_proposals') settings.profile_proposals = { ...settings.profile_proposals, ...value }
    } catch { /* keep the default for malformed legacy data */ }
  }
  return settings
}
