import { chunkForD1 } from './d1-query.ts'

export const NOTEBOOKLM_LEARNING_CONTRACT = 'notebooklm-learning-v1'

export const notebookLearningFormats = [
  'quiz',
  'audio',
  'mind-map',
  'infographic',
  'slide-deck',
  'video',
  'cinematic-video',
  'flashcards',
  'data-table',
  'report',
] as const

export type NotebookLearningFormat = typeof notebookLearningFormats[number]
export type NotebookLearningPurpose = 'learn' | 'orientation' | 'review' | 'teach-back' | 'presentation'
export type NotebookConceptFeature = 'hierarchy' | 'causality' | 'taxonomy' | 'mechanism' | 'process' | 'comparison' | 'data' | 'spatial' | 'motion' | 'sequence' | 'procedure' | 'demonstration'

export type NotebookLearningPlanInput = {
  recommendation_id: string
  purpose?: NotebookLearningPurpose
  requested_formats?: string[]
  concept_features?: string[]
}

export type NotebookLearningPlan = {
  contract_version: typeof NOTEBOOKLM_LEARNING_CONTRACT
  recommendation_id: string
  purpose: NotebookLearningPurpose
  default_artifact: 'quiz'
  selected_formats: NotebookLearningFormat[]
  rejected_formats: Array<{ format: string; reason: string }>
  requirements: Record<string, Record<string, unknown>>
}

const aliases: Record<string, NotebookLearningFormat> = {
  mindmap: 'mind-map',
  slides: 'slide-deck',
  data: 'data-table',
  cinematic: 'cinematic-video',
}

const conceptFit: Partial<Record<NotebookLearningFormat, Set<NotebookConceptFeature>>> = {
  'mind-map': new Set(['hierarchy', 'causality', 'taxonomy']),
  infographic: new Set(['mechanism', 'process', 'comparison', 'data', 'spatial']),
  'slide-deck': new Set([]),
  video: new Set(['motion', 'sequence', 'procedure', 'demonstration']),
  'cinematic-video': new Set(['motion', 'sequence', 'procedure', 'demonstration']),
  'data-table': new Set(['comparison', 'data', 'taxonomy']),
}

const purposeValues = new Set<NotebookLearningPurpose>(['learn', 'orientation', 'review', 'teach-back', 'presentation'])
const featureValues = new Set<NotebookConceptFeature>(['hierarchy', 'causality', 'taxonomy', 'mechanism', 'process', 'comparison', 'data', 'spatial', 'motion', 'sequence', 'procedure', 'demonstration'])
const formatValues = new Set<NotebookLearningFormat>(notebookLearningFormats)

const normalizedFormat = (value: unknown): NotebookLearningFormat | null => {
  const key = String(value || '').trim().toLowerCase()
  const normalized = aliases[key] || key
  return formatValues.has(normalized as NotebookLearningFormat) ? normalized as NotebookLearningFormat : null
}

const requirementsFor = (format: NotebookLearningFormat, purpose: NotebookLearningPurpose) => {
  if (format === 'quiz') return {
    source_grounded: true,
    difficulty: 'hard',
    question_count_min: 5,
    question_count_max: 8,
    hints_before_explanations: true,
    transfer_question_count_min: 1,
  }
  if (format === 'audio') return {
    source_grounded: true,
    language: 'ar_eg',
    purpose,
    use: purpose === 'orientation' ? 'orientation' : 'review',
  }
  if (format === 'slide-deck') return { source_grounded: true, use: purpose === 'presentation' ? 'presentation' : 'teach-back-cues', dense_source_duplicate: false }
  return { source_grounded: true, custom_prompt_required: true }
}

export function buildNotebookLearningPlan(input: NotebookLearningPlanInput): NotebookLearningPlan {
  const recommendationId = String(input.recommendation_id || '').trim()
  if (!recommendationId) throw new Error('recommendation_id is required')
  const purpose = purposeValues.has(input.purpose as NotebookLearningPurpose) ? input.purpose as NotebookLearningPurpose : 'learn'
  const features = new Set((Array.isArray(input.concept_features) ? input.concept_features : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value): value is NotebookConceptFeature => featureValues.has(value as NotebookConceptFeature)))
  const requested = Array.isArray(input.requested_formats) && input.requested_formats.length
    ? input.requested_formats
    : ['quiz']
  const selected: NotebookLearningFormat[] = []
  const rejected: Array<{ format: string; reason: string }> = []

  for (const raw of requested) {
    const format = normalizedFormat(raw)
    if (!format) {
      rejected.push({ format: String(raw), reason: 'unsupported NotebookLM learning format' })
      continue
    }
    if (selected.includes(format)) continue
    if (format === 'audio' && purpose !== 'orientation' && purpose !== 'review') {
      rejected.push({ format, reason: 'Arabic audio is reserved for orientation or review' })
      continue
    }
    if (format === 'slide-deck' && purpose !== 'teach-back' && purpose !== 'presentation') {
      rejected.push({ format, reason: 'slide decks are only useful here as teach-back or presentation cues' })
      continue
    }
    const fit = conceptFit[format]
    if (fit && fit.size && ![...features].some((feature) => fit.has(feature))) {
      rejected.push({ format, reason: `no matching concept feature (${[...fit].join(', ')})` })
      continue
    }
    if (selected.length >= 3) {
      rejected.push({ format, reason: 'the focused router allows at most three non-redundant outputs' })
      continue
    }
    selected.push(format)
  }

  // A general request must always produce useful retrieval practice, even if a
  // proposed decorative format fails its concept-fit gate.
  if (!selected.length) selected.push('quiz')
  const requirements = Object.fromEntries(selected.map((format) => [format, requirementsFor(format, purpose)]))
  return {
    contract_version: NOTEBOOKLM_LEARNING_CONTRACT,
    recommendation_id: recommendationId,
    purpose,
    default_artifact: 'quiz',
    selected_formats: selected,
    rejected_formats: rejected,
    requirements,
  }
}

export type NotebookSourceReceiptInput = {
  kind: 'source'
  recommendation_id: string
  notebook_id: string
  notebook_url: string
  status: 'pending' | 'indexed' | 'failed'
  provider_source_id?: string
  evidence?: string
  error?: string
}

export type NotebookArtifactReceiptInput = {
  kind: 'artifact'
  recommendation_id: string
  notebook_id: string
  notebook_url: string
  plan_id: string
  format: string
  status: 'pending' | 'ready' | 'failed'
  provider_task_id?: string
  provider_artifact_id?: string
  published_artifact_id?: string
  source_grounded?: boolean
  custom_prompt_applied?: boolean
  language?: string
  question_count?: number
  hints_before_explanations?: boolean
  transfer_question_count?: number
  error?: string
}

export type NotebookLearningReceiptInput = NotebookSourceReceiptInput | NotebookArtifactReceiptInput

const cleanRequired = (value: unknown, field: string, failures: string[]) => {
  const cleaned = String(value || '').trim()
  if (!cleaned) failures.push(`${field} is required`)
  return cleaned
}

export function validateNotebookLearningReceipt(input: NotebookLearningReceiptInput, plan?: NotebookLearningPlan) {
  const failures: string[] = []
  cleanRequired(input.recommendation_id, 'recommendation_id', failures)
  const notebookId = cleanRequired(input.notebook_id, 'notebook_id', failures)
  const notebookUrl = cleanRequired(input.notebook_url, 'notebook_url', failures)
  const notebookUrlMatch = notebookUrl.match(/^https:\/\/(?:notebook|notebooklm)\.google\.com\/notebook\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/)
  if (notebookUrl && !notebookUrlMatch) failures.push('notebook_url must be an exact NotebookLM notebook URL')
  if (notebookUrlMatch && notebookId && notebookUrlMatch[1] !== notebookId) failures.push('notebook_id must match notebook_url')

  if (input.kind === 'source') {
    if (!['pending', 'indexed', 'failed'].includes(input.status)) failures.push('source status must be pending, indexed, or failed')
    if (input.status === 'indexed' && !String(input.provider_source_id || '').trim()) failures.push('provider_source_id is required when source status is indexed')
    if (input.status === 'failed' && !String(input.error || '').trim()) failures.push('error is required when source status is failed')
  } else {
    const format = normalizedFormat(input.format)
    if (!format) failures.push('format is unsupported')
    if (!['pending', 'ready', 'failed'].includes(input.status)) failures.push('artifact status must be pending, ready, or failed')
    if (!String(input.plan_id || '').trim()) failures.push('plan_id is required')
    if (plan && format && !plan.selected_formats.includes(format)) failures.push('format is not selected by the learning output plan')
    if (input.status === 'pending' && !String(input.provider_task_id || '').trim()) failures.push('provider_task_id is required when artifact status is pending')
    if (input.status === 'ready' && !String(input.provider_artifact_id || '').trim()) failures.push('provider_artifact_id is required when artifact status is ready')
    if (input.status === 'failed' && !String(input.error || '').trim()) failures.push('error is required when artifact status is failed')
    if (input.status !== 'failed' && input.source_grounded !== true) failures.push('source_grounded must be true for submitted or ready learning artifacts')
    if (input.status !== 'failed' && input.custom_prompt_applied !== true) failures.push('custom_prompt_applied must be true for submitted or ready learning artifacts')
    if (format === 'audio' && input.status !== 'failed' && input.language !== 'ar_eg') failures.push('NotebookLM learning audio must use language ar_eg')
    if (format === 'quiz' && input.status === 'ready') {
      if (!Number.isInteger(input.question_count) || Number(input.question_count) < 5 || Number(input.question_count) > 8) failures.push('ready quiz must contain 5 to 8 questions')
      if (input.hints_before_explanations !== true) failures.push('ready quiz must provide hints before explanations')
      if (!Number.isInteger(input.transfer_question_count) || Number(input.transfer_question_count) < 1) failures.push('ready quiz must contain at least one transfer question')
    }
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)] }
}

export function normalizeNotebookLearningFormat(value: unknown) {
  return normalizedFormat(value)
}

export type NotebookLearningReceiptRow = {
  sequence?: number
  id: string
  intent: string
  status_code: number
  verified: number
  receipt_json: string
  created_at: string
}

export type ParsedNotebookLearningReceipt = Record<string, any> & {
  id: string
  intent: string
  status_code: number
  verified: boolean
  created_at: string
}

export type NotebookLearningState = {
  contract_version: typeof NOTEBOOKLM_LEARNING_CONTRACT
  linked: boolean
  indexed: boolean
  index_status: 'unlinked' | 'linked' | 'pending' | 'indexed' | 'failed'
  output_status: 'none' | 'pending' | 'ready' | 'failed'
  primary_format: NotebookLearningFormat | null
  notebook_url: string | null
  source: ParsedNotebookLearningReceipt | null
  plan: ParsedNotebookLearningReceipt | null
  artifacts: Record<string, ParsedNotebookLearningReceipt>
  outputs: Array<{ format: string; status: 'pending' | 'ready' | 'failed'; receipt_id: string }>
  receipts: ParsedNotebookLearningReceipt[]
}

export type NotebookLearningSummary = Pick<NotebookLearningState,
  'linked' | 'indexed' | 'index_status' | 'output_status' | 'primary_format'> & {
    outputs: Array<{ format: string; status: 'pending' | 'ready' | 'failed' }>
  }

export function summarizeNotebookLearningState(state: NotebookLearningState): NotebookLearningSummary {
  return {
    linked: state.linked,
    indexed: state.indexed,
    index_status: state.index_status,
    output_status: state.output_status,
    primary_format: state.primary_format,
    outputs: state.outputs.map(({ format, status }) => ({ format, status })),
  }
}

export const notebookLearningTarget = (recommendationId: string) => `notebooklm:${recommendationId}`

const parsedLearningReceipt = (row: NotebookLearningReceiptRow): ParsedNotebookLearningReceipt => {
  let receipt: Record<string, any> = {}
  try { receipt = JSON.parse(row.receipt_json || '{}') } catch { /* retain the ledger row even when old JSON is malformed */ }
  // Ledger identity always wins over provider payloads, including older rows
  // written before receipt inputs were allow-listed at the API boundary.
  return { ...receipt, id: row.id, intent: row.intent, status_code: row.status_code, verified: Boolean(row.verified), created_at: row.created_at }
}

export function reduceNotebookLearningReceipts(rows: NotebookLearningReceiptRow[], notebookUrl: string | null = null): NotebookLearningState {
  const receipts = rows.map(parsedLearningReceipt)
  const source = receipts.find((item) => item.intent === 'notebooklm_source_receipt') || null
  const linked = Boolean(notebookUrl)
  const receiptMatchesLink = Boolean(source && notebookUrl && source.notebook_url === notebookUrl)
  const indexed = receiptMatchesLink && source?.status === 'indexed'
  const plan = indexed && source
    ? receipts.find((item) => item.intent === 'notebooklm_learning_plan' && item.source_receipt_id === source.id) || null
    : null
  const artifacts: Record<string, ParsedNotebookLearningReceipt> = {}
  for (const item of receipts) {
    if (item.intent !== 'notebooklm_artifact_receipt' || !item.format || artifacts[item.format]) continue
    if (plan && item.plan_id !== plan.id) continue
    if (!plan) continue
    artifacts[item.format] = item
  }
  const indexStatus = !linked
    ? 'unlinked'
    : !source || !receiptMatchesLink
      ? 'linked'
      : source.status === 'pending' || source.status === 'indexed' || source.status === 'failed'
        ? source.status
        : 'linked'
  const selected: NotebookLearningFormat[] = (Array.isArray(plan?.plan?.selected_formats) ? plan.plan.selected_formats : [])
    .map((format: unknown) => normalizeNotebookLearningFormat(format))
    .filter((format: NotebookLearningFormat | null): format is NotebookLearningFormat => Boolean(format))
  // The displayed format and status must describe the same real artifact.
  // Prefer something usable now, then an in-flight output, then a failure.
  const primaryFormat = selected.find((format) => artifacts[format]?.status === 'ready')
    || selected.find((format) => artifacts[format]?.status === 'pending')
    || selected.find((format) => artifacts[format]?.status === 'failed')
    || selected[0]
    || null
  const primaryStatus = primaryFormat ? artifacts[primaryFormat]?.status : null
  const outputStatus = ['pending', 'ready', 'failed'].includes(primaryStatus)
    ? primaryStatus as 'pending' | 'ready' | 'failed'
    : 'none'
  const outputs = Object.values(artifacts)
    .filter((item) => ['pending', 'ready', 'failed'].includes(item.status))
    .map((item) => ({ format: String(item.format), status: item.status as 'pending' | 'ready' | 'failed', receipt_id: item.id }))
  return {
    contract_version: NOTEBOOKLM_LEARNING_CONTRACT,
    linked,
    indexed,
    index_status: indexStatus,
    output_status: outputStatus,
    primary_format: primaryFormat,
    notebook_url: notebookUrl,
    source,
    plan,
    artifacts,
    outputs,
    receipts,
  }
}

export async function loadNotebookLearningState(DB: D1Database, recommendationId: string, notebookUrl: string | null = null) {
  const rows = await DB.prepare(`SELECT rowid sequence,id,intent,status_code,verified,receipt_json,created_at
    FROM agent_receipts
    WHERE target=? AND intent IN ('notebooklm_learning_plan','notebooklm_source_receipt','notebooklm_artifact_receipt')
    ORDER BY rowid DESC LIMIT 200`).bind(notebookLearningTarget(recommendationId)).all<NotebookLearningReceiptRow>()
  return reduceNotebookLearningReceipts(rows.results || [], notebookUrl)
}

export async function loadNotebookLearningStates(
  DB: D1Database,
  sources: Array<{ recommendation_id: string; notebook_url?: string | null }>,
) {
  const notebookUrls = new Map<string, string | null>()
  for (const source of sources) {
    const recommendationId = String(source.recommendation_id || '').trim()
    if (!recommendationId) continue
    const notebookUrl = String(source.notebook_url || '').trim() || null
    if (!notebookUrls.has(recommendationId) || notebookUrl) notebookUrls.set(recommendationId, notebookUrl)
  }
  const states = new Map<string, NotebookLearningState>()
  if (!notebookUrls.size) return states

  const recommendationIds = [...notebookUrls.keys()]
  const targets = recommendationIds.map(notebookLearningTarget)
  const rowBatches = await Promise.all(chunkForD1(targets).map((batch) => {
    const placeholders = batch.map(() => '?').join(',')
    return DB.prepare(`SELECT rowid sequence,id,intent,target,status_code,verified,receipt_json,created_at
      FROM agent_receipts
      WHERE target IN (${placeholders}) AND intent IN ('notebooklm_learning_plan','notebooklm_source_receipt','notebooklm_artifact_receipt')
      ORDER BY rowid DESC`).bind(...batch).all<NotebookLearningReceiptRow & { target: string }>()
  }))
  const byTarget = new Map<string, NotebookLearningReceiptRow[]>()
  for (const row of rowBatches.flatMap((batch) => batch.results || [])) {
    const group = byTarget.get(row.target) || []
    group.push(row)
    byTarget.set(row.target, group)
  }
  for (const recommendationId of recommendationIds) {
    states.set(recommendationId, reduceNotebookLearningReceipts(
      byTarget.get(notebookLearningTarget(recommendationId)) || [],
      notebookUrls.get(recommendationId) || null,
    ))
  }
  return states
}
