export type TasteMapSettings = {
  appearance: { theme: 'system' | 'light' | 'dark'; density: 'balanced' | 'compact' }
  learning: { retention: 85 | 90 | 95; queue_cap: 5 }
  srs_drafts: { enabled: boolean; minimum_rating: number; auto_extract: boolean }
  ai_curation: { enrich_capture: boolean }
  profile_proposals: { review_required: boolean }
  profile_automation: { mode: 'automatic' | 'manual'; policy_version: 'profile_v2' }
  recommendation_engine: { mode: 'shadow' | 'v2'; engine_version: 'v2'; objective_version: 'learning_value_v2' }
}

export const defaultSettings: TasteMapSettings = {
  appearance: { theme: 'system', density: 'balanced' },
  learning: { retention: 90, queue_cap: 5 },
  srs_drafts: { enabled: true, minimum_rating: 7, auto_extract: false },
  ai_curation: { enrich_capture: false },
  profile_proposals: { review_required: false },
  profile_automation: { mode: 'automatic', policy_version: 'profile_v2' },
  recommendation_engine: { mode: 'shadow', engine_version: 'v2', objective_version: 'learning_value_v2' },
}

export async function loadSettings(DB: D1Database): Promise<TasteMapSettings> {
  const rows = await DB.prepare('SELECT setting_key,value_json FROM user_settings').all<{ setting_key: keyof TasteMapSettings; value_json: string }>()
  const settings: TasteMapSettings = structuredClone(defaultSettings)
  for (const row of rows.results || []) {
    try {
      const value = JSON.parse(row.value_json)
      if (row.setting_key === 'appearance') settings.appearance = { ...settings.appearance, ...value }
      if (row.setting_key === 'learning') settings.learning = { ...settings.learning, ...value, queue_cap: 5 }
      if (row.setting_key === 'srs_drafts') settings.srs_drafts = { ...settings.srs_drafts, ...value, minimum_rating: 7 }
      if (row.setting_key === 'ai_curation') settings.ai_curation = { ...settings.ai_curation, ...value }
      if (row.setting_key === 'profile_proposals') settings.profile_proposals = { ...settings.profile_proposals, ...value }
      if (row.setting_key === 'profile_automation') settings.profile_automation = { ...settings.profile_automation, ...value }
      if (row.setting_key === 'recommendation_engine') settings.recommendation_engine = { ...settings.recommendation_engine, ...value }
    } catch { /* keep the default for malformed legacy data */ }
  }
  return settings
}
