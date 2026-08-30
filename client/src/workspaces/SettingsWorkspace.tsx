import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, flushOfflineMutations, formatDate, labelize, listOfflineMutations, resolveOfflineMutation } from '../api'
import { authFetch } from '../auth'
import { ErrorState, Empty, Loading } from '../components/States'
import { HermesActivityPanel } from './HermesActivityPanel'
import { OperationalHealthPanel } from './OperationalHealthPanel'
import { NotificationSettings } from './NotificationSettings'
import { useData } from '../app/useData'
import { useRoute } from '../app/router'
import { THEME_PRESETS, FONT_PRESETS, THEME_VARIANTS, VISUAL_PRESETS, TYPOGRAPHY_LIMITS, applyTheme, applyFont, applyDisplayPreferences, applyTypography, auditThemeContrast, computeThemeVariables, paletteFromThemePreset, getSavedTheme, getSavedFontId, getSavedCustomFont, getSavedCustomPalette, getSavedDisplayPreferences, getSavedTypography, getSavedThemePair, saveThemePair, extractColorsFromText, normalizeColor, normalizeCustomFont, type CustomPalette, type CustomFont, type DisplayPreferences, type TypographyPreferences, type ThemePair, type ThemeMode, type FontPreset, type VisualPreset, DEFAULT_CUSTOM_PALETTE, DEFAULT_CUSTOM_FONT, DEFAULT_TYPOGRAPHY } from '../theme'
import { PersonalDataStudio } from './settings/PersonalDataStudio'

export type SettingsView = 'profile' | 'preferences' | 'data' | 'system'
export type SettingsMode = 'personal' | 'data' | 'system'
export type SettingsFocus = 'profile' | 'preferences'

export type SettingsWorkspaceRoute = {
  view: SettingsView
  mode?: SettingsMode
  focus?: SettingsFocus
}

export type SettingsRouteInput = Partial<SettingsWorkspaceRoute> & {
  slug?: string
  view?: string
  mode?: string
  focus?: string
  query?: URLSearchParams
}

export type SettingsWorkspaceProps = {
  route?: SettingsRouteInput
  view?: SettingsView
  onRouteChange?: (route: SettingsWorkspaceRoute) => void
  onCapture?: () => void
}

type ProfileRecord = Record<string, any>

type SettingsPayload = {
  settings?: Record<string, any>
  resolved?: {
    appearance?: { theme?: string; density?: string; radius?: DisplayPreferences['radius']; font_size?: DisplayPreferences['fontSize']; reduced_motion?: boolean; custom_palette?: CustomPalette; font?: string; custom_font?: { ui?: string; display?: string; reading?: string; mono?: string }; typography?: Partial<TypographyPreferences> }
    learning?: { retention?: number; queue_cap?: number }
    srs_drafts?: { enabled?: boolean; minimum_rating?: number; auto_extract?: boolean }
    ai_curation?: { enrich_capture?: boolean }
    profile_automation?: { mode?: string }
    recommendation_engine?: { mode?: string }
    delivery_context?: { effort?: 'light' | 'moderate' | 'deep'; language?: 'any' | 'en' | 'ar'; delivery_modes?: Array<'read' | 'watch' | 'listen' | 'practice'>; depth_tier?: 'adaptive' | 'introductory' | 'intermediate' | 'advanced' }
  }
}

type SystemPayload = {
  status?: string
  service?: string
  environment?: string
  timezone?: string
  storage?: Array<{ name: string; purpose: string; status: string }>
  schedule?: Array<{ id: string; cron: string; cadence: string; timezone: string; responsibilities?: string[]; last_run?: string | null; last_success?: string | null; last_search_sync?: string | null; status?: string }>
  recovery?: { ok?: boolean; latest?: { id?: string; created_at?: string; restore_rehearsed_at?: string; artifact_count?: number; d1_bytes?: number } | null; age_ms?: number | null }
  on_demand_only?: string[]
  counts?: Record<string, number>
  data_quality?: {
    status?: 'trusted' | 'needs_attention'
    checked_at?: string
    summary?: { passing?: number; failing?: number; total?: number }
    scope?: 'active_sources'
    counts?: { active_sources?: number; stored_sources?: number; learning_events?: number; enabled_feeds?: number }
    checks?: Array<{ id: string; dimension: string; label: string; status: 'passing' | 'failing'; affected: number; total: number; coverage_percent: number; message: string }>
  }
  safety?: string[]
}

type Capability = { method: string; path: string; description: string }

const settingsModes: Array<{ key: SettingsMode; label: string; description: string; view: SettingsView }> = [
  { key: 'personal', label: 'Personal', description: 'Profile and preferences', view: 'profile' },
  { key: 'data', label: 'Data & recovery', description: 'Backups, offline changes, and storage', view: 'data' },
  { key: 'system', label: 'System', description: 'Health, Hermes, and advanced operations', view: 'system' },
]

const personalFilters: Array<{ key: SettingsFocus; label: string; description: string }> = [
  { key: 'profile', label: 'Learning profile', description: 'What shapes your learning' },
  { key: 'preferences', label: 'Preferences', description: 'How the studio behaves' },
]

type PaletteField = {
  key: keyof CustomPalette
  label: string
  fallback: string
  description: string
}

const CUSTOM_COLOR_GROUPS: Array<{ name: string; description: string; fields: PaletteField[] }> = [
  {
    name: 'Foundations',
    description: 'The planes, text, and seams that carry most of the interface.',
    fields: [
      { key: 'shell', label: 'Shell', fallback: '#F7EAE0', description: 'Outer workspace plane' },
      { key: 'surface', label: 'Surface', fallback: '#FFFFFF', description: 'Cards and ledgers' },
      { key: 'ink', label: 'Ink', fallback: '#2B170F', description: 'Primary text' },
      { key: 'seam', label: 'Seam', fallback: '#DEDAD0', description: 'Borders and dividers' },
    ],
  },
  {
    name: 'Identity & emphasis',
    description: 'The visual signature used for actions, highlights, and supporting accents.',
    fields: [
      { key: 'brand', label: 'Brand', fallback: '#1D4533', description: 'Primary actions and focus' },
      { key: 'highlight', label: 'Highlight', fallback: '#F9D2BA', description: 'Selected and active planes' },
      { key: 'accent', label: 'Accent', fallback: '#5E3122', description: 'Supporting emphasis' },
    ],
  },
  {
    name: 'Navigation & signals',
    description: 'Navigation depth and the colors that communicate state.',
    fields: [
      { key: 'rail', label: 'Rail', fallback: '#133325', description: 'Primary navigation' },
      { key: 'due', label: 'Due', fallback: '#874606', description: 'Time-sensitive work' },
      { key: 'danger', label: 'Danger', fallback: '#9C2E21', description: 'Destructive feedback' },
      { key: 'map', label: 'Map', fallback: '#3F6E4E', description: 'Atlas relationships' },
    ],
  },
]

const TYPOGRAPHY_CONTROLS: Array<{
  key: keyof TypographyPreferences
  label: string
  description: string
  step: number
  suffix: string
}> = [
  { key: 'baseSize', label: 'Base size', description: 'Interface and body text scale', step: 1, suffix: 'px' },
  { key: 'displayScale', label: 'Display scale', description: 'Heading size multiplier across the studio', step: 0.05, suffix: '×' },
  { key: 'bodyWeight', label: 'Body weight', description: 'Reading comfort and copy density', step: 50, suffix: '' },
  { key: 'headingWeight', label: 'Heading weight', description: 'Title and section authority', step: 50, suffix: '' },
  { key: 'lineHeight', label: 'Line height', description: 'Vertical breathing room and rhythm', step: 0.05, suffix: '' },
  { key: 'letterSpacing', label: 'Letter spacing', description: 'Tracking across interface text', step: 0.01, suffix: 'em' },
  { key: 'readingMeasure', label: 'Reading width', description: 'Comfortable maximum line length', step: 1, suffix: 'ch' },
]

type ThemeBundle = {
  name: string
  modes: ThemePair
  appearance?: {
    font?: string
    customFont?: CustomFont
    typography?: TypographyPreferences
    density?: DisplayPreferences['density']
    radius?: DisplayPreferences['radius']
    fontSize?: DisplayPreferences['fontSize']
    reducedMotion?: boolean
    responsiveViewport?: 'auto'
  }
}

type ProfileField = { key: string; apiKey: string; readKey?: string; label: string; description: string; structured: boolean }

const profileFields: ProfileField[] = [
  { key: 'identity', apiKey: 'identity', readKey: 'identity_json', label: 'Identity & context', description: 'Background and learning context.', structured: true },
  { key: 'mega_priority', apiKey: 'mega_priority', readKey: 'mega_priority_json', label: 'Mega priority', description: 'The highest-level focus areas.', structured: true },
  { key: 'core_filter', apiKey: 'core_filter', label: 'Core curation filter', description: 'Criteria required for new content.', structured: false },
  { key: 'reaction_style_json', apiKey: 'reaction_style_json', label: 'Reaction style', description: 'How feedback should be interpreted.', structured: true },
  { key: 'quality_rules_json', apiKey: 'quality_rules_json', label: 'Quality & verification', description: 'Source verification and content boundaries.', structured: true },
  { key: 'operational_style_json', apiKey: 'operational_style_json', label: 'Operational style', description: 'How Hermes should work with you.', structured: true },
  { key: 'patterns_summary_json', apiKey: 'patterns_summary_json', label: 'Pattern summary', description: 'Recurring learning patterns.', structured: true },
  { key: 'recent_signal', apiKey: 'recent_signal', label: 'Recent signal', description: 'The latest approved learning signal.', structured: false },
]

function normalizeView(value: string | undefined, fallback: SettingsView = 'profile'): SettingsView {
  if (value === 'profile' || value === 'preferences' || value === 'data' || value === 'system') return value
  return fallback
}

function routeFor(mode: SettingsMode, focus?: SettingsFocus) {
  const query = new URLSearchParams({ mode })
  if (focus) query.set('focus', focus)
  return `#/settings?${query}`
}

function jumpToPreference(event: MouseEvent, id: string) {
  event.preventDefault()
  const target = document.getElementById(id)
  const canvas = document.querySelector<HTMLElement>('.workspace-canvas')
  if (!target || !canvas) return
  const jumpNav = document.querySelector<HTMLElement>('.settings-jump-nav')
  const stickyOffset = (jumpNav?.getBoundingClientRect().height || 0) + 16
  const top = target.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop - stickyOffset
  canvas.scrollTo({ top, behavior: 'smooth' })
}

function SettingsModeSwitcher({ active, focus, onRouteChange }: { active: SettingsMode; focus: SettingsFocus; onRouteChange?: (route: SettingsWorkspaceRoute) => void }) {
  return <>
    <div class="settings-local-navigation">
      <nav class="workspace-mode-switcher workspace-local-nav settings-local-nav" aria-label="Settings sections">
        {settingsModes.map((item) => (
          <a
            key={item.key}
            href={routeFor(item.key, item.key === 'personal' ? 'profile' : undefined)}
            class={active === item.key ? 'active' : ''}
            aria-current={active === item.key ? 'page' : undefined}
            onClick={(event) => {
              if (!onRouteChange) return
              event.preventDefault()
              onRouteChange({ view: item.view, mode: item.key, focus: item.key === 'personal' ? 'profile' : undefined })
            }}
          >
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </a>
        ))}
      </nav>
      {active === 'personal' && <nav class="workspace-filter-switcher workspace-local-nav" aria-label="Personal settings filters">
        {personalFilters.map((item) => <a key={item.key} href={routeFor('personal', item.key)} class={focus === item.key ? 'active' : ''} aria-current={focus === item.key ? 'page' : undefined} onClick={(event) => {
          if (!onRouteChange) return
          event.preventDefault()
          onRouteChange({ view: item.key, mode: 'personal', focus: item.key })
        }}><strong>{item.label}</strong><small>{item.description}</small></a>)}
      </nav>}
    </div>
  </>
}

function asValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return ''
  try { return JSON.parse(text) } catch { return value }
}

function readableText(value: unknown): string {
  const parsed = asValue(value)
  if (parsed === null || parsed === undefined || parsed === '') return 'Not recorded'
  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed)
  if (Array.isArray(parsed)) return parsed.map((item) => readableText(item)).filter((item) => item !== 'Not recorded').join(' · ') || 'Not recorded'
  return Object.entries(parsed as Record<string, unknown>).map(([key, item]) => `${labelize(key)}: ${readableText(item)}`).join(' · ') || 'Not recorded'
}

function readableTags(value: unknown, limit = 10): string[] {
  const parsed = asValue(value)
  if (Array.isArray(parsed)) return parsed.flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') return [String(item)]
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>
      const candidate = record.label || record.name || record.topic || record.role || record.value
      return candidate ? [String(candidate)] : []
    }
    return []
  }).slice(0, limit)
  if (parsed && typeof parsed === 'object') return Object.entries(parsed as Record<string, unknown>).slice(0, limit).map(([key, item]) => {
    const valueText = typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? ` · ${item}` : ''
    return `${labelize(key)}${valueText}`
  })
  const text = String(parsed || '').trim()
  return text ? text.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, limit) : []
}

function ReadableValue({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const tags = readableTags(value, compact ? 6 : 12)
  const text = readableText(value)
  return <div class="profile-readable-value"><p>{text}</p>{tags.length > 0 && <div class="profile-tag-list">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}</div>
}

function profileValue(profile: ProfileRecord, ...keys: string[]) {
  return keys.map((key) => profile[key]).find((value) => value !== undefined && value !== null && value !== '')
}

function safeProfileValue(value: unknown, structured = false) {
  if (!structured || typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return 'Needs review in the profile editor.' }
}

function ProfileOverview({ profile }: { profile: ProfileRecord }) {
  const cards = [
    { label: 'Learning context', description: 'The context used to tailor examples and formats.', value: profileValue(profile, 'identity_json', 'identity'), structured: true },
    { label: 'Priority areas', description: 'The subjects that deserve more attention.', value: profileValue(profile, 'mega_priority_json', 'mega_priority'), structured: true },
    { label: 'Content boundaries', description: 'What to filter out before it reaches your queue.', value: profileValue(profile, 'core_filter'), structured: false },
    { label: 'Quality standards', description: 'The evidence and verification bar for new material.', value: profileValue(profile, 'quality_rules_json'), structured: true },
    { label: 'How Hermes works', description: 'The operating style used when the system assists you.', value: profileValue(profile, 'operational_style_json'), structured: true },
  ]
  return <section class="profile-overview profile-section" aria-labelledby="profile-overview-heading">
    <div class="section-head">
      <div><span class="profile-section-kicker">Profile charter</span><h2 id="profile-overview-heading">What shapes your learning</h2><p class="section-description">The five rules Learning Compass uses before it selects, sequences, or explains anything.</p></div>
      <span>{cards.length} foundations</span>
    </div>
    <div class="profile-overview-grid">
      {cards.map((card, index) => <details class="profile-overview-card" key={card.label} open={index < 2}>
        <summary><span class="profile-overview-index">0{index + 1}</span><span class="profile-overview-card-head"><strong>{card.label}</strong><small>{card.description}</small></span><span class="profile-overview-action">Read</span></summary>
        <div class="profile-overview-body"><ReadableValue value={safeProfileValue(card.value, card.structured)} compact /></div>
      </details>)}
    </div>
  </section>
}

function assertionTitle(assertion: ProfileRecord) {
  const value = asValue(assertion.value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as ProfileRecord
    const readable = record.label || record.name || record.topic || record.title
    if (readable) return String(readable)
  }
  const raw = String(assertion.assertion_key || 'Learned preference').replace(/^User\.Profile\./i, '')
  return labelize(raw.split('.').pop() || raw)
}

function ProfileSignals({ assertions }: { assertions: ProfileRecord[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = assertions.filter((assertion) => {
    const category = String(assertion.category || 'profile').toLowerCase()
    const text = `${assertionTitle(assertion)} ${readableText(assertion.value)} ${category}`.toLowerCase()
    return (filter === 'all' || category === filter) && (!normalizedQuery || text.includes(normalizedQuery))
  })
  const categories = [...new Set(assertions.map((assertion) => String(assertion.category || 'profile').toLowerCase()))].sort()
  return <details class="profile-panel profile-learned-panel">
    <summary><span><strong>What Learning Compass has learned</strong><small>Evidence-backed signals used to shape future recommendations.</small></span><span>{assertions.length} signals</span></summary>
    <div class="profile-panel-content">
      <div class="profile-signal-toolbar">
        <label>Search learned signals<input aria-label="Search learned signals" value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Search preferences, topics, or boundaries" /></label>
        <label>Show<select aria-label="Filter learned signals" value={filter} onChange={(event) => setFilter((event.target as HTMLSelectElement).value)}><option value="all">All signals</option>{categories.map((category) => <option key={category} value={category}>{labelize(category)}</option>)}</select></label>
      </div>
      {filtered.length ? <div class="profile-assertion-list">{filtered.slice(0, 24).map((assertion: ProfileRecord) => <article key={assertion.id || assertion.assertion_key}>
        <div class="profile-assertion-head"><div><span class="meta">{labelize(assertion.category || 'profile')} · {labelize(assertion.source_kind || 'recorded')}</span><strong>{assertionTitle(assertion)}</strong></div><span class={`state state-${assertion.status || 'active'}`}>{labelize(assertion.status || 'active')}</span></div>
        <ReadableValue value={assertion.value} compact />
        <small>Confidence {Math.round(Number(assertion.confidence || 0) * 100)}% · version {assertion.version || 1}</small>
        <details class="profile-signal-details"><summary>Advanced details</summary><p>{labelize(assertion.assertion_key || 'Profile signal')}</p></details>
      </article>)}</div> : <Empty title="No signals match" body="Try a broader search or reset the filter." />}
      {filtered.length > 24 && <p class="profile-list-limit">Showing 24 of {filtered.length} matching signals.</p>}
    </div>
  </details>
}

function ProfileFieldList({ profile }: { profile: ProfileRecord }) {
  return <section id="profile-fields" class="profile-section profile-fields-section"><div class="section-head"><div><span class="profile-section-kicker">Canonical inputs</span><h2>Your learning preferences</h2><p class="section-description">The source fields behind the profile charter. Open only the field you need to inspect.</p></div><span>{profileFields.length} fields</span></div><div class="profile-fields">{profileFields.map((field) => {
    const value = profile[field.readKey || field.apiKey]
    const parsed = field.structured && typeof value === 'string' ? (() => { try { return { value: JSON.parse(value), valid: true } } catch { return { value: null, valid: false } } })() : { value, valid: true }
    return <details class="profile-field" key={field.key}><summary><span><strong>{field.label}</strong><small>{field.description}</small></span><em>Inspect</em></summary><div class="profile-field-body">{parsed.valid ? <ReadableValue value={parsed.value} /> : <p class="profile-empty">Needs review in the profile editor.</p>}</div></details>
  })}</div></section>
}

function ProfileRecordList({ items, empty, title, getTitle, getMeta, getDetail }: { items: any[]; empty: string; title: string; getTitle: (item: any) => string; getMeta: (item: any) => string; getDetail?: (item: any) => unknown }) {
  return <details class="profile-record-section"><summary><span><strong>{title}</strong><small>{items.length ? `${items.length} recorded` : empty}</small></span><em>Open ledger</em></summary><div class="profile-record-body">{items.length ? <div class="profile-record-list">{items.slice(0, 24).map((item, index) => <article class="profile-record" key={String(item.id || item.label || item.name || index)}><div class="profile-record-title"><strong>{getTitle(item)}</strong><small>{getMeta(item)}</small></div><p>{readableText(getDetail ? getDetail(item) : item.description || item.reason || item.why || item.notes || '')}</p></article>)}</div> : <p class="profile-empty">{empty}</p>}</div></details>
}

function ProfileEditor({ profile, onSaved }: { profile: ProfileRecord; onSaved: () => void }) {
  const initial = useMemo(() => Object.fromEntries(profileFields.map((field) => { const value = profile[field.readKey || field.apiKey]; return [field.key, typeof value === 'string' ? value : readableText(value)] })), [profile])
  const [draft, setDraft] = useState<Record<string, string>>(initial)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => setDraft(initial), [initial])
  const save = async () => {
    const payload: Record<string, unknown> = {}
    profileFields.forEach((field) => {
      if (draft[field.key] === initial[field.key]) return
      if (field.structured) {
        try { payload[field.apiKey] = JSON.parse(draft[field.key]) } catch { payload[field.apiKey] = draft[field.key] }
      } else payload[field.apiKey] = draft[field.key]
    })
    if (!Object.keys(payload).length) { setStatus('No profile changes to save.'); return }
    setStatus('Saving profile…')
    try { await api('/brain/profile', { method: 'POST', body: JSON.stringify(payload) }); setStatus('Profile saved.'); onSaved() }
    catch (error: any) { setStatus(error?.message || 'Profile could not be saved.') }
  }
  return <details id="profile-editor" class="profile-editor" open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}><summary><span><strong>Edit profile</strong><small>Change the canonical inputs Learning Compass uses.</small></span><em>{open ? 'Close editor' : 'Open editor'}</em></summary>{open && <div class="profile-editor-body"><p>Update only what has changed. Structured fields accept their existing JSON shape; ordinary text remains ordinary text.</p><div class="profile-editor-fields">{profileFields.map((field) => <label key={field.key}>{field.label}<span>{field.description}</span><textarea value={draft[field.key] || ''} onInput={(event) => setDraft((current) => ({ ...current, [field.key]: (event.target as HTMLTextAreaElement).value }))} /></label>)}</div><div class="row-actions"><button type="button" class="button secondary" onClick={() => setDraft(initial)}>Reset changes</button><button type="button" class="button primary" onClick={save}>Save profile</button></div>{status && <output class="settings-status" aria-live="polite">{status}</output>}</div>}</details>
}

function ProfileView() {
  const profile = useData<ProfileRecord>('/brain/profile?recent_limit=50')
  if (profile.loading) return <Loading label="Reading your learning profile" />
  if (profile.error) return <ErrorState message={profile.error} retry={profile.reload} />
  const data = profile.data || {}
  const person = data.profile || {}
  const health = data.profile_health || {}
  const assertions = data.profile_assertions || []
  const context = readableText(person.identity_json || person.identity || '')
  return <div class="settings-page profile-settings-page">
    <section class="model-header"><div class="model-header-main"><div class="model-identity"><span class="model-avatar" aria-hidden="true">{String(person.name || 'L').slice(0, 1).toUpperCase()}</span><div class="model-identity-copy"><span class="eyebrow">Personal model</span><h1>{person.name || 'Your learning profile'}</h1><p class="model-context">{context === 'Not recorded' ? 'This profile helps Learning Compass choose, filter, and sequence learning material for you.' : context}</p></div></div><div class="model-header-actions"><button type="button" class="button primary" onClick={() => { const editor = document.getElementById('profile-editor'); if (editor instanceof HTMLDetailsElement) { editor.open = true; editor.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }}>Edit profile</button><details class="model-technical"><summary>Model details</summary><span>{data.model_version || 'profile_v2'}</span></details></div></div><div class="profile-health-strip"><div><strong>{labelize(health.status || 'unknown')}</strong><span>Profile health</span></div><div><strong>{health.active || assertions.length || 0}</strong><span>Active signals</span></div><div><strong>{health.hypotheses || 0}</strong><span>Needs review</span></div><div><strong>{data.infrastructure_stats?.pending_proposals_count || 0}</strong><span>Pending changes</span></div></div></section>
    <div class="profile-layout">
      <aside class="profile-index" aria-label="Learning profile sections"><span class="profile-index-label">Profile map</span><nav><a href="#profile-charter" onClick={(event) => jumpToPreference(event, 'profile-charter')}>Charter</a><a href="#profile-fields" onClick={(event) => jumpToPreference(event, 'profile-fields')}>Canonical fields</a><a href="#profile-editor" onClick={(event) => jumpToPreference(event, 'profile-editor')}>Edit profile</a><a href="#profile-signals" onClick={(event) => jumpToPreference(event, 'profile-signals')}>Learned signals</a><a href="#profile-ledgers" onClick={(event) => jumpToPreference(event, 'profile-ledgers')}>Evidence ledgers</a></nav><p>This page explains what the system believes, why it matters, and where the evidence came from.</p></aside>
      <div class="profile-canvas">
    <div id="profile-charter"><ProfileOverview profile={person} /></div>
    <ProfileFieldList profile={person} />
    <ProfileEditor profile={person} onSaved={profile.reload} />
    <section id="profile-signals" class="profile-signals-section"><div class="section-head"><div><span class="profile-section-kicker">Evidence model</span><h2>Learned signals</h2><p class="section-description">Preferences inferred from direct feedback and completed learning history.</p></div><span>{assertions.length} signals</span></div>{assertions.length ? <ProfileSignals assertions={assertions} /> : <Empty title="No learned signals yet" body="Evidence-backed preferences will appear here as you capture, consume, and reflect." />}</section>
    <section id="profile-ledgers" class="profile-ledgers"><div class="section-head"><div><span class="profile-section-kicker">Supporting evidence</span><h2>Profile ledgers</h2><p class="section-description">Open a ledger when you need the underlying history; closed ledgers stay quiet.</p></div><span>8 ledgers</span></div><div class="profile-record-columns">
      <ProfileRecordList title="Priorities" items={data.priorities || []} empty="No priorities recorded." getTitle={(item) => item.label || item.branch_id || 'Priority'} getMeta={(item) => item.rank ? `Rank ${item.rank}` : ''} />
      <ProfileRecordList title="Mastered knowledge" items={data.mastered || []} empty="No mastered topics recorded." getTitle={(item) => item.label || item.name || item.id || 'Mastered topic'} getMeta={(item) => item.kind || ''} />
      <ProfileRecordList title="Exclusions" items={data.blacklist || []} empty="No exclusions recorded." getTitle={(item) => [item.name, item.work].filter(Boolean).join(' · ') || 'Exclusion'} getMeta={(item) => item.severity == null ? '' : `Severity ${item.severity}`} />
      <ProfileRecordList title="Learned patterns" items={data.patterns || []} empty="No patterns recorded." getTitle={(item) => item.description || item.id || 'Pattern'} getMeta={(item) => item.strength || ''} />
      <ProfileRecordList title="Taste affinities" items={data.taste_vectors || []} empty="No taste affinities recorded." getTitle={(item) => item.label || item.topic || 'Topic'} getMeta={(item) => `${item.consumption_count || 0} completed`} getDetail={(item) => item.affinity_score == null ? '' : `Affinity score ${Number(item.affinity_score).toFixed(1)} / 5`} />
      <ProfileRecordList title="Creator history" items={data.creator_trust || []} empty="No creator history available." getTitle={(item) => item.creator || 'Creator'} getMeta={(item) => `${item.total || 0} consumed · ${item.average_score || '—'} avg`} />
      <ProfileRecordList title="Recent reflections" items={data.reflections || []} empty="No written reflections recorded." getTitle={(item) => item.video_title || 'Reflection'} getMeta={(item) => item.completed_at ? formatDate(item.completed_at) : ''} />
      <ProfileRecordList title="Recent ratings" items={data.rating_history || []} empty="No ratings recorded." getTitle={(item) => item.video_title || 'Rated source'} getMeta={(item) => item.user_score == null ? item.user_rating || '' : `${item.user_score}/10`} />
    </div></section>
      </div>
    </div>
  </div>
}

function PreferenceToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label class="setting-row setting-toggle-row"><span class="setting-copy"><strong>{label}</strong><span>{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange((event.target as HTMLInputElement).checked)} /></label>
}

function PreferenceChoice<T extends string>({ name, label, description, value, options, onChange }: {
  name: string
  label: string
  description: string
  value: T
  options: Array<{ value: T; label: string; description: string }>
  onChange: (value: T) => void
}) {
  return <fieldset class="preference-choice">
    <legend><strong>{label}</strong><span>{description}</span></legend>
    <div class="preference-choice-options">
      {options.map((option) => <label class={value === option.value ? 'active' : ''} key={option.value}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span>{option.label}</span>
        <small>{option.description}</small>
      </label>)}
    </div>
  </fieldset>
}

function ThemeContextPreview() {
  return <section class="theme-context-preview" aria-labelledby="appearance-preview-title">
    <div class="theme-preview-heading"><span class="settings-active-label">Live preview</span><h2 id="appearance-preview-title">Your studio in context</h2><p>Colors, type, spacing, and corners update here as you make changes.</p></div>
    <div class="theme-preview-frame" aria-hidden="true">
      <div class="theme-preview-sidebar"><strong>LC</strong><i class="active" /><i /><i /><i /></div>
      <div class="theme-preview-content"><div class="theme-preview-toolbar"><span>Today</span><em>Capture</em></div><article class="theme-preview-card"><div><strong>Build a calmer review loop</strong><small>Current Thread · lesson ready</small></div><span class="theme-preview-score">Ready</span></article><div class="theme-preview-grid"><div class="theme-preview-alert"><strong>Next action</strong><span>Continue the next lesson in your Thread.</span></div><div class="theme-preview-chart"><i style="height:35%"/><i style="height:55%"/><i style="height:48%"/><i style="height:78%"/><i style="height:66%"/><i style="height:90%"/></div></div><div class="theme-preview-actions"><span>Not now</span><strong>Open Thread</strong></div></div>
    </div>
    <div class="theme-preview-scope"><span>Home</span><span>Library</span><span>Learn</span><span>Map</span><span>Settings</span></div>
  </section>
}

function ThemeSemanticPreview({ palette, mode, font, radius = 'soft', density = 'balanced' }: {
  palette: CustomPalette
  mode: ThemeMode
  font?: FontPreset
  radius?: DisplayPreferences['radius']
  density?: DisplayPreferences['density']
}) {
  const variables = computeThemeVariables(palette, mode)
  const previewStyle = {
    '--theme-mini-rail': variables['--studio-rail'],
    '--theme-mini-rail-ink': variables['--studio-rail-ink'],
    '--theme-mini-canvas': variables['--studio-canvas'],
    '--theme-mini-surface': variables['--studio-surface'],
    '--theme-mini-ink': variables['--studio-ink'],
    '--theme-mini-muted': variables['--studio-secondary'],
    '--theme-mini-brand': variables['--studio-cypress'],
    '--theme-mini-action-ink': variables['--studio-action-ink'],
    '--theme-mini-highlight': variables['--studio-lichen'],
    '--theme-mini-seam': variables['--studio-seam'],
    '--theme-mini-font-ui': font?.ui || 'var(--font-ui)',
    '--theme-mini-font-display': font?.display || 'var(--font-display)',
    '--theme-mini-radius': radius === 'sharp' ? '2px' : radius === 'round' ? '14px' : '7px',
    '--theme-mini-gap': density === 'compact' ? '5px' : density === 'comfortable' ? '9px' : '7px',
    '--theme-mini-padding': density === 'compact' ? '7px' : density === 'comfortable' ? '11px' : '9px',
  }
  return <span class={`theme-semantic-preview${font ? ' visual-preset-preview' : ''}`} style={previewStyle as any} aria-hidden="true">
    <span class="theme-semantic-rail"><i /><i class="active" /><i /></span>
    <span class="theme-semantic-canvas">
      <span class="theme-semantic-toolbar"><i>{font ? 'Today' : ''}</i><b>{font ? 'Add' : ''}</b></span>
      <span class="theme-semantic-ledger"><strong>{font ? 'Next lesson' : ''}</strong><em>{font ? 'Current Thread' : ''}</em><small>{font ? 'Ready' : ''}</small></span>
      <span class="theme-semantic-signal" />
    </span>
  </span>
}

function PreferencesView() {
  const settings = useData<SettingsPayload>('/settings')
  const [status, setStatus] = useState('')
  const [theme, setTheme] = useState(() => getSavedTheme())
  const [customPalette, setCustomPalette] = useState<CustomPalette>(() => getSavedCustomPalette())
  const [themePair, setThemePair] = useState<ThemePair>(() => getSavedThemePair())
  const [themeMode, setThemeMode] = useState<'day' | 'night'>(() => (typeof localStorage !== 'undefined' && localStorage.getItem('taste-map-theme-mode') === 'night' ? 'night' : 'day'))
  const [paletteHistory, setPaletteHistory] = useState<CustomPalette[]>([])
  const [paletteFuture, setPaletteFuture] = useState<CustomPalette[]>([])
  const [variantIndex, setVariantIndex] = useState(0)
  const [variantGenerating, setVariantGenerating] = useState(false)
  const [savedThemes, setSavedThemes] = useState<Record<string, ThemeBundle>>(() => {
    try { return typeof localStorage === 'undefined' ? {} : JSON.parse(localStorage.getItem('taste-map-saved-themes') || '{}') } catch { return {} }
  })
  const [pasteCodes, setPasteCodes] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const savedDisplay = getSavedDisplayPreferences()
  const [density, setDensity] = useState<DisplayPreferences['density']>(savedDisplay.density)
  const [radius, setRadius] = useState<DisplayPreferences['radius']>(savedDisplay.radius)
  const [fontSize, setFontSize] = useState<DisplayPreferences['fontSize']>(savedDisplay.fontSize)
  const [reducedMotion, setReducedMotion] = useState(savedDisplay.reducedMotion)
  const [font, setFont] = useState(() => getSavedFontId())
  const [customFont, setCustomFont] = useState<CustomFont>(() => getSavedCustomFont())
  const [typography, setTypography] = useState<TypographyPreferences>(() => getSavedTypography())
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1280 : window.innerWidth)
  const [retention, setRetention] = useState(90)
  const [enrichCapture, setEnrichCapture] = useState(false)
  const [autoExtract, setAutoExtract] = useState(false)
  const [profileMode, setProfileMode] = useState('automatic')
  const [engineMode, setEngineMode] = useState('shadow')
  const [deliveryEffort, setDeliveryEffort] = useState<'light' | 'moderate' | 'deep'>('moderate')
  const [deliveryLanguage, setDeliveryLanguage] = useState<'any' | 'en' | 'ar'>('any')
  const [deliveryModes, setDeliveryModes] = useState<Array<'read' | 'watch' | 'listen' | 'practice'>>([])
  const [depthTier, setDepthTier] = useState<'adaptive' | 'introductory' | 'intermediate' | 'advanced'>('adaptive')
  const [paletteDirty, setPaletteDirty] = useState(false)
  const [arrows, setArrows] = useState(true)
  const [textFade, setTextFade] = useState(0.05)
  const [atlasNodeSize, setAtlasNodeSize] = useState(0.58)
  const [linkThickness, setLinkThickness] = useState(4)
  const [branchLinkThickness, setBranchLinkThickness] = useState(2.75)
  const [atlasAnimate, setAtlasAnimate] = useState(true)
  const [centerForce, setCenterForce] = useState(0.83)
  const [repelForce, setRepelForce] = useState(11)
  const [linkForce, setLinkForce] = useState(2.75)
  const resolved = settings.data?.resolved
  const paletteSaveTimer = useRef<number | null>(null)
  const typographySaveTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!resolved) return
    const currentTheme = (resolved.appearance as any)?.theme || theme
    const rawPalette = (resolved.appearance as any)?.custom_palette
    const currentPalette = rawPalette ? { ...customPalette, ...rawPalette, ink: rawPalette.ink && rawPalette.ink !== rawPalette.accent ? rawPalette.ink : (rawPalette.brand || customPalette.ink), map: rawPalette.map || '#337f8c' } : customPalette
    setTheme(currentTheme)
    if ((resolved.appearance as any)?.custom_palette) {
      setCustomPalette(currentPalette)
    }
    const nextDensity = (resolved.appearance?.density as DisplayPreferences['density']) || 'balanced'
    const nextRadius = resolved.appearance?.radius || 'soft'
    const nextFontSize = resolved.appearance?.font_size || 'medium'
    const nextReducedMotion = Boolean(resolved.appearance?.reduced_motion)
    setDensity(nextDensity)
    setRadius(nextRadius)
    setFontSize(nextFontSize)
    setReducedMotion(nextReducedMotion)
    applyDisplayPreferences({ density: nextDensity, radius: nextRadius, fontSize: nextFontSize, reducedMotion: nextReducedMotion })
    const resolvedCustomFont = normalizeCustomFont((resolved.appearance as any)?.custom_font)
    if ((resolved.appearance as any)?.font) {
      const resolvedFont = (resolved.appearance as any)?.font
      setFont(resolvedFont)
      applyFont(resolvedFont, resolvedCustomFont)
    }
    if ((resolved.appearance as any)?.custom_font) {
      setCustomFont(resolvedCustomFont)
    }
    if ((resolved.appearance as any)?.typography) {
      const nextTypography = { ...getSavedTypography(), ...(resolved.appearance as any).typography }
      setTypography(nextTypography)
      applyTypography(nextTypography)
    }
    setRetention(Number(resolved.learning?.retention || 90))
    setEnrichCapture(Boolean(resolved.ai_curation?.enrich_capture))
    setAutoExtract(Boolean(resolved.srs_drafts?.auto_extract))
    setProfileMode(resolved.profile_automation?.mode || 'automatic')
    setEngineMode(resolved.recommendation_engine?.mode || 'shadow')
    setDeliveryEffort(resolved.delivery_context?.effort || 'moderate')
    setDeliveryLanguage(resolved.delivery_context?.language || 'any')
    setDeliveryModes(resolved.delivery_context?.delivery_modes || [])
    setDepthTier(resolved.delivery_context?.depth_tier || 'adaptive')
    const atlas = (resolved as any).atlas || {}
    setArrows(atlas.arrows ?? false)
    setTextFade(typeof atlas.text_fade_threshold === 'number' ? atlas.text_fade_threshold : 0.15)
    setAtlasNodeSize(typeof atlas.node_size === 'number' ? atlas.node_size : 0.85)
    setLinkThickness(typeof atlas.link_thickness === 'number' ? atlas.link_thickness : 1.4)
    setBranchLinkThickness(typeof atlas.branch_link_thickness === 'number' ? atlas.branch_link_thickness : 1.5)
    setAtlasAnimate(atlas.animate ?? true)
    setCenterForce(typeof atlas.center_force === 'number' ? atlas.center_force : 0.65)
    setRepelForce(typeof atlas.repel_force === 'number' ? atlas.repel_force : 14)
    setLinkForce(typeof atlas.link_force === 'number' ? atlas.link_force : 1.25)
    document.documentElement.dataset.density = resolved.appearance?.density || 'balanced'
  }, [resolved])

  useEffect(() => () => {
    if (paletteSaveTimer.current !== null) window.clearTimeout(paletteSaveTimer.current)
    if (typographySaveTimer.current !== null) window.clearTimeout(typographySaveTimer.current)
  }, [])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (settings.loading) return <Loading label="Reading preferences" />
  if (settings.error) return <ErrorState message={settings.error} retry={settings.reload} />

  const viewportBoost = viewportWidth >= 1920 ? 14 : viewportWidth >= 1440 ? 8 : 0
  const effectiveBaseSize = Math.round(typography.baseSize * (1 + viewportBoost / 100) * 10) / 10

  const persist = async (key: string, value: unknown, after?: () => void) => {
    setStatus('Saving…')
    try {
      await api(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) })
      after?.()
      setStatus('Saved')
      window.setTimeout(() => setStatus(''), 1400)
    } catch (error: any) {
      setStatus(error?.message || 'Could not save this preference.')
    }
  }

  const savePalette = (nextPalette: CustomPalette) => {
    if (paletteSaveTimer.current !== null) window.clearTimeout(paletteSaveTimer.current)
    setPaletteDirty(true)
    paletteSaveTimer.current = window.setTimeout(() => {
      persist('appearance', { theme: 'custom', density, radius, font_size: fontSize, reduced_motion: reducedMotion, custom_palette: nextPalette })
        .then(() => setPaletteDirty(false))
    }, 350)
  }

  const selectTheme = (newThemeId: string) => {
    setTheme(newThemeId)
    applyTheme(newThemeId, newThemeId === 'custom' ? customPalette : undefined)
    persist('appearance', { theme: newThemeId, density, custom_palette: customPalette })
  }

  const selectFont = (fontId: string) => {
    setFont(fontId)
    const effectiveCustomFont = normalizeCustomFont(customFont)
    applyFont(fontId, fontId === 'custom' ? effectiveCustomFont : undefined)
    persist('appearance', { theme, density, custom_palette: customPalette, font: fontId, custom_font: fontId === 'custom' ? effectiveCustomFont : undefined })
  }

  const applyVisualPreset = (preset: VisualPreset, paletteOverride?: CustomPalette) => {
    const nextPalette = paletteOverride || (preset.theme === 'custom' ? customPalette : undefined)
    const nextDisplay = { density: preset.display.density, radius: preset.display.radius, fontSize: preset.display.fontSize, reducedMotion }
    setTheme(preset.theme)
    setFont(preset.font)
    setTypography(preset.typography)
    setDensity(nextDisplay.density)
    setRadius(nextDisplay.radius)
    setFontSize(nextDisplay.fontSize)
    applyTheme(preset.theme, nextPalette)
    applyFont(preset.font, preset.font === 'custom' ? customFont : undefined)
    applyTypography(preset.typography)
    applyDisplayPreferences(nextDisplay)
    persist('appearance', {
      theme: preset.theme,
      density: nextDisplay.density,
      radius: nextDisplay.radius,
      font_size: nextDisplay.fontSize,
      reduced_motion: reducedMotion,
      custom_palette: nextPalette || customPalette,
      font: preset.font,
      custom_font: preset.font === 'custom' ? customFont : undefined,
      typography: preset.typography,
    })
  }

  const surpriseMe = async () => {
    const choices = VISUAL_PRESETS.filter((preset) => preset.theme !== theme || preset.font !== font)
    const preset = choices[Math.floor(Math.random() * choices.length)] || VISUAL_PRESETS[0]
    setVariantGenerating(true)
    try {
      const generated = await api<{ day?: CustomPalette; night?: CustomPalette }>('/ai/theme-variants', { method: 'POST', body: JSON.stringify({ current: customPalette, mode: themeMode }) })
      const generatedPalette = generated.day && generated.night ? generated[themeMode] : undefined
      if (generated.day && generated.night) {
        const nextPair = { day: generated.day, night: generated.night }
        setThemePair(nextPair)
        saveThemePair(nextPair)
        setCustomPalette(generatedPalette || customPalette)
        applyVisualPreset({ ...preset, theme: 'custom' }, generatedPalette)
        setStatus(`Gemini remixed your palette with ${preset.name.toLowerCase()}`)
      } else {
        applyVisualPreset(preset)
        setStatus(`${preset.name} applied`)
      }
    } catch {
      applyVisualPreset(preset)
      setStatus(`${preset.name} applied`)
    } finally {
      setVariantGenerating(false)
      window.setTimeout(() => setStatus(''), 2400)
    }
  }

  const updateCustomFont = (key: keyof CustomFont, value: string) => {
    const next = { ...customFont, [key]: value }
    setCustomFont(next)
    if (font === 'custom') applyFont('custom', next)
    persist('appearance', { theme, density, custom_palette: customPalette, font: 'custom', custom_font: next })
  }

  const updateTypography = (key: keyof TypographyPreferences, value: number) => {
    const next = { ...typography, [key]: value }
    setTypography(next)
    applyTypography(next)
    if (typographySaveTimer.current !== null) window.clearTimeout(typographySaveTimer.current)
    setStatus('Applying type…')
    typographySaveTimer.current = window.setTimeout(() => {
      persist('appearance', { theme, density, radius, font_size: fontSize, reduced_motion: reducedMotion, custom_palette: customPalette, font, custom_font: font === 'custom' ? customFont : undefined, typography: next })
    }, 280)
  }

  const resetTypography = () => {
    if (typographySaveTimer.current !== null) window.clearTimeout(typographySaveTimer.current)
    setTypography(DEFAULT_TYPOGRAPHY)
    applyTypography(DEFAULT_TYPOGRAPHY)
    persist('appearance', { theme, density, radius, font_size: fontSize, reduced_motion: reducedMotion, custom_palette: customPalette, font, custom_font: font === 'custom' ? customFont : undefined, typography: DEFAULT_TYPOGRAPHY })
  }

  const commitPalette = (nextPalette: CustomPalette, record = true) => {
    if (record) {
      setPaletteHistory((items) => [...items.slice(-19), customPalette])
      setPaletteFuture([])
    }
    setCustomPalette(nextPalette)
    const nextPair = { ...themePair, [themeMode]: nextPalette } as ThemePair
    setThemePair(nextPair)
    saveThemePair(nextPair)
    setTheme('custom')
    applyTheme('custom', nextPalette)
    savePalette(nextPalette)
  }

  const switchThemeMode = (mode: 'day' | 'night') => {
    setThemeMode(mode)
    try { localStorage.setItem('taste-map-theme-mode', mode) } catch {}
    const nextPalette = themePair[mode]
    setCustomPalette(nextPalette)
    applyTheme('custom', nextPalette)
    persist('appearance', { theme: 'custom', density, custom_palette: nextPalette })
  }

  const generateVariant = async (direction = 1) => {
    setVariantGenerating(true)
    try {
      const generated = await api<{ day?: CustomPalette; night?: CustomPalette; model?: string }>('/ai/theme-variants', { method: 'POST', body: JSON.stringify({ current: customPalette, mode: themeMode }) })
      if (generated.day && generated.night) {
        const nextPair = { day: generated.day, night: generated.night }
        setThemePair(nextPair)
        saveThemePair(nextPair)
        commitPalette(nextPair[themeMode])
        setThemePair(nextPair)
        saveThemePair(nextPair)
        setStatus(`Gemini theme applied${generated.model ? ` · ${generated.model}` : ''}`)
        window.setTimeout(() => setStatus(''), 2200)
        setVariantGenerating(false)
        return
      }
    } catch { /* use the instant local variant when Gemini is unavailable */ }
    const nextIndex = (variantIndex + direction + THEME_VARIANTS.length) % THEME_VARIANTS.length
    const variant = THEME_VARIANTS[nextIndex]
    setVariantIndex(nextIndex)
    const nextPair = { day: variant.day, night: variant.night }
    setThemePair(nextPair)
    saveThemePair(nextPair)
    commitPalette(nextPair[themeMode])
    setThemePair(nextPair)
    saveThemePair(nextPair)
    setStatus(`${variant.name} variant applied`)
    window.setTimeout(() => setStatus(''), 1800)
    setVariantGenerating(false)
  }

  const undoPalette = () => {
    const previous = paletteHistory[paletteHistory.length - 1]
    if (!previous) return
    setPaletteHistory((items) => items.slice(0, -1))
    setPaletteFuture((items) => [...items, customPalette])
    commitPalette(previous, false)
  }

  const redoPalette = () => {
    const next = paletteFuture[paletteFuture.length - 1]
    if (!next) return
    setPaletteFuture((items) => items.slice(0, -1))
    setPaletteHistory((items) => [...items, customPalette])
    commitPalette(next, false)
  }

  const copyThemeJson = async () => {
    const effectiveCustomFont = normalizeCustomFont(customFont)
    await navigator.clipboard.writeText(JSON.stringify({ name: 'Learning Compass visual system', modes: themePair, appearance: { font, customFont: effectiveCustomFont, typography, density, radius, fontSize, reducedMotion, responsiveViewport: 'auto' } }, null, 2))
    setStatus('Visual system JSON copied — includes colors, fonts, typography, and interface settings')
    window.setTimeout(() => setStatus(''), 1600)
  }

  const exportTheme = () => {
    const effectiveCustomFont = normalizeCustomFont(customFont)
    const blob = new Blob([JSON.stringify({ name: 'Learning Compass visual system', modes: themePair, appearance: { font, customFont: effectiveCustomFont, typography, density, radius, fontSize, reducedMotion, responsiveViewport: 'auto' } }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = 'learning-compass-theme.json'; link.click(); URL.revokeObjectURL(url)
  }

  const applyThemeJson = (parsed: any) => {
    const imported: ThemePair = {
      day: { ...DEFAULT_CUSTOM_PALETTE, ...(parsed?.modes?.day || parsed?.day || {}) },
      night: { ...DEFAULT_CUSTOM_PALETTE, ...(parsed?.modes?.night || parsed?.night || {}) },
    }
    const appearance = parsed?.appearance || {}
    setThemePair(imported)
    saveThemePair(imported)
    const nextPalette = imported[themeMode]
    const nextFont = typeof appearance.font === 'string' ? appearance.font : font
    const nextCustomFont = normalizeCustomFont(appearance.customFont || customFont)
    const nextTypography = { ...typography, ...(appearance.typography || {}) }
    const nextDisplay = { density: appearance.density || density, radius: appearance.radius || radius, fontSize: appearance.fontSize || fontSize, reducedMotion: typeof appearance.reducedMotion === 'boolean' ? appearance.reducedMotion : reducedMotion }
    setCustomPalette(nextPalette); setTheme('custom'); applyTheme('custom', nextPalette)
    setFont(nextFont); setCustomFont(nextCustomFont); setTypography(nextTypography)
    setDensity(nextDisplay.density); setRadius(nextDisplay.radius); setFontSize(nextDisplay.fontSize); setReducedMotion(nextDisplay.reducedMotion)
    applyFont(nextFont, nextFont === 'custom' ? nextCustomFont : undefined); applyTypography(nextTypography); applyDisplayPreferences(nextDisplay)
    persist('appearance', { theme: 'custom', density: nextDisplay.density, radius: nextDisplay.radius, font_size: nextDisplay.fontSize, reduced_motion: nextDisplay.reducedMotion, custom_palette: nextPalette, font: nextFont, custom_font: nextFont === 'custom' ? nextCustomFont : undefined, typography: nextTypography })
    return Boolean(appearance.font || appearance.customFont || appearance.typography || appearance.density || appearance.radius || appearance.fontSize || appearance.reducedMotion !== undefined)
  }

  const importTheme = async (file?: File) => {
    if (!file) return
    try {
      const fullSystem = applyThemeJson(JSON.parse(await file.text()))
      setStatus(fullSystem ? 'Visual system imported — colors, fonts, type, and interface settings applied' : 'Palette imported — use a full visual-system JSON to include fonts and type')
      window.setTimeout(() => setStatus(''), 1600)
    } catch { setStatus('That file is not a valid theme JSON.') }
  }

  const saveNamedTheme = () => {
    const name = window.prompt('Name this theme')?.trim()
    if (!name) return
    const next = { ...savedThemes, [name]: { name, modes: themePair, appearance: { font, customFont, typography, density, radius, fontSize, reducedMotion, responsiveViewport: 'auto' as const } } }
    setSavedThemes(next)
    try { localStorage.setItem('taste-map-saved-themes', JSON.stringify(next)) } catch {}
    setStatus(`Saved “${name}”`)
    window.setTimeout(() => setStatus(''), 1600)
  }

  const loadNamedTheme = (name: string) => {
    const saved = savedThemes[name]
    if (!saved) return
    const pair = (saved as ThemeBundle).modes || (saved as unknown as ThemePair)
    const appearance = (saved as ThemeBundle).appearance || {}
    const nextPalette = pair[themeMode]
    setThemePair(pair); saveThemePair(pair); setCustomPalette(nextPalette); setTheme('custom'); applyTheme('custom', nextPalette)
    if (appearance.font) { setFont(appearance.font); applyFont(appearance.font, appearance.font === 'custom' ? appearance.customFont : undefined) }
    const nextCustomFont = normalizeCustomFont(appearance.customFont || customFont)
    if (appearance.customFont) setCustomFont(nextCustomFont)
    if (appearance.typography) { setTypography(appearance.typography); applyTypography(appearance.typography) }
    const nextDisplay = { density: appearance.density || density, radius: appearance.radius || radius, fontSize: appearance.fontSize || fontSize, reducedMotion: typeof appearance.reducedMotion === 'boolean' ? appearance.reducedMotion : reducedMotion }
    setDensity(nextDisplay.density); setRadius(nextDisplay.radius); setFontSize(nextDisplay.fontSize); setReducedMotion(nextDisplay.reducedMotion); applyDisplayPreferences(nextDisplay)
    persist('appearance', { theme: 'custom', density: nextDisplay.density, radius: nextDisplay.radius, font_size: nextDisplay.fontSize, reduced_motion: nextDisplay.reducedMotion, custom_palette: nextPalette, font: appearance.font || font, custom_font: nextCustomFont, typography: appearance.typography || typography })
    setStatus(`Applied “${name}”`)
  }

  const updateCustomColor = (key: keyof CustomPalette, value: string) => {
    commitPalette({ ...customPalette, [key]: value })
  }

  const handleApplyPastedCodes = () => {
    const pasted = pasteCodes.trim()
    if (pasted.startsWith('{')) {
      try {
        const fullSystem = applyThemeJson(JSON.parse(pasted))
        setStatus(fullSystem ? 'Visual system applied — colors, fonts, type, and interface settings updated' : 'JSON palette applied — add an appearance object to change fonts and type')
      } catch {
        setStatus('That JSON is not valid. Paste a complete visual-system JSON or color codes.')
      }
      window.setTimeout(() => setStatus(''), 2200)
      return
    }
    const extracted = extractColorsFromText(pasteCodes)
    if (extracted.length === 0) {
      setStatus('No valid HEX or RGB color codes found.')
      window.setTimeout(() => setStatus(''), 2000)
      return
    }
    const [brand, shell, surface, highlight, accent, ink, rail, seam, due, danger, map] = extracted
    const nextPalette: CustomPalette = {
      ...customPalette,
      brand: brand || customPalette.brand,
      shell: shell || customPalette.shell,
      surface: surface || customPalette.surface,
      highlight: highlight || customPalette.highlight,
      accent: accent || customPalette.accent,
      ink: ink || brand || customPalette.brand,
      rail: rail || customPalette.rail,
      seam: seam || customPalette.seam,
      due: due || customPalette.due,
      danger: danger || customPalette.danger,
      map: map || customPalette.map || '#337f8c',
    }
    setCustomPalette(nextPalette)
    setTheme('custom')
    applyTheme('custom', nextPalette)
    persist('appearance', { theme: 'custom', density, custom_palette: nextPalette })
    setStatus(`Applied ${extracted.length} color code${extracted.length > 1 ? 's' : ''}!`)
    window.setTimeout(() => setStatus(''), 2000)
  }

  const copyThemePrompt = async () => {
    const paletteBrief = Object.entries(customPalette).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(', ')
    const effectiveCustomFont = normalizeCustomFont(customFont)
    const fullPrompt = [
      'Act as the senior product art director for Learning Compass, a premium 2026 learning workspace. Redesign the complete product system—not only its color palette and not only this Preferences screen.',
      'Creative direction: warm off-white editorial planes, lifted paper-white surfaces, crisp black ink, one confident coral primary action, generous pill geometry for decisive actions, thin architectural seams, calm whitespace, and highly legible information hierarchy. The result should feel human-crafted, tactile, current, and quietly expensive.',
      'Use premium product and editorial references such as Attio, Framer, Linear, Raycast, Superhuman, Readwise Reader, Notion, Craft, Arc, and Are.na as quality bars, while creating an original Learning Compass system. Do not copy proprietary layouts, logos, illustrations, or exact brand palettes.',
      `Current visual system: palette ${paletteBrief || 'none'}; font preset ${font}; UI/body stack ${effectiveCustomFont.ui}; display/headings stack ${effectiveCustomFont.display}; reading/long-form stack ${effectiveCustomFont.reading}; mono/code-and-evidence stack ${effectiveCustomFont.mono}.`,
      `Global typography settings: ${typography.baseSize}px base size; body weight ${typography.bodyWeight}; heading weight ${typography.headingWeight}; line height ${typography.lineHeight}; letter spacing ${typography.letterSpacing}em; display scale ${typography.displayScale}x; reading width ${typography.readingMeasure}ch. Global interface settings: ${density} density, ${radius} radius, ${fontSize} font size, reduced motion ${reducedMotion}. Responsive scaling is automatic: +8% from 1440px and +14% from 1920px; mobile stays at the selected size.`,
      'Apply the direction coherently to the persistent rail, command bar, page horizons, workspace modes, filters, reading surfaces, ledgers, cards, forms, dialogs, inspectors, maps, empty states, and the mobile bottom dock across Home, Library, Learn, Map, and Settings. Primary actions should be unmistakable; secondary controls should remain quiet. Preserve semantic hierarchy and actual workflows rather than turning the product into a marketing landing page.',
      'Reject generic dashboard card grids, excessive glass effects, decorative gradients, neon-on-black clichés, interchangeable rounded rectangles, tiny low-contrast metadata, and motion without meaning. Keep WCAG AA contrast, 44px mobile targets, RTL-safe geometry, clear Arabic fallbacks, a 45–75ch reading measure, and reduced-motion support. Use web-loadable font families or robust fallbacks; never return blank stacks. For Arabic, include Noto Sans Arabic or Noto Naskh Arabic. Berkeley Mono is local-only and must include IBM Plex Mono, JetBrains Mono, or ui-monospace as fallback.',
      'Return only valid JSON with no markdown or prose. Schema: {"name":"short name","modes":{"day":{11 color keys},"night":{11 color keys}},"appearance":{"font":"studio|plex|inter|editorial|newsreader|jakarta|system|terminal|custom","customFont":{"ui":"font stack for body and interface","display":"font stack for headings","reading":"font stack for long-form reading","mono":"font stack for code metadata and evidence"},"typography":{"baseSize":17,"bodyWeight":400,"headingWeight":650,"lineHeight":1.62,"letterSpacing":-0.008,"displayScale":1.05,"readingMeasure":70},"density":"comfortable|balanced|compact","radius":"sharp|soft|round","fontSize":"small|medium|large","reducedMotion":false,"responsiveViewport":"auto"}}. Use uppercase #RRGGBB values for brand, shell, surface, highlight, accent, ink, rail, seam, due, danger, and map in both modes.'
    ].join('\n')
    try {
      await navigator.clipboard.writeText(fullPrompt)
      setPromptCopied(true)
      window.setTimeout(() => setPromptCopied(false), 1800)
    } catch {
      setStatus('Copy was blocked by the browser. Select the prompt manually.')
    }
  }

  const saveAtlas = (patch: Record<string, unknown>) => persist('atlas', patch)

  const saveDisplay = (next: Partial<DisplayPreferences>) => {
    const value = { density, radius, fontSize, reducedMotion, ...next }
    setDensity(value.density)
    setRadius(value.radius)
    setFontSize(value.fontSize)
    setReducedMotion(value.reducedMotion)
    applyDisplayPreferences(value)
    persist('appearance', { theme, density: value.density, radius: value.radius, font_size: value.fontSize, reduced_motion: value.reducedMotion, custom_palette: customPalette })
  }

  const saveLearning = (value: number) => { setRetention(value); persist('learning', { retention: value, queue_cap: 5 }) }
  const saveDelivery = (patch: Partial<{ effort: 'light' | 'moderate' | 'deep'; language: 'any' | 'en' | 'ar'; delivery_modes: Array<'read' | 'watch' | 'listen' | 'practice'>; depth_tier: 'adaptive' | 'introductory' | 'intermediate' | 'advanced' }>) => {
    const next = { effort: deliveryEffort, language: deliveryLanguage, delivery_modes: deliveryModes, depth_tier: depthTier, ...patch }
    setDeliveryEffort(next.effort); setDeliveryLanguage(next.language); setDeliveryModes(next.delivery_modes); setDepthTier(next.depth_tier)
    persist('delivery_context', next)
  }
  const saveSrs = (next: Partial<{ auto_extract: boolean }>) => { const current = { minimum_rating: 7, auto_extract: autoExtract, ...next }; setAutoExtract(current.auto_extract); persist('srs_drafts', current) }
  const activePreset = VISUAL_PRESETS.find((preset) => {
    const typeMatches = (Object.keys(preset.typography) as Array<keyof TypographyPreferences>)
      .every((key) => preset.typography[key] === typography[key])
    return preset.theme === theme
      && preset.font === font
      && preset.display.density === density
      && preset.display.radius === radius
      && preset.display.fontSize === fontSize
      && typeMatches
  })
  const activeThemePreset = THEME_PRESETS.find((preset) => preset.id === theme)
  const activeFontPreset = FONT_PRESETS.find((preset) => preset.id === font)
  const activeThemeName = activeThemePreset?.name || (theme === 'custom' ? 'Custom palette' : labelize(theme))
  const activeSwatches = activeThemePreset?.swatches || [customPalette.brand, customPalette.shell, customPalette.highlight, customPalette.accent]
  const themePresetGroups = [
    { mode: 'light' as const, title: 'Day palettes', description: 'Paper-bright systems for daylight and focused reading.' },
    { mode: 'dark' as const, title: 'Night palettes', description: 'Low-light systems with luminous type and restrained signals.' },
  ]
  const customThemeMode: ThemeMode = themeMode === 'night' ? 'dark' : 'light'
  const contrastChecks = auditThemeContrast(customPalette, customThemeMode)
  const contrastFailures = contrastChecks.filter((check) => !check.passes).length

  return <div class="settings-page preferences-page">
    <header class="settings-intro preferences-hero">
      <div><span class="settings-active-label">Settings / Preferences</span><h1>Preferences</h1><p>Shape how Learning Compass looks, reads, and supports your learning. Every change applies across the whole studio.</p></div>
      <output class="preferences-save-state" aria-live="polite" data-working={Boolean(status)}>{status || 'Saved automatically'}</output>
    </header>

    <section class="settings-active-system" aria-label="Active visual system">
      <span class="preferences-active-swatch" aria-hidden="true">{activeSwatches.map((color, index) => <i key={`${color}-${index}`} style={{ background: color }} />)}</span>
      <div class="preferences-active-copy"><span class="settings-active-label">Active workspace</span><strong>{activePreset?.name || 'Custom tuning'}</strong><small>{activeThemeName} · {activeFontPreset?.name || (font === 'custom' ? 'Custom font stacks' : font)} · {effectiveBaseSize}px · {density}</small></div>
      <button type="button" class="preferences-reset" onClick={() => applyVisualPreset(VISUAL_PRESETS[0])}>Restore focused study</button>
    </section>

    <details class="settings-jump-disclosure">
      <summary>Jump to a preference</summary>
      <nav class="settings-jump-nav" aria-label="Preference sections"><a href="#visual-presets-heading" onClick={(event) => jumpToPreference(event, 'visual-presets-heading')}>Workspace</a><a href="#interface-tokens" onClick={(event) => jumpToPreference(event, 'interface-tokens')}>Comfort</a><a href="#theme-section" onClick={(event) => jumpToPreference(event, 'theme-section')}>Theme</a><a href="#font-section" onClick={(event) => jumpToPreference(event, 'font-section')}>Reading</a><a href="#learning-preferences" onClick={(event) => jumpToPreference(event, 'learning-preferences')}>Learning</a><a href="#atlas-preferences" onClick={(event) => jumpToPreference(event, 'atlas-preferences')}>Map</a></nav>
    </details>

    <div class="preferences-layout">
      <aside class="preferences-preview-rail" aria-label="Current appearance preview"><ThemeContextPreview /><div class="preferences-scope-note"><strong>One system, everywhere</strong><p>Your appearance choices apply to Home, Library, Learn, Map, Settings, dialogs, and object views.</p></div></aside>
      <div class="preferences-main">

    <section class="visual-presets-section" aria-labelledby="visual-presets-title" id="visual-presets-heading">
      <div class="section-head">
        <div><span class="preference-section-number">01 · Workspace style</span><h2 id="visual-presets-title">Choose a distinct visual world</h2><p class="section-description">Eight premium-product references, rebuilt for Learning Compass. One choice sets color, type, spacing, and shape across the whole site.</p></div>
        <button type="button" class="btn-surprise" onClick={surpriseMe} disabled={variantGenerating}>{variantGenerating ? 'Creating a style…' : 'Surprise me'}</button>
      </div>
      <div class="visual-presets-grid">
        {VISUAL_PRESETS.map((preset) => {
          const themePreset = THEME_PRESETS.find((item) => item.id === preset.theme)
          const fontPreset = FONT_PRESETS.find((item) => item.id === preset.font)
          const isActive = activePreset?.id === preset.id
          return <button type="button" class={`visual-preset-card${isActive ? ' active' : ''}`} aria-pressed={isActive} key={preset.id} onClick={() => applyVisualPreset(preset)}>
            {themePreset ? <ThemeSemanticPreview palette={paletteFromThemePreset(themePreset)} mode={themePreset.mode} font={fontPreset} radius={preset.display.radius} density={preset.display.density} /> : null}
            <span class="visual-preset-copy"><span class="visual-preset-reference">{preset.inspiration}</span><strong>{preset.name}</strong><small>{preset.description}</small><span class="visual-preset-spec">{fontPreset?.name} · {preset.typography.baseSize}px · {preset.display.density}</span></span>
          </button>
        })}
      </div>
    </section>

    <section class="preference-panel preference-comfort" id="interface-tokens" aria-labelledby="comfort-title">
      <div class="section-head"><div><span class="preference-section-number">02 · Comfort & layout</span><h2 id="comfort-title">Make the workspace easy to use</h2><p class="section-description">These controls change every canvas, panel, row, and action—not only this page.</p></div></div>
      <div class="preference-choice-grid">
        <PreferenceChoice name="workspace-density" label="Density" description="How much information fits on screen." value={density} options={[
          { value: 'comfortable', label: 'Comfortable', description: 'More breathing room' },
          { value: 'balanced', label: 'Balanced', description: 'Everyday spacing' },
          { value: 'compact', label: 'Compact', description: 'More at a glance' },
        ]} onChange={(value) => saveDisplay({ density: value })} />
        <PreferenceChoice name="corner-style" label="Corners" description="The shape of panels and controls." value={radius} options={[
          { value: 'sharp', label: 'Sharp', description: 'Crisp and precise' },
          { value: 'soft', label: 'Soft', description: 'Quietly rounded' },
          { value: 'round', label: 'Round', description: 'Friendly and open' },
        ]} onChange={(value) => saveDisplay({ radius: value })} />
        <PreferenceChoice name="interface-size" label="Text size" description="The interface scale across the studio." value={fontSize} options={[
          { value: 'small', label: 'Small', description: 'Dense workspace' },
          { value: 'medium', label: 'Medium', description: 'Standard reading' },
          { value: 'large', label: 'Large', description: 'Extra clarity' },
        ]} onChange={(value) => saveDisplay({ fontSize: value })} />
        <PreferenceToggle label="Reduce motion" description="Remove nonessential transitions and animated movement." checked={reducedMotion} onChange={(value) => saveDisplay({ reducedMotion: value })} />
      </div>
    </section>

    <details class="theme-section preference-disclosure" id="theme-section">
      <summary><span class="preference-summary-icon" aria-hidden="true">{activeSwatches.map((color, index) => <i key={`${color}-${index}`} style={{ background: color }} />)}</span><span><strong>Theme</strong><small>{activeThemeName} · {THEME_PRESETS.length + 1} choices</small></span><em>Browse</em></summary>
      <div class="preference-disclosure-body">
      <div class="section-head">
        <div><span class="preference-section-number">03 · Theme</span><h2>Choose the atmosphere</h2><p class="section-description">Pick a complete day or night palette. Your content and learning data stay unchanged.</p></div>
      </div>

      <div class="theme-preset-groups">
        {themePresetGroups.map((group) => <section class="theme-preset-group" aria-labelledby={`theme-group-${group.mode}`} key={group.mode}>
          <header class="theme-preset-group-heading"><div><h3 id={`theme-group-${group.mode}`}>{group.title}</h3><p>{group.description}</p></div><span>{THEME_PRESETS.filter((preset) => preset.mode === group.mode).length} palettes</span></header>
          <div class="theme-presets-grid" role="group" aria-label={group.title}>
            {THEME_PRESETS.filter((preset) => preset.mode === group.mode).map((preset) => {
              const isSelected = theme === preset.id
              const palette = paletteFromThemePreset(preset)
              return <button
                key={preset.id}
                type="button"
                class={`theme-preset-card${isSelected ? ' active' : ''}`}
                onClick={() => selectTheme(preset.id)}
                aria-pressed={isSelected}
              >
                <ThemeSemanticPreview palette={palette} mode={preset.mode} />
                <span class="theme-preset-copy">
                  <span class="theme-preset-title-row"><strong class="theme-preset-title">{preset.name}</strong>{isSelected && <span class="theme-selected-marker">Selected</span>}</span>
                  <small class={`theme-preset-mode mode-${preset.mode}`}>{preset.mode === 'dark' ? 'Night' : 'Day'}</small>
                  <span class="theme-preset-desc">{preset.description}</span>
                </span>
              </button>
            })}
          </div>
        </section>)}

        <section class="theme-preset-group theme-custom-choice" aria-labelledby="theme-group-custom">
          <header class="theme-preset-group-heading"><div><h3 id="theme-group-custom">Custom visual system</h3><p>Build a paired day and night system from the semantic roles below.</p></div><span>11 color roles</span></header>
          <button
            type="button"
            class={`theme-preset-card theme-custom-card${theme === 'custom' ? ' active' : ''}`}
            onClick={() => selectTheme('custom')}
            aria-pressed={theme === 'custom'}
          >
            <ThemeSemanticPreview palette={customPalette} mode={customThemeMode} />
            <span class="theme-preset-copy">
              <span class="theme-preset-title-row"><strong class="theme-preset-title">Your visual system</strong>{theme === 'custom' && <span class="theme-selected-marker">Selected</span>}</span>
              <small class={`theme-preset-mode mode-${customThemeMode}`}>{themeMode === 'night' ? 'Night pair' : 'Day pair'}</small>
              <span class="theme-preset-desc">Tune every semantic color, explore variants, and exchange the complete system when you need it.</span>
            </span>
          </button>
        </section>
      </div>

      {theme === 'custom' && (
        <div class="custom-palette-panel" aria-label="Custom visual system editor">
          <div class="custom-palette-header">
            <div>
              <h3>Shape your day and night pair</h3>
              <p>Choose a mode, explore a direction, then tune the semantic roles. Changes preview immediately and save automatically.</p>
            </div>
            <span class="theme-palette-mode-status">Editing {themeMode === 'night' ? 'night' : 'day'} palette</span>
          </div>
          <div class="theme-workshop-stage">
            <div class="theme-workshop-stage-copy"><strong>Explore this pair</strong><span>Generate a related direction or move through your local edit history.</span></div>
            <div class="theme-workshop-toolbar" aria-label="Theme workshop controls">
            <div class="theme-mode-switch" role="group" aria-label="Theme mode">
              <button type="button" class={themeMode === 'day' ? 'active' : ''} aria-pressed={themeMode === 'day'} onClick={() => switchThemeMode('day')}>Day</button>
              <button type="button" class={themeMode === 'night' ? 'active' : ''} aria-pressed={themeMode === 'night'} onClick={() => switchThemeMode('night')}>Night</button>
            </div>
            <button type="button" class="btn-secondary" onClick={() => generateVariant(-1)} disabled={variantGenerating}>Previous variant</button>
            <button type="button" class="btn-apply" onClick={() => generateVariant(1)} disabled={variantGenerating}>{variantGenerating ? 'Gemini is designing…' : 'Generate variant'}</button>
            <button type="button" class="btn-secondary" onClick={surpriseMe} disabled={variantGenerating}>Surprise me</button>
            <button type="button" class="btn-secondary" onClick={undoPalette} disabled={!paletteHistory.length}>Undo</button>
            <button type="button" class="btn-secondary" onClick={redoPalette} disabled={!paletteFuture.length}>Redo</button>
          </div>
          </div>

          <div class="theme-color-workspace">
            <div class="custom-palette-fields" aria-label="Semantic color roles">
              {CUSTOM_COLOR_GROUPS.map((group) => <fieldset class="custom-color-group" key={group.name}>
                <legend><strong>{group.name}</strong><span>{group.description}</span></legend>
                <div class="custom-color-group-fields">
                  {group.fields.map(({ key, label, fallback, description }) => <div class="custom-color-item" key={key}>
                    <label for={`color-${key}`}><strong>{label}</strong><small>{description}</small></label>
                    <div class="custom-color-input-group">
                      <input id={`color-${key}-picker`} type="color" aria-label={`${label} color picker`} value={normalizeColor(customPalette[key] || fallback, fallback)} onInput={(event) => updateCustomColor(key, (event.target as HTMLInputElement).value)} />
                      <input id={`color-${key}`} type="text" value={customPalette[key] || ''} onInput={(event) => updateCustomColor(key, (event.target as HTMLInputElement).value)} placeholder={`${fallback} or rgb(...)`} spellcheck={false} />
                    </div>
                  </div>)}
                </div>
              </fieldset>)}
            </div>
            <aside class="theme-contrast-report" aria-labelledby="theme-contrast-title">
              <header><div><h4 id="theme-contrast-title">Rendered contrast</h4><p>Checks use the CSS colors the studio actually renders, including automatic foreground correction.</p></div><strong class={contrastFailures ? 'has-review' : 'all-pass'}>{contrastFailures ? `${contrastFailures} to review` : 'All pass'}</strong></header>
              <div class="theme-contrast-grid">
                {contrastChecks.map((check) => <span class={check.passes ? 'contrast-pass' : 'contrast-fail'} key={check.id}>
                  <i class="theme-contrast-sample" style={{ background: check.background, color: check.foreground }} aria-hidden="true">Aa</i>
                  <span><strong>{check.label}</strong><small>{check.ratio === null ? 'Invalid color' : `${check.ratio.toFixed(1)}:1 · ${check.passes ? 'Pass' : 'Review'}`}</small></span>
                </span>)}
              </div>
              <p class="theme-contrast-note">Target: 4.5:1 for normal text. Authored colors stay unchanged; derived text tokens may be corrected for readability.</p>
            </aside>
          </div>
          <details class="theme-workshop-advanced">
            <summary><span><strong>Transfer, automation & snapshots</strong><small>Paste colors, exchange JSON, copy an AI brief, or save this full system for later.</small></span><em>Open tools</em></summary>
            <div class="theme-workshop-advanced-body">
              <div class="theme-json-explainer" role="note">
                <strong>Complete system exchange</strong>
                <span>JSON can carry day/night palettes, font roles, type rhythm, density, corners, text size, and motion across the whole studio.</span>
                <small>Use web-loadable fonts or include reliable fallbacks for local typefaces.</small>
              </div>
              <div class="theme-workshop-toolbar theme-transfer-toolbar" aria-label="Visual system transfer controls">
                <button type="button" class="palette-prompt-button" onClick={copyThemePrompt} title="Copy a prompt for another AI to generate the full visual system">{promptCopied ? 'AI prompt copied' : 'Copy AI prompt'}</button>
                <button type="button" class="btn-secondary" onClick={copyThemeJson} title="Copy colors, fonts, typography, and interface settings">Copy JSON</button>
                <button type="button" class="btn-secondary" onClick={exportTheme} title="Download the complete visual system">Export JSON</button>
                <label class="theme-import-button" title="Apply colors, fonts, typography, and interface settings across the studio"><span>Import JSON</span><input type="file" accept="application/json" aria-label="Import visual system JSON" onChange={(event) => importTheme((event.target as HTMLInputElement).files?.[0])} /></label>
                <button type="button" class="btn-secondary" onClick={saveNamedTheme}>Save snapshot</button>
                {Object.keys(savedThemes).length > 0 && <select class="theme-saved-select" aria-label="Saved themes" value="" onChange={(event) => loadNamedTheme((event.target as HTMLSelectElement).value)}><option value="">Load saved theme…</option>{Object.keys(savedThemes).map((name) => <option value={name} key={name}>{name}</option>)}</select>}
              </div>
              <div class="custom-palette-paste-box">
                <textarea aria-label="Paste color codes or visual-system JSON" placeholder="Paste 11 color codes or a complete visual-system JSON. JSON applies colors, fonts, typography, and interface settings." value={pasteCodes} onInput={(event) => setPasteCodes((event.target as HTMLTextAreaElement).value)} rows={4} />
                <div class="custom-palette-actions">
                  <button type="button" class="btn-apply" onClick={handleApplyPastedCodes}>Apply colors or JSON</button>
                  <button type="button" class="btn-secondary" onClick={() => setPasteCodes(`#1D4533\n#F7EAE0\n#FFFFFF\n#F9D2BA\n#5E3122\n#1D4533\n#133325\n#DEDAD0\n#874606\n#9C2E21\n#3F6E4E`)}>Insert sample codes</button>
                  <button type="button" class="btn-secondary" onClick={() => commitPalette(DEFAULT_CUSTOM_PALETTE)}>Reset palette</button>
                </div>
              </div>
            </div>
          </details>
          <div class="theme-token-map" aria-label="Theme token usage">
            <span><strong>Brand</strong><small>primary actions · focus</small></span>
            <span><strong>Rail</strong><small>navigation</small></span>
            <span><strong>Seam</strong><small>borders · dividers</small></span>
            <span><strong>Due / Danger</strong><small>status feedback</small></span>
            <span><strong>Map</strong><small>atlas links · branches</small></span>
          </div>
          <p class="theme-palette-save-note" aria-live="polite">{paletteDirty ? 'Saving palette changes…' : 'Palette changes save automatically.'}</p>
        </div>
      )}
      </div>
    </details>

    <details class="font-section preference-disclosure" id="font-section">
      <summary><span class="preference-summary-type" style={{ fontFamily: activeFontPreset?.ui || customFont.ui }} aria-hidden="true">Aa</span><span><strong>Font family</strong><small>{activeFontPreset?.name || (font === 'custom' ? 'Custom font stacks' : font)} · interface, reading, headings, and code</small></span><em>Choose</em></summary>
      <div class="preference-disclosure-body">
      <div class="section-head">
        <div><span class="preference-section-number">04 · Reading & fonts</span><h2>Choose the voice of the page</h2><p class="section-description">Select a coordinated family for interface text, long-form reading, headings, and code metadata.</p></div>
      </div>
      <div class="font-presets-grid" role="group" aria-label="Fonts">
        {FONT_PRESETS.map((f) => (
          <button
            key={f.id}
            type="button"
            class={`font-preset-card ${font === f.id ? 'active' : ''}`}
            onClick={() => selectFont(f.id)}
            aria-pressed={font === f.id}
          >
            <span class="font-preset-sample" style={{ fontFamily: f.ui }}>Aa</span>
            <span class="font-preset-copy">
              <strong>{f.name}</strong>
              <small>{f.description}</small>
            </span>
          </button>
        ))}
        <button
          type="button"
          class={`font-preset-card ${font === 'custom' ? 'active' : ''}`}
          onClick={() => selectFont('custom')}
          aria-pressed={font === 'custom'}
        >
          <span class="font-preset-sample" style={{ fontFamily: customFont.ui }}>Aa</span>
          <span class="font-preset-copy">
            <strong>Custom fonts</strong>
            <small>Enter your own font-family stacks.</small>
          </span>
        </button>
      </div>

      {font === 'custom' && (
        <div class="custom-font-panel">
          <div class="custom-font-header">
            <h3>Custom font stacks</h3>
            <p>These four roles control the whole studio. Web fonts load automatically; local-only faces need a reliable fallback.</p>
          </div>
          <div class="custom-font-fields">
            <label>
              <span>Interface / Body</span>
              <input
                type="text"
                value={customFont.ui}
                onInput={(e) => updateCustomFont('ui', (e.target as HTMLInputElement).value)}
                placeholder='"IBM Plex Sans", "Noto Sans Arabic", system-ui, sans-serif'
              />
            </label>
            <label>
              <span>Display / Headings</span>
              <input
                type="text"
                value={customFont.display}
                onInput={(e) => updateCustomFont('display', (e.target as HTMLInputElement).value)}
                placeholder='"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif'
              />
            </label>
            <label>
              <span>Reading / Long-form</span>
              <input
                type="text"
                value={customFont.reading}
                onInput={(e) => updateCustomFont('reading', (e.target as HTMLInputElement).value)}
                placeholder='"IBM Plex Serif", "Literata", "Noto Naskh Arabic", Georgia, serif'
              />
            </label>
            <label>
              <span>Code / Data</span>
              <input
                type="text"
                value={customFont.mono}
                onInput={(e) => updateCustomFont('mono', (e.target as HTMLInputElement).value)}
                placeholder='"IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace'
              />
            </label>
          </div>
          <p class="custom-font-hint">Try: Inter, Plus Jakarta Sans, Newsreader, Literata, JetBrains Mono, Fira Code, IBM Plex Sans Arabic, Noto Sans Arabic, Noto Naskh Arabic.</p>
          <div class="custom-font-actions">
            <button
              type="button"
              class="btn-secondary"
              onClick={() => {
                setCustomFont(DEFAULT_CUSTOM_FONT)
                applyFont('custom', DEFAULT_CUSTOM_FONT)
                persist('appearance', { theme, density, custom_palette: customPalette, font: 'custom', custom_font: DEFAULT_CUSTOM_FONT })
              }}
            >
              Reset font stacks
            </button>
          </div>
        </div>
      )}
      </div>
    </details>

    <details class="typography-controls-section preference-disclosure" id="type-controls">
      <summary><span class="preference-summary-type" aria-hidden="true">Tt</span><span><strong>Detailed typography</strong><small>{effectiveBaseSize}px body · {typography.lineHeight} line height · {typography.readingMeasure}ch measure</small></span><em>Fine-tune</em></summary>
      <div class="preference-disclosure-body">
      <div class="section-head"><div><span class="preference-section-number">05 · Type tuning</span><h2>Adjust reading rhythm</h2><p class="section-description">Fine-tune scale, weight, rhythm, and line length across the entire studio.</p><p class="type-responsive-note"><strong>{effectiveBaseSize}px effective body size</strong> · {viewportBoost ? `wide-screen comfort adds ${viewportBoost}% at ${viewportWidth}px` : 'mobile and standard desktop use your selected size'} · reading measure stays {typography.readingMeasure}ch</p></div><button type="button" class="btn-secondary" onClick={resetTypography}>Reset type</button></div>
      <div class="typography-layout">
        <div class="typography-controls">
          {TYPOGRAPHY_CONTROLS.map(({ key, label, description, step, suffix }) => {
            const value = typography[key]
            const { min, max } = TYPOGRAPHY_LIMITS[key]
            return <label class="type-range" key={key}><span class="type-range-label"><strong>{label}</strong><output>{value}{suffix}</output></span><small>{description}</small><input type="range" min={min} max={max} step={step} value={value} onInput={(event) => updateTypography(key, Number((event.target as HTMLInputElement).value))} /></label>
          })}
        </div>
        <div class="typography-preview" style={{ fontFamily: 'var(--font-reading)', fontSize: `calc(${typography.baseSize * typography.displayScale}px * var(--font-viewport-scale, 1))`, lineHeight: typography.lineHeight, maxWidth: `${typography.readingMeasure}ch` }}>
          <span class="typography-preview-kicker">Live specimen · display + reading + arabic + mono</span>
          <h3>Ideas become useful when they survive contact with practice.</h3>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: `calc(${typography.baseSize}px * var(--font-viewport-scale, 1))`, fontWeight: typography.bodyWeight, letterSpacing: `${typography.letterSpacing}em` }}>A calmer type system makes the next decision easier to see. Adjust weight, rhythm, and measure until the page feels effortless to scan and comfortable to stay in.</p>
          <p dir="rtl" style={{ fontFamily: 'var(--font-reading), "Noto Naskh Arabic", "IBM Plex Sans Arabic", serif', fontSize: `calc(${typography.baseSize * 1.05}px * var(--font-viewport-scale, 1))`, lineHeight: typography.lineHeight, margin: '4px 0 0' }}>العلم النافع يبني العقل ويُهذب السلوك · رحلة التعلّم المستمر والبحث عن الحق</p>
          <code style={{ fontFamily: 'var(--font-mono)' }}>retain → apply → remember · {effectiveBaseSize}px · {typography.lineHeight} rhythm</code>
        </div>
      </div>
      </div>
    </details>

    <section class="preference-panel learning-preferences" id="learning-preferences" aria-labelledby="learning-preferences-title">
      <div class="section-head"><div><span class="preference-section-number">06 · Learning behavior</span><h2 id="learning-preferences-title">Choose what happens automatically</h2><p class="section-description">Keep the learning loop deliberate while deciding which routine steps Learning Compass can prepare for you.</p></div></div>
      <div class="preference-learning-grid">
      <article class="preference-setting-group"><div class="preference-group-heading"><span>Review</span><h3>Recall & Queue</h3><p>Set the review target without changing the five-item commitment limit.</p></div>
      <div class="setting-row">
        <div>
          <strong>Recall retention target</strong>
          <span>Target used when scheduling approved recall cards.</span>
        </div>
        <select aria-label="Recall retention target" value={retention} onChange={(event) => saveLearning(Number((event.target as HTMLSelectElement).value))}>
          <option value="85">85%</option>
          <option value="90">90%</option>
          <option value="95">95%</option>
        </select>
      </div>
      <div class="setting-row">
        <div>
          <strong>Queue capacity</strong>
          <span>The active source shelf remains deliberately bounded.</span>
        </div>
        <span class="setting-value">5 items</span>
      </div>
      <div class="setting-row"><div><strong>Draft policy</strong><span>Rating never creates cards. The extractor may return zero to four Unit-linked drafts, or explain why none are useful.</span></div><span class="setting-value">Source note v2</span></div>
      <div class="setting-row"><div><strong>Default effort</strong><span>Used only as your explicit saved delivery context.</span></div><select aria-label="Default delivery effort" value={deliveryEffort} onChange={(event) => saveDelivery({ effort: (event.currentTarget as HTMLSelectElement).value as any })}><option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep</option></select></div>
      <div class="setting-row"><div><strong>Default language</strong><span>No language is inferred from activity.</span></div><select aria-label="Default delivery language" value={deliveryLanguage} onChange={(event) => saveDelivery({ language: (event.currentTarget as HTMLSelectElement).value as any })}><option value="any">Any</option><option value="en">English</option><option value="ar">Arabic</option></select></div>
      <div class="setting-row"><div><strong>Depth</strong><span>Adaptive is an advisory derived from direct lesson completions and depth feedback; it never changes progress.</span></div><select aria-label="Default depth tier" value={depthTier} onChange={(event) => saveDelivery({ depth_tier: (event.currentTarget as HTMLSelectElement).value as any })}><option value="adaptive">Adaptive</option><option value="introductory">Introductory</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
      <div class="setting-row"><div><strong>Delivery modes</strong><span>Leave all unchecked to accept any mode.</span></div><span>{(['read', 'watch', 'listen', 'practice'] as const).map((mode) => <label key={mode}><input type="checkbox" checked={deliveryModes.includes(mode)} onChange={(event) => saveDelivery({ delivery_modes: (event.currentTarget as HTMLInputElement).checked ? [...deliveryModes, mode] : deliveryModes.filter((item) => item !== mode) })} /> {labelize(mode)}</label>)}</span></div>
    </article>

    <article class="preference-setting-group"><div class="preference-group-heading"><span>Curation</span><h3>Capture & profile</h3><p>Choose where the system may prepare context or apply strong evidence.</p></div>
      <PreferenceToggle label="Enrich new captures" description="Let the capture workflow add source metadata before triage." checked={enrichCapture} onChange={(value) => { setEnrichCapture(value); persist('ai_curation', { enrich_capture: value }) }} />
      <div class="setting-row">
        <div>
          <strong>Profile learning</strong>
          <span>How strong evidence is applied to your typed profile.</span>
        </div>
        <select aria-label="Profile learning" value={profileMode} onChange={(event) => { const value = (event.target as HTMLSelectElement).value; setProfileMode(value); persist('profile_automation', { mode: value, policy_version: 'profile_v2' }) }}>
          <option value="automatic">Automatic when evidence is strong</option>
          <option value="manual">Always ask first</option>
        </select>
      </div>
      <div class="setting-row">
        <div>
          <strong>Recommendation engine</strong>
          <span>The active serving mode selected by the recommendation system.</span>
        </div>
        <span class="setting-value">{labelize(engineMode)}</span>
      </div>
      <PreferenceToggle label="Prepare notes after retain or apply" description="Eligible completion feedback can start structured extraction; your reflection is never rewritten." checked={autoExtract} onChange={(value) => saveSrs({ auto_extract: value })} />
    </article>

      <NotificationSettings />
      </div>
    </section>

    <details class="preference-disclosure atlas-preferences" id="atlas-preferences">
      <summary><span class="preference-summary-map" aria-hidden="true">Map</span><span><strong>Map display</strong><small>Labels, links, arrows, and constellation forces</small></span><em>Advanced</em></summary>
      <div class="preference-disclosure-body">
      <div class="section-head">
        <div><span class="preference-section-number">07 · Map display</span><h2>Shape the Atlas</h2><p class="section-description">Tune how the knowledge map reads and moves. These controls affect Map only.</p></div>
      </div>
      <div class="atlas-preference-grid"><PreferenceToggle label="Show arrows" description="Draw direction arrows on relationship links." checked={arrows} onChange={(value) => { setArrows(value); saveAtlas({ arrows: value }) }} />
      <PreferenceToggle label="Animate Map transitions" description="Smooth camera moves, expansions, and constellation drags." checked={atlasAnimate} onChange={(value) => { setAtlasAnimate(value); saveAtlas({ animate: value }) }} />
      <label class="type-range"><span class="type-range-label"><strong>Text fade threshold</strong><output>{textFade.toFixed(2)}</output></span><small>Labels fade out as you zoom past this point (log scale).</small><input type="range" min={-1} max={1} step={0.05} value={textFade} onInput={(event) => { const v = Number((event.target as HTMLInputElement).value); setTextFade(v); saveAtlas({ text_fade_threshold: v }) }} /></label>
      <label class="type-range"><span class="type-range-label"><strong>Node size</strong><output>{atlasNodeSize.toFixed(2)}×</output></span><small>Scale every node on the map.</small><input type="range" min={0.1} max={3} step={0.02} value={atlasNodeSize} onInput={(event) => { const v = Number((event.target as HTMLInputElement).value); setAtlasNodeSize(v); saveAtlas({ node_size: v }) }} /></label>
      <label class="type-range"><span class="type-range-label"><strong>Link thickness</strong><output>{linkThickness.toFixed(2)}×</output></span><small>Weight of relationship lines.</small><input type="range" min={0.1} max={6} step={0.05} value={linkThickness} onInput={(event) => { const v = Number((event.target as HTMLInputElement).value); setLinkThickness(v); saveAtlas({ link_thickness: v }) }} /></label>
      <label class="type-range"><span class="type-range-label"><strong>Branch links</strong><output>{branchLinkThickness.toFixed(2)}×</output></span><small>Thickness of lines from a branch to its child nodes.</small><input type="range" min={0.1} max={6} step={0.05} value={branchLinkThickness} onInput={(event) => { const v = Number((event.target as HTMLInputElement).value); setBranchLinkThickness(v); saveAtlas({ branch_link_thickness: v }) }} /></label>
      </div><div class="section-head atlas-force-heading"><h3>Constellation forces</h3><span>How clusters spread and hold together</span></div><div class="atlas-preference-grid">
      <label class="type-range"><span class="type-range-label"><strong>Center force</strong><output>{centerForce.toFixed(2)}</output></span><small>Pull of cluster islands toward the canvas center.</small><input type="range" min={0} max={2} step={0.01} value={centerForce} onInput={(event) => { const v = Number((event.target as HTMLInputElement).value); setCenterForce(v); saveAtlas({ center_force: v }) }} /></label>
      <label class="type-range"><span class="type-range-label"><strong>Repel force</strong><output>{repelForce.toFixed(2)}</output></span><small>How strongly nodes push apart to avoid overlap.</small><input type="range" min={0} max={50} step={0.5} value={repelForce} onInput={(event) => { const v = Number((event.target as HTMLInputElement).value); setRepelForce(v); saveAtlas({ repel_force: v }) }} /></label>
      <label class="type-range"><span class="type-range-label"><strong>Link force</strong><output>{linkForce.toFixed(2)}</output></span><small>Length of the links that connect related nodes.</small><input type="range" min={0} max={3} step={0.05} value={linkForce} onInput={(event) => { const v = Number((event.target as HTMLInputElement).value); setLinkForce(v); saveAtlas({ link_force: v }) }} /></label>
      </div></div>
    </details>

      </div>
    </div>
  </div>
}

function OfflineQueue() {
  const [items, setItems] = useState<any[]>([])
  const [working, setWorking] = useState(false)
  const [status, setStatus] = useState('')
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const refresh = () => listOfflineMutations().then(setItems)

  useEffect(() => {
    refresh()
    const handleStatus = () => {
      setOnline(navigator.onLine)
      refresh()
    }
    window.addEventListener('online', handleStatus)
    window.addEventListener('offline', handleStatus)
    return () => {
      window.removeEventListener('online', handleStatus)
      window.removeEventListener('offline', handleStatus)
    }
  }, [])

  const sync = async () => {
    setWorking(true)
    setStatus('Syncing queued changes…')
    try {
      await flushOfflineMutations()
      await refresh()
      setStatus('Sync complete.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Sync could not complete.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section>
      <div class="section-head">
        <h2>Offline changes</h2>
        <span>{items.length ? `${items.length} waiting` : 'No pending local changes'}</span>
      </div>
      {items.length ? (
        <div class="offline-mutation-list">
          {items.map((item) => (
            <article class="offline-mutation" key={item.id}>
              <div>
                <strong>{labelize(item.state || 'pending')}</strong>
                <small>
                  {item.method} {item.url} · {item.error || 'Waiting to sync'}
                </small>
              </div>
              <div class="row-actions">
                {['failed', 'conflict'].includes(item.state) && (
                  <button type="button" class="button secondary" onClick={() => resolveOfflineMutation(item.id, 'retry').then(refresh)}>
                    Retry
                  </button>
                )}
                <button type="button" class="button secondary" onClick={() => resolveOfflineMutation(item.id, 'discard').then(refresh)}>
                  Discard
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Everything is synced"
          body="Offline mutations are recoverable in this browser and will remain visible here until they succeed or you discard them."
        />
      )}
      {(items.length > 0 || !online) && (
        <div class="row-actions">
          <button type="button" class="button primary" disabled={working || !online} onClick={sync}>
            {working ? 'Syncing…' : 'Sync now'}
          </button>
          {!online && <span class="status">Browser is offline</span>}
        </div>
      )}
      {status && <output class="settings-status" aria-live="polite">{status}</output>}
    </section>
  )
}

function DataView({ onCapture }: { onCapture?: () => void }) {
  const system = useData<SystemPayload>('/agent/system')
  const [downloading, setDownloading] = useState('')

  if (system.loading) return <Loading label="Checking data ownership" />
  if (system.error) return <ErrorState message={system.error} retry={system.reload} />

  const triggerExport = async (url: string, filename: string) => {
    try {
      setDownloading(filename)
      const res = await authFetch(url)
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    } finally {
      setDownloading('')
    }
  }

  const quality = system.data?.data_quality
  const qualityTrusted = quality?.status === 'trusted'

  return (
    <div class="settings-page data-settings-page">
      <section class="settings-intro">
        <span class="eyebrow">Settings / Data & recovery</span>
        <h1>Shape, inspect, and recover your data</h1>
        <p>Manage the records that help Learning Compass understand you, then verify their quality, portability, and recovery.</p>
      </section>
      <PersonalDataStudio onCapture={onCapture} />
      <OfflineQueue />
      <section class="data-trust-panel" aria-labelledby="data-trust-title">
        <div class="section-head">
          <div>
            <span class="eyebrow">Data contracts</span>
            <h2 id="data-trust-title">Can this learning record be trusted?</h2>
          </div>
          <span class={`data-trust-state ${qualityTrusted ? 'is-trusted' : 'is-warning'}`}>{qualityTrusted ? 'Trusted' : 'Needs attention'}</span>
        </div>
        {quality?.checks?.length ? <>
          <div class="data-trust-summary">
            <strong>{Number(quality.summary?.passing || 0)} / {Number(quality.summary?.total || quality.checks.length)}</strong>
            <span>contracts passing across {Number(quality.counts?.active_sources || 0)} active sources, {Number(quality.counts?.learning_events || 0)} learning events, and {Number(quality.counts?.enabled_feeds || 0)} feeds.</span>
          </div>
          <div class="data-trust-grid">
            {quality.checks.map((item) => <article class={`data-trust-check ${item.status === 'passing' ? 'is-passing' : 'is-failing'}`} key={item.id}>
              <div><span>{labelize(item.dimension)}</span><strong>{item.label}</strong></div>
              <em>{item.status === 'passing' ? 'Pass' : `${item.affected} affected`}</em>
              <p>{item.message}</p>
              <small>{item.coverage_percent}% coverage · {item.total} checked</small>
            </article>)}
          </div>
          <p class="settings-help">These are explicit completeness, validity, uniqueness, and lineage checks—not an opaque engagement score. Last checked {formatDate(quality.checked_at)}.</p>
        </> : <Empty title="Data contracts unavailable" body="The runtime inventory did not return a data-quality report. Refresh status before relying on this record." />}
      </section>
      <section>
        <div class="section-head">
          <h2>Portable library exports</h2>
          <span>Personal records and source history—not a full-system backup</span>
        </div>
        <div class="setting-row">
          <div>
            <strong>Personal and source library JSON</strong>
            <span>Download typed media status, progress, ratings, tags, personal notes, branch context, and recommendation history. Notes, Threads, recall, settings, and R2 files are not included.</span>
          </div>
          <button
            type="button"
            class="button secondary"
            disabled={Boolean(downloading)}
            onClick={() => triggerExport('/recommendations/export?format=json&limit=5000', 'learning-compass-data.json')}
          >
            {downloading.endsWith('.json') ? 'Exporting…' : 'Download JSON'}
          </button>
        </div>
        <div class="setting-row">
          <div>
            <strong>Personal and source library Markdown</strong>
            <span>Download a readable ledger with type, status, progress, rating, branch, link, and personal note.</span>
          </div>
          <button
            type="button"
            class="button secondary"
            disabled={Boolean(downloading)}
            onClick={() => triggerExport('/recommendations/export?format=md&limit=5000', 'learning-compass-data.md')}
          >
            {downloading.endsWith('.md') ? 'Exporting…' : 'Download Markdown'}
          </button>
        </div>
        <div class="setting-row">
          <div>
            <strong>Advanced API specification</strong>
            <span>Machine-readable inventory for the allow-listed product surface.</span>
          </div>
          <a class="button secondary" href="/agent/openapi.json" target="_blank" rel="noreferrer">
            Open specification
          </a>
        </div>
      </section>
      <section class="recovery-status-panel">
        <div class="section-head">
          <h2>Full-system recovery</h2>
          <span>{system.data?.recovery?.ok ? 'Verified' : 'Needs attention'}</span>
        </div>
        {system.data?.recovery?.latest ? <div class="setting-row">
          <div>
            <strong>Daily D1 + R2 snapshot</strong>
            <span>Latest disposable restore rehearsal {formatDate(system.data.recovery.latest.restore_rehearsed_at || system.data.recovery.latest.created_at)} · {Number(system.data.recovery.latest.artifact_count || 0)} artifacts verified.</span>
          </div>
          <span class={`setting-value ${system.data.recovery.ok ? 'is-active' : ''}`}>{system.data.recovery.ok ? 'Current' : 'Stale'}</span>
        </div> : <Empty title="No verified full backup" body="Run the production backup and restore rehearsal before relying on recovery." />}
        <p class="settings-help">The operator snapshot includes canonical D1 state and every R2 object, verifies checksums, restores into a disposable database, and is retained outside this repository.</p>
      </section>
      <section>
        <div class="section-head">
          <h2>Where your data lives</h2>
          <span>{system.data?.timezone || 'Africa/Cairo'}</span>
        </div>
        <div class="system-storage">
          {(system.data?.storage || []).map((item) => (
            <article key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.purpose}</span>
              </div>
              <em>{labelize(item.status)}</em>
            </article>
          ))}
        </div>
        <div class="system-counts">
          {Object.entries(system.data?.counts || {}).map(([key, value]) => (
            <span key={key}>
              <strong>{String(value)}</strong>
              {labelize(key)}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}

function capabilityArea(path: string) {
  if (/^\/(capture|recommendations|compass|discovery)/.test(path)) return 'Capture & curation'
  if (/^\/(learning|sessions|srs|notes|feedback)/.test(path)) return 'Learning loop'
  if (/^\/(brain|knowledge|taste)/.test(path)) return 'Knowledge & profile'
  if (/^\/(artifacts|notebooklm)/.test(path)) return 'Files & NotebookLM'
  if (/^\/(analytics)/.test(path)) return 'Intelligence & analytics'
  if (/^\/(notifications)/.test(path)) return 'Delivery & reminders'
  return 'Platform & system'
}

function SystemView() {
  const capabilities = useData<{ capabilities?: Capability[]; authentication?: string }>('/agent/capabilities?view=summary')
  const system = useData<SystemPayload>('/agent/system')
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('ALL')
  if (capabilities.loading || system.loading) return <Loading label="Reading the system inventory" />
  if (capabilities.error || system.error) return <ErrorState message={capabilities.error || system.error} retry={() => { capabilities.reload(); system.reload() }} />
  const operations = capabilities.data?.capabilities || []
  const filtered = operations.filter((item) => (method === 'ALL' || item.method === method) && `${item.method} ${item.path} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const grouped = filtered.reduce<Record<string, Capability[]>>((result, item) => { const area = capabilityArea(item.path); result[area] = [...(result[area] || []), item]; return result }, {})
  const writes = operations.filter((item) => item.method !== 'GET').length
  return <div class="system-console settings-system-page"><section class="system-hero"><div><span class="eyebrow">Settings / System</span><h1>System status and advanced operations</h1><p>Check the health of Learning Compass, review Hermes activity, and inspect the allow-listed operations available to the product.</p></div><div class="system-hero-actions"><a href="/agent/openapi.json" target="_blank" rel="noreferrer">Open API specification ↗</a><button type="button" onClick={() => { capabilities.reload(); system.reload() }}>Refresh status</button></div></section><OperationalHealthPanel /><HermesActivityPanel /><div class="system-summary"><div><strong>{operations.length}</strong><span>API operations</span></div><div><strong>{operations.length - writes}</strong><span>Read operations</span></div><div><strong>{writes}</strong><span>Guarded writes</span></div><div><strong>{system.data?.schedule?.length || 0}</strong><span>Configured schedules</span></div></div><section><div class="section-head"><h2>Runtime and storage</h2><span>{system.data?.status || 'unknown'}</span></div><div class="system-health-grid"><article><i class="healthy" /><span><strong>{system.data?.service || 'Learning Compass Worker'}</strong><small>{system.data?.environment || 'Runtime available'}</small></span></article>{(system.data?.storage || []).map((item) => <article key={item.name}><i class={/connected|managed|active/i.test(item.status) ? 'healthy' : 'warning'} /><span><strong>{item.name}</strong><small>{labelize(item.status)}</small></span></article>)}</div></section><div class="system-two-column"><section><div class="section-head"><h2>Schedules</h2><span>{system.data?.schedule?.length || 0} configured</span></div><div class="schedule-list">{(system.data?.schedule || []).length ? system.data!.schedule!.map((item) => <article key={item.id}><div class="schedule-head"><span class="method-badge method-post">CRON</span><div><strong>{item.cadence}</strong><code>{item.cron} · {item.timezone}</code></div></div><ul>{(item.responsibilities || []).map((responsibility) => <li key={responsibility}>{responsibility}</li>)}</ul><small>Last success {item.last_success ? formatDate(item.last_success) : 'not recorded'} · search {item.last_search_sync ? formatDate(item.last_search_sync) : 'not recorded'}</small></article>) : <Empty title="No schedules configured" body="Maintenance remains on-demand until a schedule is explicitly configured." />}</div></section><section><div class="section-head"><h2>On demand only</h2><span>{system.data?.on_demand_only?.length || 0} workflows</span></div><div class="on-demand-list">{(system.data?.on_demand_only || []).map((item) => <div key={item}><i /><span>{item}</span></div>)}</div></section></div><section><div class="section-head"><h2>Advanced API operations</h2><span>{filtered.length} of {operations.length}</span></div><div class="api-catalog-head"><div class="api-filters"><label>Search path or capability<input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="e.g. profile, export, notes" /></label><label>Method<select value={method} onChange={(event) => setMethod((event.target as HTMLSelectElement).value)}><option value="ALL">All methods</option>{[...new Set(operations.map((item) => item.method))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div></div>{filtered.length ? <div class="api-groups">{(Object.entries(grouped) as Array<[string, Capability[]]>).map(([area, items]) => <section key={area}><div class="api-group-title"><h3>{area}</h3><span>{items.length}</span></div><div class="api-operation-list">{items.map((item) => <article key={`${item.method}:${item.path}`}><span class={`method-badge method-${item.method.toLowerCase()}`}>{item.method}</span><code>{item.path}</code><p>{item.description}</p><small>{item.method === 'GET' ? 'Read only' : 'Validated · audit logged'}</small></article>)}</div></section>)}</div> : <Empty title="No operations match" body="Try a broader search or reset the method filter." action={<button type="button" class="button secondary" onClick={() => { setQuery(''); setMethod('ALL') }}>Clear filters</button>} />}</section><section class="system-safety"><div class="section-head"><h2>Safety boundaries</h2><span>{capabilities.data?.authentication || 'Product validation remains active'}</span></div>{(system.data?.safety || []).map((item) => <span key={item}>{item}</span>)}</section></div>
}

export function SettingsWorkspace({ route, view, onRouteChange, onCapture }: SettingsWorkspaceProps) {
  const routed = useRoute()
  const query = route?.query || routed.query
  const requestedMode = route?.mode || routed.mode || query.get('mode') || route?.view || route?.slug || view || routed.view
  const requestedFocus = route?.focus || routed.focus || query.get('focus') || ''
  const activeMode: SettingsMode = requestedMode === 'data' ? 'data' : requestedMode === 'system' ? 'system' : 'personal'
  const activeFocus: SettingsFocus = requestedFocus === 'preferences' || requestedMode === 'preferences' ? 'preferences' : 'profile'
  const activeView = normalizeView(activeMode === 'personal' ? activeFocus : activeMode)
  return <div class="settings-workspace workspace-surface"><SettingsModeSwitcher active={activeMode} focus={activeFocus} onRouteChange={onRouteChange} />{activeView === 'profile' && <ProfileView />}{activeView === 'preferences' && <PreferencesView />}{activeView === 'data' && <DataView onCapture={onCapture} />}{activeView === 'system' && <SystemView />}</div>
}

export default SettingsWorkspace
