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
  evidence_type?: string | null
  position?: number
}

export interface PathArtifact {
  id: string
  filename: string
  media_type?: string | null
  size_bytes?: number | null
  created_at?: string | null
  metadata?: Record<string, unknown>
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
  learning_state?: string | null
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
  thread_id?: string | null
  stage_id?: string | null
  source_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  sections: NoteSection[]
}

export interface StageEvidence {
  id: string
  stage_id?: string | null
  item_id?: string | null
  evidence_type?: string | null
  result?: string | null
  response?: string | null
  prompt?: string | null
  score?: number | null
  occurred_at?: string | null
}

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
  requirements: Array<{ id: string; label?: string | null; status?: string | null; evidence_type?: string | null }>
  evidence: StageEvidence[]
  notes: NoteRecord[]
  files: PathArtifact[]
  progress: { completed: number; total: number }
  next_action?: { kind: string; label: string; lesson_id?: string }
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
  why_learn?: string | null
  why_now?: string | null
  takeaway?: string | null
}

export interface ThreadProject {
  id: string
  thread_id: string
  stage_id?: string | null
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
    status: string
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
  unit_id?: string | null
  repetitions?: number | null
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
  unit_id?: string | null
  created_at?: string | null
  updated_at?: string | null
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
