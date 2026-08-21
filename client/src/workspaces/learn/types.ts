export type Direction = 'auto' | 'ltr' | 'rtl'

export type PathStatus = 'active' | 'paused' | 'verified' | 'ready_to_verify' | 'abandoned' | 'draft'

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
  proof_count?: number
  completed_proof_count?: number
  needs_material_count?: number
  updated_at?: string | null
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

export interface PathSource {
  recommendation_id: string
  role?: string | null
  expected_contribution?: string | null
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
  round_label?: string | null
  artifacts?: { html?: PathArtifact; pdf?: PathArtifact }
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
  branch_id?: string | null
  branch_label?: string | null
  round_label?: string | null
  category?: string | null
  thread_id?: string | null
  stage_id?: string | null
  lesson_id?: string | null
  source_url?: string | null
  abstract?: string | null
  extraction_contract?: string | null
  source_word_count?: number | null
  note_word_count?: number | null
  coverage_status?: string | null
  rec_title?: string | null
  rec_video_url?: string | null
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
  | { kind: 'verify'; label: string; stage_id?: string }
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
  progress: { completed: number; total: number; study_completed?: number; study_total?: number; proof_completed?: number; proof_total?: number; project_completed?: number; project_total?: number }
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

export interface StageEvidence {
  id: string
  thread_id?: string | null
  stage_id?: string | null
  item_id?: string | null
  evidence_type: string
  result: string
  response?: string | null
  score?: number | null
  proof_ref?: string | null
  occurred_at?: string | null
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
    evidence_requirements?: Array<{ key?: string; label?: string; evidence_type?: string }>
    updated_at?: string | null
  }
  stages: PathStage[]
  current_stage?: PathStage | null
  projects: ThreadProject[]
  evidence: StageEvidence[]
  requirements: Array<{ id: string; label?: string | null; status?: string | null; evidence_type?: string | null; stage_id?: string | null }>
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
  repetitions?: number | null
  owner_scope?: LearningOwnerScope
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

export interface LearningUnitSummary {
  id: string
  unit_type: string
  statement: string
  stance?: string | null
  confidence?: number | null
  anchors: Array<{ anchor_type: string; locator: string; excerpt?: string | null }>
}

export interface NoteDossierResponse {
  note: NoteRecord
  related_notes: NoteRecord[]
  units: LearningUnitSummary[]
  recall: { drafts: RecallDraft[]; cards: RecallCard[] }
}
