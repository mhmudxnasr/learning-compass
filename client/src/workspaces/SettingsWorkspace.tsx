import { useEffect, useMemo, useState } from 'preact/hooks'
import { api, flushOfflineMutations, formatDate, labelize, listOfflineMutations, resolveOfflineMutation } from '../api'
import { ErrorState, Empty, Loading } from '../components/States'
import { useData } from '../app/useData'

export type SettingsView = 'profile' | 'preferences' | 'data' | 'system'

export type SettingsWorkspaceRoute = {
  view: SettingsView
}

export type SettingsRouteInput = Partial<SettingsWorkspaceRoute> & {
  slug?: string
  view?: string
}

export type SettingsWorkspaceProps = {
  route?: SettingsRouteInput
  view?: SettingsView
  onRouteChange?: (route: SettingsWorkspaceRoute) => void
}

type ProfileRecord = Record<string, any>

type SettingsPayload = {
  settings?: Record<string, any>
  resolved?: {
    appearance?: { theme?: string; density?: string }
    learning?: { retention?: number; queue_cap?: number }
    srs_drafts?: { enabled?: boolean; minimum_rating?: number; auto_extract?: boolean }
    ai_curation?: { enrich_capture?: boolean }
    profile_automation?: { mode?: string }
    recommendation_engine?: { mode?: string }
  }
}

type SystemPayload = {
  status?: string
  service?: string
  environment?: string
  timezone?: string
  storage?: Array<{ name: string; purpose: string; status: string }>
  schedule?: Array<{ id: string; cron: string; cadence: string; timezone: string; responsibilities?: string[]; last_search_sync?: string | null }>
  on_demand_only?: string[]
  counts?: Record<string, number>
  safety?: string[]
}

type Capability = { method: string; path: string; description: string }

const settingsViews: Array<{ key: SettingsView; label: string; description: string }> = [
  { key: 'profile', label: 'Profile', description: 'Your priorities, evidence, and learned patterns.' },
  { key: 'preferences', label: 'Preferences', description: 'Learning defaults and curation behavior.' },
  { key: 'data', label: 'Data & sync', description: 'Exports, storage ownership, and offline work.' },
  { key: 'system', label: 'System', description: 'The complete observable operation inventory.' },
]

const profileFields = [
  { key: 'identity', apiKey: 'identity', label: 'Identity & context', description: 'Background and learning context.', structured: true },
  { key: 'mega_priority', apiKey: 'mega_priority', label: 'Mega priority', description: 'The highest-level focus areas.', structured: true },
  { key: 'core_filter', apiKey: 'core_filter', label: 'Core curation filter', description: 'Criteria required for new content.', structured: false },
  { key: 'reaction_style_json', apiKey: 'reaction_style_json', label: 'Reaction style', description: 'How feedback should be interpreted.', structured: true },
  { key: 'quality_rules_json', apiKey: 'quality_rules_json', label: 'Quality & verification', description: 'Source verification and content boundaries.', structured: true },
  { key: 'operational_style_json', apiKey: 'operational_style_json', label: 'Operational style', description: 'How Hermes should work with you.', structured: true },
  { key: 'patterns_summary_json', apiKey: 'patterns_summary_json', label: 'Pattern summary', description: 'Recurring learning patterns.', structured: true },
  { key: 'recent_signal', apiKey: 'recent_signal', label: 'Recent signal', description: 'The latest approved learning signal.', structured: false },
] as const

function normalizeView(value: string | undefined, fallback: SettingsView = 'profile'): SettingsView {
  if (value === 'profile' || value === 'preferences' || value === 'data' || value === 'system') return value
  return fallback
}

function routeFor(view: SettingsView) {
  return view === 'profile' ? '#/settings' : `#/settings/${view}`
}

function SettingsNav({ active, onRouteChange }: { active: SettingsView; onRouteChange?: (route: SettingsWorkspaceRoute) => void }) {
  return (
    <nav class="workspace-local-nav settings-local-nav" aria-label="Settings views">
      {settingsViews.map((item) => (
        <a
          key={item.key}
          href={routeFor(item.key)}
          class={active === item.key ? 'active' : ''}
          aria-current={active === item.key ? 'page' : undefined}
          onClick={(event) => {
            if (!onRouteChange) return
            event.preventDefault()
            onRouteChange({ view: item.key })
          }}
        >
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </a>
      ))}
    </nav>
  )
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

function ProfileFieldList({ profile }: { profile: ProfileRecord }) {
  return <section class="profile-section profile-fields-section"><div class="section-head"><h2>Profile fields</h2><span>Canonical profile inputs</span></div><div class="profile-fields">{profileFields.map((field) => {
    const value = profile[field.apiKey]
    const parsed = field.structured && typeof value === 'string' ? (() => { try { return { value: JSON.parse(value), valid: true } } catch { return { value: null, valid: false } } })() : { value, valid: true }
    return <article class="profile-field" key={field.key}><div class="profile-field-head"><span><strong>{field.label}</strong><small>{field.description}</small></span></div>{parsed.valid ? <ReadableValue value={parsed.value} /> : <p class="profile-empty">Needs review in the profile editor.</p>}</article>
  })}</div></section>
}

function ProfileRecordList({ items, empty, title, getTitle, getMeta }: { items: any[]; empty: string; title: string; getTitle: (item: any) => string; getMeta: (item: any) => string }) {
  return <section class="profile-record-section"><div class="section-head"><h2>{title}</h2><span>{items.length} recorded</span></div>{items.length ? <div class="profile-record-list">{items.slice(0, 24).map((item, index) => <article class="profile-record" key={String(item.id || item.label || item.name || index)}><div class="profile-record-title"><strong>{getTitle(item)}</strong><small>{getMeta(item)}</small></div><p>{readableText(item.description || item.reason || item.why || item.topic || item.notes || '')}</p></article>)}</div> : <p class="profile-empty">{empty}</p>}</section>
}

function ProfileEditor({ profile, onSaved }: { profile: ProfileRecord; onSaved: () => void }) {
  const initial = useMemo(() => Object.fromEntries(profileFields.map((field) => [field.key, typeof profile[field.apiKey] === 'string' ? profile[field.apiKey] : readableText(profile[field.apiKey])])), [profile])
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
  return <details class="profile-editor" open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}><summary>Edit profile fields</summary><p>Structured values are saved as profile fields and rendered as readable text and tags above. Malformed legacy values stay editable without being exposed as raw JSON.</p>{open && <><div class="profile-editor-fields">{profileFields.map((field) => <label key={field.key}>{field.label}<span>{field.description}</span><textarea value={draft[field.key] || ''} onInput={(event) => setDraft((current) => ({ ...current, [field.key]: (event.target as HTMLTextAreaElement).value }))} /></label>)}</div><div class="row-actions"><button class="button secondary" onClick={() => setDraft(initial)}>Reset</button><button class="button primary" onClick={save}>Save profile</button></div>{status && <output class="settings-status">{status}</output>}</>}</details>
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
    <section class="model-header"><div class="model-header-main"><div class="model-identity"><span class="model-avatar" aria-hidden="true">{String(person.name || 'L').slice(0, 1).toUpperCase()}</span><div class="model-identity-copy"><span class="eyebrow">Settings / Profile</span><h1>{person.name || 'Your learning profile'}</h1><p class="model-context">{context === 'Not recorded' ? 'Your evidence-backed learning model will take shape as you capture, consume, and reflect.' : context}</p></div></div><span class="model-synced">Model {data.model_version || 'profile_v2'}</span></div></section>
    <div class="profile-health-strip"><div><strong>{labelize(health.status || 'unknown')}</strong><span>model health</span></div><div><strong>{health.active || assertions.length || 0}</strong><span>active assertions</span></div><div><strong>{health.hypotheses || 0}</strong><span>hypotheses</span></div><div><strong>{data.infrastructure_stats?.pending_proposals_count || 0}</strong><span>pending changes</span></div></div>
    <section class="profile-section"><div class="section-head"><h2>Adaptive model</h2><span>{assertions.length} typed signals</span></div>{assertions.length ? <div class="profile-assertion-list">{assertions.slice(0, 24).map((assertion: any) => <article key={assertion.id || assertion.assertion_key}><div class="profile-assertion-head"><div><span class="meta">{labelize(assertion.category || 'profile')} · {labelize(assertion.source_kind || 'recorded')}</span><strong>{labelize(assertion.assertion_key || 'Assertion')}</strong></div><span class={`state state-${assertion.status || 'active'}`}>{labelize(assertion.status || 'active')}</span></div><ReadableValue value={assertion.value} compact /><small>Confidence {Math.round(Number(assertion.confidence || 0) * 100)}% · version {assertion.version || 1}</small></article>)}</div> : <Empty title="No typed assertions yet" body="Your compatibility profile remains available below. New evidence-backed signals will appear here." />}</section>
    <ProfileFieldList profile={person} />
    <ProfileEditor profile={person} onSaved={profile.reload} />
    <div class="profile-record-columns">
      <ProfileRecordList title="Priorities" items={data.priorities || []} empty="No priorities recorded." getTitle={(item) => item.label || item.branch_id || 'Priority'} getMeta={(item) => item.rank ? `Rank ${item.rank}` : ''} />
      <ProfileRecordList title="Mastered knowledge" items={data.mastered || []} empty="No mastered topics recorded." getTitle={(item) => item.label || item.name || item.id || 'Mastered topic'} getMeta={(item) => item.kind || ''} />
      <ProfileRecordList title="Exclusions" items={data.blacklist || []} empty="No exclusions recorded." getTitle={(item) => [item.name, item.work].filter(Boolean).join(' · ') || 'Exclusion'} getMeta={(item) => item.severity == null ? '' : `Severity ${item.severity}`} />
      <ProfileRecordList title="Learned patterns" items={data.patterns || []} empty="No patterns recorded." getTitle={(item) => item.description || item.id || 'Pattern'} getMeta={(item) => item.strength || ''} />
      <ProfileRecordList title="Taste affinities" items={data.taste_vectors || []} empty="No taste affinities recorded." getTitle={(item) => item.topic || 'Topic'} getMeta={(item) => `${item.consumption_count || 0} completed`} />
      <ProfileRecordList title="Creator history" items={data.creator_trust || []} empty="No creator history available." getTitle={(item) => item.creator || 'Creator'} getMeta={(item) => `${item.total || 0} consumed · ${item.average_score || '—'} avg`} />
      <ProfileRecordList title="Recent reflections" items={data.reflections || []} empty="No written reflections recorded." getTitle={(item) => item.video_title || 'Reflection'} getMeta={(item) => item.completed_at ? formatDate(item.completed_at) : ''} />
      <ProfileRecordList title="Recent ratings" items={data.rating_history || []} empty="No ratings recorded." getTitle={(item) => item.video_title || 'Rated source'} getMeta={(item) => item.user_score == null ? item.user_rating || '' : `${item.user_score}/10`} />
    </div>
  </div>
}

function PreferenceToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div class="setting-row"><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange((event.target as HTMLInputElement).checked)} aria-label={label} /></div>
}

function PreferencesView() {
  const settings = useData<SettingsPayload>('/settings')
  const [status, setStatus] = useState('')
  const [density, setDensity] = useState('balanced')
  const [retention, setRetention] = useState(90)
  const [enrichCapture, setEnrichCapture] = useState(false)
  const [srsEnabled, setSrsEnabled] = useState(true)
  const [autoExtract, setAutoExtract] = useState(false)
  const [profileMode, setProfileMode] = useState('automatic')
  const [engineMode, setEngineMode] = useState('shadow')
  const resolved = settings.data?.resolved
  useEffect(() => {
    if (!resolved) return
    setDensity(resolved.appearance?.density || 'balanced')
    setRetention(Number(resolved.learning?.retention || 90))
    setEnrichCapture(Boolean(resolved.ai_curation?.enrich_capture))
    setSrsEnabled(resolved.srs_drafts?.enabled !== false)
    setAutoExtract(Boolean(resolved.srs_drafts?.auto_extract))
    setProfileMode(resolved.profile_automation?.mode || 'automatic')
    setEngineMode(resolved.recommendation_engine?.mode || 'shadow')
    document.documentElement.dataset.density = resolved.appearance?.density || 'balanced'
  }, [resolved])
  if (settings.loading) return <Loading label="Reading preferences" />
  if (settings.error) return <ErrorState message={settings.error} retry={settings.reload} />
  const persist = async (key: string, value: unknown, after?: () => void) => {
    setStatus('Saving…')
    try { await api(`/settings/${key}`, { method: 'PUT', body: JSON.stringify(value) }); after?.(); setStatus('Saved'); window.setTimeout(() => setStatus(''), 1400) }
    catch (error: any) { setStatus(error?.message || 'Could not save this preference.') }
  }
  const saveAppearance = (value: string) => { setDensity(value); document.documentElement.dataset.density = value; persist('appearance', { theme: resolved?.appearance?.theme || 'system', density: value }) }
  const saveLearning = (value: number) => { setRetention(value); persist('learning', { retention: value, queue_cap: 5 }) }
  const saveSrs = (next: Partial<{ enabled: boolean; auto_extract: boolean }>) => { const current = { enabled: srsEnabled, minimum_rating: 7, auto_extract: autoExtract, ...next }; setSrsEnabled(current.enabled); setAutoExtract(current.auto_extract); persist('srs_drafts', current) }
  return <div class="settings-page"><section class="settings-intro"><span class="eyebrow">Settings / Preferences</span><h1>Make the learning loop fit you</h1><p>Preferences are stored in the canonical settings record and applied to future captures, queue decisions, profile learning, and recall.</p></section><section><div class="section-head"><h2>Interface</h2><span>Quiet, readable defaults</span></div><div class="setting-row"><div><strong>Reading density</strong><span>Choose the amount of information visible in each working surface.</span></div><select aria-label="Reading density" value={density} onChange={(event) => saveAppearance((event.target as HTMLSelectElement).value)}><option value="balanced">Balanced</option><option value="compact">Compact</option></select></div></section><section><div class="section-head"><h2>Learning defaults</h2><span>Queue stays capped at five</span></div><div class="setting-row"><div><strong>Recall retention target</strong><span>FSRS target used when scheduling approved recall cards.</span></div><select aria-label="Recall retention target" value={retention} onChange={(event) => saveLearning(Number((event.target as HTMLSelectElement).value))}><option value="85">85%</option><option value="90">90%</option><option value="95">95%</option></select></div><div class="setting-row"><div><strong>Queue capacity</strong><span>The active source shelf remains intentionally bounded.</span></div><span class="setting-value">5 items</span></div></section><section><div class="section-head"><h2>Curation & profile</h2><span>Explicit, reversible behavior</span></div><PreferenceToggle label="Enrich new captures" description="Let the capture workflow add source metadata before triage." checked={enrichCapture} onChange={(value) => { setEnrichCapture(value); persist('ai_curation', { enrich_capture: value }) }} /><div class="setting-row"><div><strong>Profile learning</strong><span>How strong evidence is applied to your typed profile.</span></div><select aria-label="Profile learning" value={profileMode} onChange={(event) => { const value = (event.target as HTMLSelectElement).value; setProfileMode(value); persist('profile_automation', { mode: value, policy_version: 'profile_v2' }) }}><option value="automatic">Automatic when evidence is strong</option><option value="manual">Always ask first</option></select></div><div class="setting-row"><div><strong>Recommendation engine</strong><span>Shadow keeps the newer scorer observable while evidence accumulates.</span></div><span class="setting-value">{labelize(engineMode)}</span></div></section><section><div class="section-head"><h2>Recall drafts</h2><span>Approval remains required before Review</span></div><PreferenceToggle label="Create recall drafts for high ratings" description="Ratings of 7–10 can create editable SRS drafts; approval is still explicit." checked={srsEnabled} onChange={(value) => saveSrs({ enabled: value })} /><PreferenceToggle label="Extract notes automatically after retain/apply" description="When enabled, eligible completion feedback can start the structured extraction workflow." checked={autoExtract} onChange={(value) => saveSrs({ auto_extract: value })} /><div class="setting-row"><div><strong>Minimum rating</strong><span>This product invariant is fixed so high-value feedback stays deliberate.</span></div><span class="setting-value">7 / 10</span></div></section>{status && <output class="settings-status">{status}</output>}</div>
}

function OfflineQueue() {
  const [items, setItems] = useState<any[]>([])
  const [working, setWorking] = useState(false)
  const [status, setStatus] = useState('')
  const refresh = () => listOfflineMutations().then(setItems)
  useEffect(() => { refresh(); const onOnline = () => refresh(); addEventListener('online', onOnline); return () => removeEventListener('online', onOnline) }, [])
  const sync = async () => { setWorking(true); setStatus('Syncing queued changes…'); try { await flushOfflineMutations(); await refresh(); setStatus('Sync complete.'); } catch (error: any) { setStatus(error?.message || 'Sync could not complete.') } finally { setWorking(false) } }
  return <section><div class="section-head"><h2>Offline changes</h2><span>{items.length ? `${items.length} waiting` : 'No pending local changes'}</span></div>{items.length ? <div class="offline-mutation-list">{items.map((item) => <article class="offline-mutation" key={item.id}><div><strong>{labelize(item.state || 'pending')}</strong><small>{item.method} {item.url} · {item.error || 'Waiting to sync'}</small></div><div class="row-actions">{['failed', 'conflict'].includes(item.state) && <button class="button secondary" onClick={() => resolveOfflineMutation(item.id, 'retry').then(refresh)}>Retry</button>}<button class="button secondary" onClick={() => resolveOfflineMutation(item.id, 'discard').then(refresh)}>Discard</button></div></article>)}</div> : <Empty title="Everything is synced" body="Offline mutations are recoverable in this browser and will remain visible here until they succeed or you discard them." />}{(items.length > 0 || !navigator.onLine) && <div class="row-actions"><button class="button primary" disabled={working || !navigator.onLine} onClick={sync}>{working ? 'Syncing…' : 'Sync now'}</button>{!navigator.onLine && <span class="status">Browser is offline</span>}</div>}{status && <output class="settings-status">{status}</output>}</section>
}

function DataView() {
  const system = useData<SystemPayload>('/agent/system')
  if (system.loading) return <Loading label="Checking data ownership" />
  if (system.error) return <ErrorState message={system.error} retry={system.reload} />
  return <div class="settings-page data-settings-page"><section class="settings-intro"><span class="eyebrow">Settings / Data & sync</span><h1>Your library, your files, your recovery path</h1><p>D1 is the canonical learning record. R2 holds larger companions. Browser storage only holds recoverable pending mutations.</p></section><OfflineQueue /><section><div class="section-head"><h2>Export</h2><span>Portable copies of your source record</span></div><div class="setting-row"><div><strong>Source library JSON</strong><span>Download recommendation history and metadata for backup or inspection.</span></div><a class="button secondary" href="/recommendations/export?format=json&limit=5000">Download JSON</a></div><div class="setting-row"><div><strong>Source library Markdown</strong><span>Download a readable ledger of your captured and consumed sources.</span></div><a class="button secondary" href="/recommendations/export?format=md&limit=5000">Download Markdown</a></div><div class="setting-row"><div><strong>Agent API specification</strong><span>Machine-readable inventory for the allow-listed product surface.</span></div><a class="button secondary" href="/agent/openapi.json" target="_blank" rel="noreferrer">Open specification</a></div></section><section><div class="section-head"><h2>Storage ownership</h2><span>{system.data?.timezone || 'Africa/Cairo'}</span></div><div class="system-storage">{(system.data?.storage || []).map((item) => <article key={item.name}><div><strong>{item.name}</strong><span>{item.purpose}</span></div><em>{labelize(item.status)}</em></article>)}</div><div class="system-counts">{Object.entries(system.data?.counts || {}).map(([key, value]) => <span key={key}><strong>{String(value)}</strong>{labelize(key)}</span>)}</div></section></div>
}

function capabilityArea(path: string) {
  if (/^\/(capture|recommendations|compass|discovery|collections)/.test(path)) return 'Capture & curation'
  if (/^\/(learning|sessions|srs|notes|feedback)/.test(path)) return 'Learning loop'
  if (/^\/(brain|knowledge|taste)/.test(path)) return 'Knowledge & profile'
  if (/^\/(artifacts|notebooklm)/.test(path)) return 'Files & NotebookLM'
  if (/^\/(analytics)/.test(path)) return 'Intelligence & analytics'
  if (/^\/(notifications)/.test(path)) return 'Delivery & reminders'
  return 'Platform & system'
}

function SystemView() {
  const capabilities = useData<{ capabilities?: Capability[]; authentication?: string }>('/agent/capabilities')
  const system = useData<SystemPayload>('/agent/system')
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('ALL')
  if (capabilities.loading || system.loading) return <Loading label="Reading the system inventory" />
  if (capabilities.error || system.error) return <ErrorState message={capabilities.error || system.error} retry={() => { capabilities.reload(); system.reload() }} />
  const operations = capabilities.data?.capabilities || []
  const filtered = operations.filter((item) => (method === 'ALL' || item.method === method) && `${item.method} ${item.path} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const grouped = filtered.reduce<Record<string, Capability[]>>((result, item) => { const area = capabilityArea(item.path); result[area] = [...(result[area] || []), item]; return result }, {})
  const writes = operations.filter((item) => item.method !== 'GET').length
  return <div class="system-console settings-system-page"><section class="system-hero"><div><span class="eyebrow">Settings / System</span><h1>Everything the system can do</h1><p>A descriptive control plane for the Learning Compass API, schedules, storage, and safety boundaries. Every operation below is the complete allow-listed inventory.</p></div><div class="system-hero-actions"><a href="/agent/openapi.json" target="_blank" rel="noreferrer">Open API specification ↗</a><button onClick={() => { capabilities.reload(); system.reload() }}>Refresh status</button></div></section><div class="system-summary"><div><strong>{operations.length}</strong><span>API operations</span></div><div><strong>{operations.length - writes}</strong><span>Read operations</span></div><div><strong>{writes}</strong><span>Guarded writes</span></div><div><strong>{system.data?.schedule?.length || 0}</strong><span>Configured schedules</span></div></div><section><div class="section-head"><h2>Runtime and storage</h2><span>{system.data?.status || 'unknown'}</span></div><div class="system-health-grid"><article><i class="healthy" /><span><strong>{system.data?.service || 'Learning Compass Worker'}</strong><small>{system.data?.environment || 'Runtime available'}</small></span></article>{(system.data?.storage || []).map((item) => <article key={item.name}><i class={/connected|managed|active/i.test(item.status) ? 'healthy' : 'warning'} /><span><strong>{item.name}</strong><small>{labelize(item.status)}</small></span></article>)}</div></section><div class="system-two-column"><section><div class="section-head"><h2>Schedules</h2><span>{system.data?.schedule?.length || 0} configured</span></div><div class="schedule-list">{(system.data?.schedule || []).length ? system.data!.schedule!.map((item) => <article key={item.id}><div class="schedule-head"><span class="method-badge method-post">CRON</span><div><strong>{item.cadence}</strong><code>{item.cron} · {item.timezone}</code></div></div><ul>{(item.responsibilities || []).map((responsibility) => <li key={responsibility}>{responsibility}</li>)}</ul><small>Search sync {item.last_search_sync ? formatDate(item.last_search_sync) : 'not recorded'}</small></article>) : <Empty title="No schedules configured" body="Maintenance remains on-demand until a schedule is explicitly configured." />}</div></section><section><div class="section-head"><h2>On demand only</h2><span>{system.data?.on_demand_only?.length || 0} workflows</span></div><div class="on-demand-list">{(system.data?.on_demand_only || []).map((item) => <div key={item}><i /><span>{item}</span></div>)}</div></section></div><section><div class="section-head"><h2>Complete operation inventory</h2><span>{filtered.length} of {operations.length}</span></div><div class="api-catalog-head"><div class="api-filters"><label>Search path or capability<input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="e.g. profile, export, notes" /></label><label>Method<select value={method} onChange={(event) => setMethod((event.target as HTMLSelectElement).value)}><option value="ALL">All methods</option>{[...new Set(operations.map((item) => item.method))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div></div>{filtered.length ? <div class="api-groups">{(Object.entries(grouped) as Array<[string, Capability[]]>).map(([area, items]) => <section key={area}><div class="api-group-title"><h3>{area}</h3><span>{items.length}</span></div><div class="api-operation-list">{items.map((item) => <article key={`${item.method}:${item.path}`}><span class={`method-badge method-${item.method.toLowerCase()}`}>{item.method}</span><code>{item.path}</code><p>{item.description}</p><small>{item.method === 'GET' ? 'Read only' : 'Validated · audit logged'}</small></article>)}</div></section>)}</div> : <Empty title="No operations match" body="Try a broader search or reset the method filter." action={<button class="button secondary" onClick={() => { setQuery(''); setMethod('ALL') }}>Clear filters</button>} />}</section><section class="system-safety"><div class="section-head"><h2>Safety boundaries</h2><span>{capabilities.data?.authentication || 'Product validation remains active'}</span></div>{(system.data?.safety || []).map((item) => <span key={item}>{item}</span>)}</section></div>
}

export function SettingsWorkspace({ route, view, onRouteChange }: SettingsWorkspaceProps) {
  const active = normalizeView(route?.view || route?.slug, view || 'profile')
  return <div class="settings-workspace workspace-surface"><SettingsNav active={active} onRouteChange={onRouteChange} />{active === 'profile' && <ProfileView />}{active === 'preferences' && <PreferencesView />}{active === 'data' && <DataView />}{active === 'system' && <SystemView />}</div>
}

export default SettingsWorkspace
