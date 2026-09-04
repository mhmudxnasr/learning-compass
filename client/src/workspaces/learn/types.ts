export type Direction = 'auto' | 'ltr' | 'rtl'

export type PathStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'draft'

export interface PathRecord {
  id: string
  title: string
  thread_type?: string
  guiding_question?: string | null
  why_now?: string | null
  definition_of_done?: string | null
  status: PathStatus | string
  stage_count: number
  completed_stage_count: number
  current_stage_title?: string | null
  current_stage_status?: string | null
  lesson_count?: number
  completed_lesson_count?: number
  needs_material_count?: number
  updated_at?: string | null
  priority?: number
  last_studied_at?: string | null
  future_material_count?: number
  remaining_minutes?: number
  estimated_lesson_count?: number
  next_lesson?: {
    id: string
    stage_id: string
    stage_title: string
    title: string
    objective?: string | null
    estimated_minutes?: number | null
    readiness: 'ready' | 'in_progress' | 'needs_material' | 'locked'
  } | null
}

export interface PathHubResponse {
  paths: PathRecord[]
}

export interface ThreadItem {
  id: string
  stage_id: string
  item_type: string
  title: string
  description?: string | null
  required?: number | boolean
  status: 'open' | 'satisfied' | 'waived' | string
  position?: number
}

export interface PathArtifact {
  id: string
  filename: string
  media_type?: string | null
  size_bytes?: number | null
  created_at?: string | null
  metadata?: Record<string, unknown>
  metadata_json?: string | null
  thread_id?: string | null
  stage_id?: string | null
  owner_scope?: LearningOwnerScope
}

export interface LearningOwnerScope {
  kind: 'thread' | 'level' | 'lesson'
  id: string
  title: string
}

export type SourceHealthStatus = 'verified' | 'restricted' | 'unavailable' | 'unknown' | 'invalid'

export interface SourceHealthSummary {
  status: SourceHealthStatus
  checked_at?: string | null
  last_checked_at?: string | null
  http_status?: number | null
  final_url?: string | null
  error_code?: string | null
}

export interface SourceBranchSummary {
  id: string
  label?: string | null
  status?: string | null
  super_category: string
  domain_label?: string | null
}

export interface PathSource {
  recommendation_id: string
  stage_id?: string | null
  lesson_id?: string | null
  role?: string | null
  storage_role?: string | null
  required?: number | boolean | null
  expected_contribution?: string | null
  position?: number | null
  video_title?: string | null
  creator?: string | null
  content_type?: string | null
  video_url?: string | null
  notebook_url?: string | null
  notebook_learning?: {
    linked: boolean
    indexed: boolean
    index_status: 'unlinked' | 'linked' | 'pending' | 'indexed' | 'failed'
    output_status: 'none' | 'pending' | 'ready' | 'failed'
    primary_format?: string | null
    outputs?: Array<{ format: string; status: 'pending' | 'ready' | 'failed' }>
  } | null
  learning_state?: string | null
  branch_id?: string | null
  branch_label?: string | null
  branch_status?: string | null
  branch_domain_id?: string | null
  branch_domain_label?: string | null
  source_health_status?: SourceHealthStatus | null
  source_health_checked_at?: string | null
  source_health_http_status?: number | null
  source_health_final_url?: string | null
  source_health_error_code?: string | null
  artifacts?: { html?: PathArtifact; pdf?: PathArtifact }
}

export interface MaterialSourcePlacement {
  scope: 'thread' | 'level' | 'lesson'
  scope_id: string
  scope_title: string
  role: string
  storage_role?: string | null
  expected_contribution?: string | null
  position?: number | null
}

export interface MaterialSourceSearchItem {
  id: string
  title: string
  creator?: string | null
  content_type?: string | null
  source_url?: string | null
  notebook_url?: string | null
  why_this?: string | null
  status?: string | null
  learning_state?: string | null
  branch: SourceBranchSummary
  health?: SourceHealthSummary | null
  artifacts?: { html?: PathArtifact; pdf?: PathArtifact }
  placements: MaterialSourcePlacement[]
}

export interface MaterialSourceSearchResponse {
  thread: { id: string; title: string }
  query: string
  sources: MaterialSourceSearchItem[]
}

export interface MaterialRequestResult {
  outcome: 'ready' | 'abstained' | null
  pick_id?: string | null
  recommendation_id?: string | null
  title?: string | null
  creator?: string | null
  source_url?: string | null
  expected_contribution?: string | null
  branch_id?: string | null
  reason?: string | null
}

export interface MaterialRequest {
  job_id: string
  status: 'pending' | 'running' | 'retry' | 'completed' | 'failed' | string
  outcome?: 'ready' | 'abstained' | null
  requested_at?: string | null
  updated_at?: string | null
  attempts?: number
  error?: string | null
  result_valid?: boolean | null
  result?: MaterialRequestResult | null
}

export interface MaterialRequestResponse {
  ok?: boolean
  reused?: boolean
  request: MaterialRequest | null
}

export interface NoteSection {
  section_key: string
  label?: string | null
  content: string
  direction?: Direction | string | null
  position?: number
}

export interface NoteRecord {
  id: string
  title: string
  kind?: string | null
  status?: string | null
  recommendation_id?: string | null
  content_type?: string | null
  branch_id?: string | null
  branch_label?: string | null
  category?: string | null
  thread_id?: string | null
  stage_id?: string | null
  lesson_id?: string | null
  owner_thread_id?: string | null
  source_url?: string | null
  abstract?: string | null
  extraction_contract?: string | null
  source_word_count?: number | null
  note_word_count?: number | null
  coverage_status?: string | null
  rec_title?: string | null
  rec_video_url?: string | null
  rec_source_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  sections: NoteSection[]
  owner_scope?: LearningOwnerScope
}

export type NextAction =
  | { kind: 'start'; label: string; stage_id?: string }
  | { kind: 'lesson'; label: string; stage_id?: string; lesson_id: string }
  | { kind: 'item'; label: string; stage_id?: string; item_id: string }
  | { kind: 'project'; label: string; stage_id?: string; project_id: string }
  | { kind: 'none'; label: string; stage_id?: string; reason?: string }

export interface PathStage {
  id: string
  thread_id: string
  position: number
  title: string
  objective?: string | null
  description?: string | null
  status: string
  items: ThreadItem[]
  lessons: ThreadLesson[]
  projects: ThreadProject[]
  sources: PathSource[]
  notes: NoteRecord[]
  files: PathArtifact[]
  cards: RecallCard[]
  recall_drafts: RecallDraft[]
  progress: {
    completed: number
    total: number
    study_completed?: number
    study_total?: number
    project_completed?: number
    project_total?: number
  }
  next_action?: NextAction
}

export interface ThreadLesson {
  id: string
  stage_id: string
  position: number
  title: string
  description?: string | null
  objective?: string | null
  content?: string | null
  estimated_minutes?: number | null
  status: 'not_started' | 'in_progress' | 'completed' | string
  sources?: PathSource[]
  notes?: NoteRecord[]
  files?: PathArtifact[]
  cards?: RecallCard[]
  recall_drafts?: RecallDraft[]
  why_learn?: string | null
  why_now?: string | null
  takeaway?: string | null
}

export interface ThreadProject {
  id: string
  thread_id: string
  stage_id?: string | null
  lesson_id?: string | null
  type: 'level' | 'final'
  title: string
  description: string
  objective?: string | null
  instructions?: string | null
  suggested_context?: string | null
  status: 'not_started' | 'in_progress' | 'completed' | 'deferred' | string
  notes?: string | null
}

export interface PathResponse {
  thread: {
    id: string
    title: string
    thread_type?: string | null
    guiding_question?: string | null
    why_now?: string | null
    definition_of_done?: string | null
    final_synthesis?: string | null
    status: string
    superseded_by_type?: string | null
    superseded_by_id?: string | null
    superseded_at?: string | null
    updated_at?: string | null
  }
  sources: PathSource[]
  stages: PathStage[]
  current_stage?: PathStage | null
  projects: ThreadProject[]
  notes: NoteRecord[]
  files: PathArtifact[]
  cards: RecallCard[]
  recall_drafts: RecallDraft[]
}

export interface NotesResponse {
  notes: NoteRecord[]
}

export interface RecallCard {
  id: string
  question: string
  answer: string
  topic?: string | null
  branch?: string | null
  source_title?: string | null
  note_id?: string | null
  due_at?: string | null
  last_reviewed_at?: string | null
  thread_id?: string | null
  stage_id?: string | null
  unit_id?: string | null
  unit_statement?: string | null
  unit_type?: string | null
  card_type?: string | null
  source_anchor?: string | null
  annotation_id?: string | null
  recommendation_id?: string | null
  lesson_id?: string | null
  repetitions?: number | null
  lapses?: number | null
  difficulty?: number | null
  stability?: number | null
  repair_status: 'active' | 'paused' | 'retired'
  repair_lapses_acknowledged?: number | null
  content_revision: number
  scheduler_revision: number
  status_revision: number
  owner_scope?: LearningOwnerScope
}

export interface RecallRepairCard extends RecallCard {
  repair_reason: {
    code: 'repeated_lapses' | 'paused_by_learner' | 'retired_by_learner'
    lapse_count: number
    threshold: number
    message: string
  }
  review_history: Array<{
    id: number | string
    grade: number
    reviewed_at?: string | null
    previous_due?: string | null
    next_due?: string | null
    previous_lapses?: number
    next_lapses?: number
  }>
  repair_history: Array<{
    id: string
    action: string
    change_kind?: 'wording' | 'semantic' | null
    reason?: string | null
    created_at?: string | null
  }>
  comparison_candidates: Array<{ id: string; question: string; answer: string; reason: string }>
}

export interface RecallDraft {
  id: string
  question: string
  answer: string
  topic?: string | null
  branch?: string | null
  source_title?: string | null
  note_id?: string | null
  status: 'draft' | 'approved' | 'rejected' | string
  recommendation_id?: string | null
  thread_id?: string | null
  stage_id?: string | null
  unit_id?: string | null
  unit_statement?: string | null
  unit_type?: string | null
  card_type?: string | null
  source_anchor?: string | null
  created_at?: string | null
  updated_at?: string | null
  owner_scope?: LearningOwnerScope
}

export interface DueResponse {
  cards: RecallCard[]
  count?: number
  today?: string
}

export interface DraftsResponse {
  drafts: RecallDraft[]
}

export interface CardsResponse {
  cards: RecallCard[]
}

export interface RecallRepairResponse {
  threshold: number
  cards: RecallRepairCard[]
  count: number
}

export interface LearningUnitSummary {
  id: string
  unit_type: string
  statement: string
  stance?: string | null
  confidence?: number | null
  anchors: Array<{ anchor_type: string; locator: string; excerpt?: string | null }>
}

export interface DistillationBlock {
  section_key: string
  section_label?: string | null
  block_index: number
  text: string
  checksum: string
}

export interface ClaimHighlight {
  id: string
  note_id: string
  section_key: string
  block_index: number
  block_checksum: string
  source_text: string
  claim_text: string
  stale: boolean
  promoted_unit_id?: string | null
  promoted_at?: string | null
  created_at: string
}

export interface SynthesisRevision {
  id: string
  note_id: string
  revision: number
  synthesis_text: string
  created_at: string
}

export interface NoteDistillation {
  blocks: DistillationBlock[]
  highlights: ClaimHighlight[]
  synthesis_revisions: SynthesisRevision[]
  can_promote: boolean
}

export interface SemanticRelationEndpoint {
  unit_id: string
  statement: string
  unit_type: string
  note_id?: string | null
  recommendation_id?: string | null
  branch: { id: string; label: string; domain: string }
  anchor?: { locator: string; excerpt?: string | null } | null
}

export interface SemanticRelation {
  id: string
  relation_type: string
  confidence: number
  why: string
  review_state: string
  resolution?: string | null
  direction: 'incoming' | 'outgoing'
  counterpart: SemanticRelationEndpoint
  source: SemanticRelationEndpoint
  target: SemanticRelationEndpoint
}

export interface NoteDossierResponse {
  note: NoteRecord
  related_notes: NoteRecord[]
  units: LearningUnitSummary[]
  relations: SemanticRelation[]
  backlinks: SemanticRelation[]
  recall: { drafts: RecallDraft[]; cards: RecallCard[] }
  distillation?: NoteDistillation | null
}
