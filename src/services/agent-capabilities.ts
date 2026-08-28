export const AGENT_CONTRACT_VERSION = '2026-08-26'
export const AGENT_PROTOCOL = 'learning-compass-agent-http/2'

export type AgentMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type CapabilityTuple = readonly [AgentMethod, string, string]

type JsonSchema = Record<string, unknown>

const objectSchema = (properties: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: true,
})

const MAX_PERSONAL_RELEASE_YEAR = new Date().getUTCFullYear() + 5

const PERSONAL_LIBRARY_PROPERTIES: Record<string, JsonSchema> = {
  title: { type: 'string', minLength: 1, maxLength: 500 },
  creator: { type: 'string', maxLength: 300 },
  item_type: { type: 'string', enum: ['book', 'movie', 'series', 'podcast', 'course', 'game', 'album', 'other'] },
  state: {
    type: 'string',
    enum: ['planned', 'in_progress', 'completed', 'paused', 'dropped'],
    description: 'Canonical personal lifecycle field. Use completed for watched, read, or finished; do not send personal_state.',
  },
  branch_id: { type: 'string', minLength: 1, maxLength: 160 },
  url: { type: 'string', format: 'uri' },
  release_year: {
    type: 'integer',
    minimum: 1800,
    maximum: MAX_PERSONAL_RELEASE_YEAR,
    description: 'Canonical release-year field; do not send year.',
  },
  duration_minutes: { type: 'integer', minimum: 0, maximum: 1000000 },
  progress_current: { type: 'number', minimum: 0, maximum: 1000000 },
  progress_total: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 },
  progress_unit: { type: 'string', maxLength: 40 },
  rating: { type: 'number', minimum: 0, maximum: 10 },
  tags: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 20 },
  personal_note: { type: 'string', maxLength: 5000 },
}

const PERSONAL_LIBRARY_PATCH_PROPERTIES: Record<string, JsonSchema> = { ...PERSONAL_LIBRARY_PROPERTIES }
delete PERSONAL_LIBRARY_PATCH_PROPERTIES.item_type

const COMPASS_EVIDENCE_SCHEMA = objectSchema({
  claim: {
    type: 'string',
    minLength: 12,
    maxLength: 4000,
    description: 'A concrete source-supported claim; generic relevance claims are not evidence.',
  },
  source_url: { type: 'string', format: 'uri', pattern: '^https?://', description: 'Direct public HTTP(S) source for this claim.' },
  anchor: { type: 'string', minLength: 1, maxLength: 1000, description: 'Preferred precise section, timestamp, page, or quotation anchor.' },
}, ['claim', 'source_url'])

const COMPASS_EDITORIAL_REVIEW_SCHEMA = objectSchema({
  verdict: { type: 'string', enum: ['recommend'] },
  why_worth_time: { type: 'string', minLength: 30, maxLength: 4000 },
  unique_value: { type: 'string', minLength: 30, maxLength: 4000 },
  depth: { type: 'string', enum: ['substantive', 'deep'] },
}, ['verdict', 'why_worth_time', 'unique_value', 'depth'])

const COMPASS_PERSPECTIVE_SCHEMA = {
  ...objectSchema({
    viewpoint: { type: 'string', minLength: 1, maxLength: 160 },
    school: { type: 'string', minLength: 1, maxLength: 160 },
    evidence_indexes: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 3 }, minItems: 1, maxItems: 4 },
  }, ['evidence_indexes']),
  anyOf: [{ required: ['viewpoint'] }, { required: ['school'] }],
}

const COMPASS_CANDIDATE_SCHEMA = objectSchema({
  canonical_url: { type: 'string', format: 'uri', pattern: '^https?://' },
  title: { type: 'string', minLength: 1, maxLength: 500 },
  creator: { type: 'string', minLength: 1, maxLength: 300 },
  format: { type: 'string', minLength: 1, maxLength: 80 },
  source_class: { type: 'string', minLength: 1, maxLength: 80 },
  branch_id: { type: 'string', minLength: 1, maxLength: 160 },
  expected_contribution: { type: 'string', minLength: 12, maxLength: 4000 },
  evidence: { type: 'array', items: COMPASS_EVIDENCE_SCHEMA, minItems: 1, maxItems: 4 },
  editorial_review: COMPASS_EDITORIAL_REVIEW_SCHEMA,
  lane: { type: 'string', enum: ['fit', 'bridge', 'challenge'] },
  target_lesson_id: { type: 'string', minLength: 1, maxLength: 200 },
  summary: { type: 'string', minLength: 1, maxLength: 1800 },
  concepts: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 160 }, minItems: 2, maxItems: 8 },
  mechanism: { type: 'string', minLength: 1, maxLength: 500 },
  mechanisms: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 240 }, minItems: 1, maxItems: 8 },
  duration_minutes: { type: 'number', minimum: 0, maximum: 100000 },
  paywalled: { type: 'boolean' },
  effort: { type: 'string', enum: ['light', 'moderate', 'deep'] },
  language: { type: 'string', enum: ['en', 'ar'] },
  delivery_modes: { type: 'array', items: { type: 'string', enum: ['read', 'watch', 'listen', 'practice'] }, minItems: 1, maxItems: 4 },
  depth_tier: { type: 'string', enum: ['introductory', 'intermediate', 'advanced'] },
  source_proximity: { type: 'string', enum: ['primary', 'near_primary', 'secondary', 'unknown'] },
  perspective: COMPASS_PERSPECTIVE_SCHEMA,
}, ['canonical_url', 'title', 'creator', 'format', 'source_class', 'branch_id', 'expected_contribution', 'evidence', 'editorial_review'])

const COMPASS_PICK_SCHEMA = objectSchema({
  request_id: { type: 'string', minLength: 1, maxLength: 160 },
  strategy: { type: 'string', enum: ['fit', 'bridge', 'challenge'] },
  intent: { type: 'string', enum: ['solve_problem', 'build_skill', 'deepen_thread', 'discover', 'queue_fill'] },
  thread_id: { type: 'string', minLength: 1, maxLength: 200 },
  allow_books: { type: 'boolean' },
  delivery_context: objectSchema({
    effort: { type: 'string', enum: ['light', 'moderate', 'deep'] },
    language: { type: 'string', enum: ['any', 'en', 'ar'] },
    delivery_modes: { type: 'array', items: { type: 'string', enum: ['read', 'watch', 'listen', 'practice'] }, maxItems: 4 },
    depth_tier: { type: 'string', enum: ['adaptive', 'introductory', 'intermediate', 'advanced'] },
  }),
  candidates: { type: 'array', items: COMPASS_CANDIDATE_SCHEMA, minItems: 3, maxItems: 24 },
}, ['intent', 'thread_id', 'candidates'])

const BODY_SCHEMAS: Record<string, JsonSchema> = {
  'POST /capture': objectSchema({ source: { type: 'string', minLength: 1 }, title: { type: 'string' }, artifact_id: { type: 'string' }, branch_id: { type: 'string', minLength: 1 }, branch_reason: { type: 'string', maxLength: 500 } }, ['source', 'branch_id']),
  'POST /capture/personal': objectSchema(PERSONAL_LIBRARY_PROPERTIES, ['title', 'item_type', 'state', 'branch_id']),
  'PATCH /capture/personal/:id': objectSchema(PERSONAL_LIBRARY_PATCH_PROPERTIES),
  'POST /assistant/interpret': objectSchema({ message: { type: 'string', minLength: 1, maxLength: 12000 }, mode: { type: 'string', enum: ['log', 'questions', 'mixed'] } }, ['message']),
  'POST /hardcover/sync': objectSchema({}, []),
  'POST /hardcover/import': objectSchema({ branch_id: { type: 'string', minLength: 1, maxLength: 160 }, book_ids: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 500 } }, ['branch_id']),
  'POST /capture/feeds': objectSchema({ url: { type: 'string', format: 'uri' }, branch_id: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, ['url', 'branch_id']),
  'POST /capture/feeds/sync': objectSchema({ limit: { type: 'integer', minimum: 1, maximum: 20 } }),
  'POST /capture/feeds/:id/sync': objectSchema({ limit: { type: 'integer', minimum: 1, maximum: 20 } }),
  'POST /annotations': objectSchema({
    recommendation_id: { type: 'string', minLength: 1 },
    artifact_id: { type: 'string' },
    thread_id: { type: 'string' },
    branch_id: { type: 'string' },
    locator_type: { type: 'string', enum: ['web', 'pdf', 'video', 'epub', 'artifact', 'text'] },
    selector: { type: 'object' },
    quote: { type: 'string', minLength: 1 },
    context_before: { type: 'string' },
    context_after: { type: 'string' },
    language: { type: 'string' },
    source_checksum: { type: 'string' },
  }, ['recommendation_id', 'locator_type', 'quote']),
  'POST /capture/:id/triage': objectSchema({
    action: {
      type: 'string',
      enum: ['queue', 'dequeue', 'exclude'],
      description: 'queue creates a commitment, dequeue neutrally returns an active Queue item to captured, and exclude is an administrative exclusion.',
    },
    thread_id: { type: 'string', minLength: 1, description: 'Optional open Thread to associate while queueing.' },
    override_queue_cap: { type: 'boolean', description: 'Explicit Queue-cap override; used only with action=queue.' },
    reason: { type: 'string', minLength: 1, maxLength: 120, description: 'Administrative exclusion reason; used only with action=exclude.' },
  }, ['action']),
  'POST /sessions/start': objectSchema({ recommendation_id: { type: 'string' }, thread_id: { type: 'string' }, target_kind: { type: 'string' }, target_artifact_id: { type: 'string' } }, ['recommendation_id', 'thread_id', 'target_kind']),
  'POST /feedback/record': {
    ...objectSchema({
      recommendation_id: { type: 'string', minLength: 1, description: 'Exact canonical source ID; do not send source_id.' }, source_url: { type: 'string', format: 'uri' }, title: { type: 'string', minLength: 1, description: 'Exact source title fallback when no canonical ID or URL is available.' }, thread_id: { type: 'string' }, branch_id: { type: 'string', minLength: 1, maxLength: 160 },
      feedback: { type: 'string', minLength: 1, maxLength: 10000, description: 'The user\'s exact feedback preserved verbatim; never summarize or omit it.' }, score: { type: 'number', minimum: 0, maximum: 10, description: 'Canonical numeric rating field. Include it whenever the user supplied a rating; do not send rating.' },
      completion_state: { type: 'string', enum: ['completed', 'in_progress', 'stopped'] },
      disposition: { type: 'string', enum: ['undecided', 'retain', 'apply', 'reference', 'drop'] },
      reason_tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 8 },
      expected: { type: 'string', maxLength: 2000 }, actual: { type: 'string', maxLength: 2000 },
      effort: { type: 'string', enum: ['light', 'moderate', 'deep'] }, length_minutes: { type: 'integer', minimum: 0, maximum: 100000 },
    }, ['feedback']),
    anyOf: [
      { required: ['recommendation_id'] },
      { required: ['source_url'] },
      { required: ['title'] },
    ],
  },
  'POST /compass/picks': COMPASS_PICK_SCHEMA,
  'POST /compass/evaluate': COMPASS_PICK_SCHEMA,
  'POST /compass/pick/:id/feedback': objectSchema({
    outcome: { type: 'string', enum: ['started', 'completed', 'dismissed', 'declined', 'abandoned'] },
    score: { type: 'number', minimum: 0, maximum: 10 },
    completion_state: { type: 'string', enum: ['completed', 'in_progress', 'stopped'] },
    disposition: { type: 'string', enum: ['undecided', 'retain', 'apply', 'reference', 'drop'] },
    reason_tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 8 },
    reflection: { type: 'string', maxLength: 10000 }, expected: { type: 'string', maxLength: 2000 }, actual: { type: 'string', maxLength: 2000 },
    effort: { type: 'string', enum: ['light', 'moderate', 'deep'] }, length_minutes: { type: 'integer', minimum: 0, maximum: 100000 },
  }, ['outcome']),
  'POST /notes': objectSchema({ title: { type: 'string', minLength: 1 }, recommendation_id: { type: 'string' }, thread_id: { type: 'string' }, stage_id: { type: 'string' }, lesson_id: { type: 'string' }, kind: { type: 'string' }, status: { type: 'string' }, sections: { type: 'array', items: { type: 'object' } } }, ['title']),
  'POST /notes/:id/distillation/highlights': objectSchema({ section_key: { type: 'string', minLength: 1, maxLength: 120 }, block_index: { type: 'integer', minimum: 0 }, block_checksum: { type: 'string', minLength: 1, maxLength: 160 }, claim_text: { type: 'string', minLength: 1, maxLength: 4000 } }, ['section_key', 'block_index', 'block_checksum', 'claim_text']),
  'POST /notes/:id/distillation/syntheses': objectSchema({ synthesis_text: { type: 'string', minLength: 1, maxLength: 4000 } }, ['synthesis_text']),
  'POST /learning/core/units/:id/relations': objectSchema({ target_unit_id: { type: 'string', minLength: 1 }, relation_type: { type: 'string', enum: ['supports', 'contradicts', 'qualifies', 'example_of', 'depends_on', 'applies_to'] }, confidence: { type: 'number', minimum: 0, maximum: 1 }, why: { type: 'string', minLength: 1, maxLength: 4000 }, source_anchor_id: { type: 'string', minLength: 1 }, target_anchor_id: { type: 'string', minLength: 1 } }, ['target_unit_id', 'relation_type', 'why', 'source_anchor_id']),
  'PATCH /learning/core/contradictions/:id': objectSchema({ review_state: { type: 'string', enum: ['accepted', 'resolved', 'dismissed'] }, resolution: { type: 'string', maxLength: 4000 } }, ['review_state']),
  'PATCH /brain/resurfacing/:recommendationId/preference': objectSchema({ starred: { type: 'boolean' } }, ['starred']),
  'POST /brain/resurfacing/presentations': objectSchema({ recommendation_id: { type: 'string', minLength: 1, maxLength: 100 } }, ['recommendation_id']),
  'POST /brain/resurfacing/:eventId/action': objectSchema({ action: { type: 'string', enum: ['reviewed', 'snooze', 'dismissed'] } }, ['action']),
  'POST /recommendations/map': objectSchema({ ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }, branch_id: { type: 'string', minLength: 1 } }, ['ids', 'branch_id']),
  'PATCH /recommendations/:id/source-url': objectSchema({ source_url: { type: 'string', format: 'uri' } }, ['source_url']),
  'PATCH /recommendations/content-types': objectSchema({
    ids: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 100 }, minItems: 1, maxItems: 500, uniqueItems: true },
    content_type: { type: 'string', enum: ['video'] },
    expected_content_types: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 80 }, minItems: 1, uniqueItems: true },
  }, ['ids', 'content_type', 'expected_content_types']),
  'POST /learning/core/threads/:id/stages/:stageId/lessons': objectSchema({ position: { type: 'integer', minimum: 0 }, title: { type: 'string', minLength: 1 }, description: { type: 'string' }, objective: { type: 'string' }, content: { type: 'string' }, estimated_minutes: { type: 'integer', minimum: 1, maximum: 600 }, legacy_item_id: { type: 'string' }, why_learn: { type: 'string' }, why_now: { type: 'string' }, takeaway: { type: 'string' } }, ['title']),
  'PATCH /learning/core/threads/:id/lessons/:lessonId': objectSchema({
    status: {
      type: 'string',
      enum: ['not_started', 'in_progress', 'completed'],
      description: 'Direct learner-confirmed lesson state. Send not_started to reopen a completed lesson.',
    },
    why_learn: { type: 'string', maxLength: 4000 },
    why_now: { type: 'string', maxLength: 4000 },
    takeaway: { type: 'string', maxLength: 4000 },
    content: { type: 'string', maxLength: 12000 },
  }, ['status']),
  'POST /learning/core/threads/:id/lessons/:lessonId/sources': objectSchema({ recommendation_id: { type: 'string', minLength: 1 }, role: { type: 'string', enum: ['primary', 'case', 'challenge', 'reference', 'optional'] }, position: { type: 'integer', minimum: 0 }, branch_id: { type: 'string', minLength: 1 } }, ['recommendation_id', 'role', 'branch_id']),
  'POST /learning/core/canon/domains': objectSchema({ title: { type: 'string', minLength: 1 }, slug: { type: 'string' }, kind: { type: 'string', enum: ['family', 'domain'] }, parent_id: { type: 'string' }, branch_id: { type: 'string', minLength: 1 }, boundary: { type: 'string', minLength: 1 }, orientation: { type: 'string' }, sort_order: { type: 'integer' } }, ['title', 'branch_id', 'boundary']),
  'PATCH /learning/core/canon/domains/:id': objectSchema({ title: { type: 'string' }, boundary: { type: 'string' }, orientation: { type: 'string' }, branch_id: { type: 'string' }, curation_status: { type: 'string', enum: ['unmapped', 'curating', 'complete'] }, validation_state: { type: 'string', enum: ['untested', 'exploring', 'field_tested'] }, sort_order: { type: 'integer' } }),
  'PUT /learning/core/canon/domains/:id/entries/:role': objectSchema({ title: { type: 'string', minLength: 1 }, author: { type: 'string', minLength: 1 }, canonical_url: { type: 'string', format: 'uri' }, isbn: { type: 'string' }, why_slot: { type: 'string', minLength: 1 }, beginner_case: { type: 'string', minLength: 1 }, expert_case: { type: 'string', minLength: 1 }, unique_contribution: { type: 'string', minLength: 1 }, limitations: { type: 'string', minLength: 1 }, difficulty: { type: 'string', minLength: 1 }, rejected_alternative: { type: 'string', minLength: 1 }, rejection_reason: { type: 'string', minLength: 1 }, evidence: { type: 'array', minItems: 1 }, recommendation_id: { type: 'string' }, editorial_status: { type: 'string', enum: ['draft', 'reviewed', 'approved'] }, validation_state: { type: 'string', enum: ['untested', 'exploring', 'field_tested'] }, replacement_reason: { type: 'string' } }, ['title', 'author', 'why_slot', 'beginner_case', 'expert_case', 'unique_contribution', 'limitations', 'difficulty', 'rejected_alternative', 'rejection_reason']),
  'POST /learning/srs/review': objectSchema({ card_id: { type: 'string', minLength: 1 }, grade: { type: 'integer', minimum: 0, maximum: 5 } }, ['card_id', 'grade']),
  'PUT /srs/drafts/:id': objectSchema({ question: { type: 'string', minLength: 1, description: 'Recall question written primarily in Arabic.' }, answer: { type: 'string', minLength: 1, description: 'Recall answer written primarily in Arabic.' }, topic: { type: 'string' }, branch: { type: 'string' }, card_type: { type: 'string' }, source_anchor: { type: 'string' } }),
  'POST /learning/srs/create': objectSchema({ thread_id: { type: 'string' }, stage_id: { type: 'string' }, lesson_id: { type: 'string' }, note_id: { type: 'string' }, recommendation_id: { type: 'string' }, question: { type: 'string', minLength: 1, description: 'Recall question written primarily in Arabic.' }, answer: { type: 'string', minLength: 1, description: 'Recall answer written primarily in Arabic.' }, topic: { type: 'string' }, branch: { type: 'string' } }, ['question', 'answer']),
  'POST /notebooklm/learning/route': objectSchema({
    recommendation_id: { type: 'string', minLength: 1 },
    purpose: { type: 'string', enum: ['learn', 'orientation', 'review', 'teach-back', 'presentation'] },
    requested_formats: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    concept_features: { type: 'array', items: { type: 'string', enum: ['hierarchy', 'causality', 'taxonomy', 'mechanism', 'process', 'comparison', 'data', 'spatial', 'motion', 'sequence', 'procedure', 'demonstration'] }, maxItems: 12 },
  }, ['recommendation_id']),
  'POST /notebooklm/learning/receipts': objectSchema({
    kind: { type: 'string', enum: ['source', 'artifact'] },
    recommendation_id: { type: 'string', minLength: 1 },
    notebook_id: { type: 'string', minLength: 1 },
    notebook_url: { type: 'string', format: 'uri' },
    status: { type: 'string', enum: ['pending', 'indexed', 'ready', 'failed'] },
    plan_id: { type: 'string' },
    format: { type: 'string' },
    provider_source_id: { type: 'string' },
    provider_task_id: { type: 'string' },
    provider_artifact_id: { type: 'string' },
    source_grounded: { type: 'boolean' },
    custom_prompt_applied: { type: 'boolean' },
    language: { type: 'string' },
    question_count: { type: 'integer' },
    hints_before_explanations: { type: 'boolean' },
    transfer_question_count: { type: 'integer' },
    error: { type: 'string' },
  }, ['kind', 'recommendation_id', 'notebook_id', 'notebook_url', 'status']),
  'POST /agent/jobs/reconcile': objectSchema({ apply: { type: 'boolean', description: 'False performs a dry reconciliation report; true applies only the conservative declared repairs.' } }),
  'POST /agent/jobs/:id/claim': objectSchema({ worker: { type: 'string', minLength: 1, maxLength: 120, description: 'Stable lease owner reused for heartbeat, checkpoint, completion, and failure.' } }, ['worker']),
  'POST /agent/jobs/:id/checkpoint': objectSchema({
    worker: { type: 'string', minLength: 1, maxLength: 120 },
    step: { type: 'string', minLength: 1, maxLength: 120, description: 'The next workflow step declared by the exact job payload.' },
    evidence: { type: 'object', description: 'Step-specific deterministic evidence required by the job contract.' },
  }, ['worker', 'step', 'evidence']),
  'POST /agent/jobs/:id/complete': objectSchema({ worker: { type: 'string', minLength: 1, maxLength: 120, description: 'Must match the active lease owner; all other fields are job-output-contract specific.' } }, ['worker']),
  'POST /agent/jobs/:id/fail': objectSchema({ worker: { type: 'string', minLength: 1, maxLength: 120 }, error: { type: 'string', minLength: 1, maxLength: 1000 } }, ['worker', 'error']),
  'POST /agent/jobs/:id/replay': objectSchema({}, []),
  'POST /agent/jobs/:id/cancel': objectSchema({}, []),
  'POST /agent/jobs/:id/heartbeat': objectSchema({ worker: { type: 'string', minLength: 1, maxLength: 120 } }, ['worker']),
  'PATCH /learning/core/threads/:id/projects/:projectId': objectSchema({ status: { type: 'string', enum: ['not_started', 'in_progress', 'completed', 'deferred'] } }, ['status']),
  'PATCH /learning/core/threads/:id/stages/:stageId': objectSchema({ position: { type: 'integer', minimum: 0 }, title: { type: 'string' }, objective: { type: 'string' }, description: { type: 'string' }, stage_type: { type: 'string', enum: ['orientation', 'curriculum', 'application', 'advanced'] }, output_description: { type: 'string' } }),
  'POST /agent/request': objectSchema({
    method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    path: { type: 'string', pattern: '^/' },
    body: { type: 'object' },
    dry_run: { type: 'boolean' },
    confirm: { type: 'boolean' },
    idempotency_key: { type: 'string', maxLength: 120 },
    precondition: { $ref: '#/components/schemas/AgentAssertion' },
    verify: { $ref: '#/components/schemas/AgentAssertion' },
  }, ['method', 'path']),
  'POST /analytics/hermes/improvements': objectSchema({ conversation_id: { type: 'string' }, layer: { type: 'string' }, risk_level: { type: 'string' }, confidence: { type: 'number' }, evidence: { type: 'array' }, before: { type: 'object' } }, ['conversation_id']),
}

const VERIFICATION_OVERRIDES: Record<string, string | null> = {
  'POST /capture': '/capture/:id',
  'POST /capture/personal': '/capture/personal/:id',
  'PATCH /capture/personal/:id': '/capture/personal/:id',
  'POST /hardcover/sync': '/hardcover',
  'POST /hardcover/import': '/hardcover',
  'POST /capture/feeds': '/capture/feeds',
  'POST /capture/feeds/sync': '/capture/feeds',
  'POST /capture/feeds/:id/sync': '/capture/feeds/:id/entries',
  'POST /annotations': '/annotations/:id',
  'POST /annotations/:id/archive': '/annotations/:id',
  'POST /capture/:id/triage': '/capture/:id/record',
  'POST /capture/:id/visualise': '/capture/:id/record',
  'POST /feedback/record': '/capture/:id/record',
  'POST /compass/picks': '/compass/pick/:pick_id',
  'POST /sessions/start': '/sessions',
  'POST /recommendations/map': '/capture/:id/record',
  'PATCH /brain/resurfacing/:recommendationId/preference': '/brain/resurfacing',
  'POST /brain/resurfacing/presentations': '/brain/resurfacing',
  'POST /brain/resurfacing/:eventId/action': '/brain/resurfacing',
  'POST /recommendations/action': '/capture/:id/record',
  'PATCH /recommendations/:id/source-url': '/capture/:id/record',
  'PATCH /recommendations/content-types': null,
  'DELETE /recommendations/:id/permanent': '/recommendations/list',
  'POST /brain/branch-swipe': '/brain/branch-deck',
  'PUT /brain/profile/assertions/:key': '/brain/profile/intelligence',
  'POST /learning/core/threads': '/learning/core/threads/:id',
  'POST /notes/:id/distillation/highlights': '/notes/:id',
  'POST /notes/:id/distillation/syntheses': '/notes/:id',
  'POST /notes/:id/distillation/highlights/:highlightId/promote': '/notes/:id',
  'DELETE /notes/:id': '/notes/:id',
  'POST /learning/core/units/:id/relations': '/learning/core/units/:id',
  'PATCH /learning/core/contradictions/:id': '/learning/core/contradictions',
  'PATCH /learning/core/threads/:id': '/learning/core/threads/:id',
  'POST /learning/core/threads/:id/status': '/learning/core/threads/:id',
  'POST /learning/core/threads/:id/stages/:stageId/start': '/learning/core/threads/:id/path',
  'POST /learning/core/threads/:id/stages': '/learning/core/threads/:id/path',
  'PATCH /learning/core/threads/:id/stages/:stageId': '/learning/core/threads/:id/path',
  'POST /learning/core/threads/:id/stages/:stageId/sources': '/learning/core/threads/:id/path',
  'POST /learning/core/threads/:id/stages/:stageId/lessons': '/learning/core/threads/:id/path',
  'PATCH /learning/core/threads/:id/lessons/:lessonId': '/learning/core/threads/:id/path',
  'POST /learning/core/threads/:id/lessons/:lessonId/sources': '/learning/core/threads/:id/path',
  'PATCH /learning/core/threads/:id/projects/:projectId': '/learning/core/threads/:id/path',
  'POST /learning/core/threads/:id/sources': '/learning/core/threads/:id/path',
  'DELETE /learning/core/threads/:id/sources/:sourceId': '/learning/core/threads/:id/path',
  'DELETE /learning/core/threads/:id': '/learning/core/threads',
  'POST /learning/core/canon/domains': '/learning/core/canon/domains/:id',
  'PATCH /learning/core/canon/domains/:id': '/learning/core/canon/domains/:id',
  'PUT /learning/core/canon/domains/:id/entries/:role': '/learning/core/canon/domains/:id',
  'POST /learning/core/canon/entries/:id/capture': '/learning/core/canon/entries/:id',
  'POST /learning/core/canon/domains/:id/thread': '/learning/core/canon/domains/:id',
  'POST /learning/srs/review': '/learning/srs/cards/:card_id',
  'POST /learning/srs/create': '/learning/srs/cards/:card_id',
  'POST /notebooklm/learning/route': '/notebooklm/learning/receipts?recommendation_id=:recommendation_id',
  'POST /notebooklm/learning/receipts': '/notebooklm/learning/receipts?recommendation_id=:recommendation_id',
  'POST /agent/jobs/reconcile': '/agent/jobs/active',
  'POST /agent/jobs/:id/claim': '/agent/jobs/:id',
  'POST /agent/jobs/:id/checkpoint': '/agent/jobs/:id',
  'POST /agent/jobs/:id/complete': '/agent/jobs/:id',
  'POST /agent/jobs/:id/fail': '/agent/jobs/:id',
  'POST /agent/jobs/:id/replay': '/agent/jobs/:id',
  'POST /agent/jobs/:id/cancel': '/agent/jobs/:id',
  'POST /agent/jobs/:id/heartbeat': '/agent/jobs/:id',
  'PUT /settings/:key': '/settings',
  'PUT /dashboard/layout': '/dashboard/layout',
}

const PRECONDITION_OVERRIDES: Record<string, string[]> = {
  'POST /capture/:id/triage': ['Read the exact capture before changing Queue state.', 'Queue cap and branch preflight must pass.'],
  'DELETE /recommendations/:id/permanent': ['Target must be archived/non-active.', 'Explicit irreversible confirmation is required.'],
  'DELETE /notes/:id': ['Read and resolve the exact note before irreversible deletion.', 'Explicit destructive intent is required.'],
  'DELETE /learning/core/threads/:id': ['Read the exact Thread and require explicit destructive intent.'],
  'POST /compass/pick/:id/start': ['The pick must be ready and Queue must be below the cap.'],
  'POST /learning/srs/review': ['The learner must supply or confirm the recall grade.', 'Confirm the exact card state before recording the review.'],
}

const PRECONDITION_PATH_OVERRIDES: Record<string, string> = {
  'DELETE /recommendations/:id/permanent': '/capture/:id/record',
  'DELETE /notes/:id': '/notes/:id',
  'DELETE /learning/core/threads/:id': '/learning/core/threads/:id',
  'POST /learning/srs/review': '/learning/srs/cards/:id',
  'POST /analytics/hermes/engine/activate': '/analytics/hermes/engine',
  'POST /analytics/hermes/recalibrate': '/analytics/hermes/engine',
  'POST /analytics/hermes/repair': '/analytics/hermes/repair',
  'POST /notifications/test': '/notifications',
}

const VERIFICATION_ID_SOURCES: Record<string, string[]> = {
  'POST /capture': ['response.id'],
  'POST /capture/personal': ['response.item.id'],
  'PATCH /capture/personal/:id': ['response.item.id'],
  'POST /feedback/record': ['body.recommendation_id', 'response.recommendation_id', 'response.source.id'],
  'POST /compass/picks': ['response.pick_id'],
  'POST /recommendations/map': ['body.ids', 'body.id', 'response.sources.*.id'],
  'POST /recommendations/action': ['body.ids', 'body.id', 'response.ids'],
  'PATCH /recommendations/:id/source-url': ['response.id'],
  'POST /learning/core/threads': ['response.id'],
  'POST /learning/core/canon/domains': ['response.id'],
  'POST /learning/srs/review': ['body.card_id'],
  'POST /learning/srs/create': ['response.card_id'],
  'POST /notebooklm/learning/route': ['body.recommendation_id'],
  'POST /notebooklm/learning/receipts': ['body.recommendation_id'],
}

const valuesAt = (value: any, pointer: string): string[] => {
  const parts = pointer.split('.')
  const visit = (current: any, index: number): any[] => {
    if (current == null) return []
    if (index >= parts.length) return Array.isArray(current) ? current : [current]
    const part = parts[index]
    if (part === '*') return Array.isArray(current) ? current.flatMap((item) => visit(item, index + 1)) : []
    return visit(current[part], index + 1)
  }
  return visit(value, 0).filter((item) => typeof item === 'string' && item.length > 0)
}

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const capabilityPathSource = (path: string, capture = false) => path.split('/').map((segment) =>
  /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment) ? (capture ? '([^/?#]+)' : '[^/?#]+') : escapePattern(segment),
).join('/')

export const agentCapabilityPathPattern = (path: string) => new RegExp(`^${capabilityPathSource(path)}(?:\\?[^#]*)?$`)

export const agentReadbackPathPattern = (template: string) => {
  let source = ''
  let cursor = 0
  for (const match of template.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)) {
    source += escapePattern(template.slice(cursor, match.index)) + '[^/?#&]+'
    cursor = Number(match.index) + match[0].length
  }
  source += escapePattern(template.slice(cursor))
  return new RegExp(`^${source}$`)
}

const decodePathPart = (value: string) => {
  try { return decodeURIComponent(value) } catch { return value }
}

export function resolveCapabilityReadbacks(key: string, template: string | null, capabilityPath: string, concretePath: string, body?: any, response?: any) {
  if (!template) return [] as string[]
  const names = [...capabilityPath.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1])
  let concretePathname = concretePath.split(/[?#]/, 1)[0]
  try { concretePathname = new URL(concretePath, 'https://agent.invalid').pathname } catch { /* use the bounded path fallback */ }
  const pattern = new RegExp(`^${capabilityPathSource(capabilityPath, true)}$`)
  const concreteValues = concretePathname.match(pattern)?.slice(1).map(decodePathPart) || []
  const params = Object.fromEntries(names.map((name, index) => [name, concreteValues[index]]))
  const placeholders = [...template.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1])
  if (!placeholders.length) return [template]
  const placeholder = placeholders[0]
  const direct = params[placeholder] || body?.[placeholder]
  const configured = (VERIFICATION_ID_SOURCES[key] || []).flatMap((source) => {
    const [root, ...rest] = source.split('.')
    return valuesAt(root === 'body' ? body : response, rest.join('.'))
  })
  const values = [...new Set([...(direct ? [direct] : []), ...configured])]
  return values.map((value) => template.replace(new RegExp(`:${placeholder}(?![A-Za-z0-9_])`), encodeURIComponent(String(value))))
}

const segmentDomain = (path: string) => {
  if (path.startsWith('/learning/core')) return 'learning-core'
  if (path.startsWith('/learning/srs') || path.startsWith('/srs')) return 'recall'
  if (path.startsWith('/analytics/hermes')) return 'self-evolution'
  if (path.startsWith('/agent/jobs')) return 'jobs'
  if (path.startsWith('/agent/memory')) return 'memory'
  return path.split('/').filter(Boolean)[0] || 'system'
}

const deriveIntent = (method: AgentMethod, path: string) => {
  if (method === 'GET') return 'read'
  if (method === 'DELETE' || /\/delete(?:\/|$)|\/permanent(?:\/|$)/.test(path)) return 'delete'
  if (/\/revert|\/undo/.test(path)) return 'undo'
  if (/\/verify|\/approve|\/complete/.test(path)) return 'verify'
  if (/\/process|\/sync|\/replay|\/recover/.test(path)) return 'process'
  if (method === 'POST' && !/:id|action|status|map|swipe|feedback/.test(path)) return 'create'
  return 'update'
}

const deriveRisk = (method: AgentMethod, path: string) => {
  if (method === 'GET') return 'low'
  if (/permanent|\/learning\/core\/threads\/:id$|\/notes\/:id$|engine\/activate|recalibrate|repair|notifications\/test/.test(path)) return 'high'
  if (path === '/learning/srs/review' || /\/verify$/.test(path) || /\/stages\/[^/]+\/start$/.test(path)) return 'high'
  return 'medium'
}

const reversible = (method: AgentMethod, path: string) => {
  if (/permanent|\/threads\/:id$|\/artifacts\/:id$|\/notes\/:id$|\/learning\/srs\/cards\/:id$/.test(path)) return false
  return method !== 'DELETE' || /feeds/.test(path)
}

export function buildCapabilityCatalog(capabilities: readonly CapabilityTuple[], filters: { domain?: string; intent?: string; method?: string; q?: string } = {}) {
  const q = String(filters.q || '').trim().toLowerCase()
  return capabilities.map(([method, path, description]) => {
    const key = `${method} ${path}`
    const domain = segmentDomain(path)
    const intent = deriveIntent(method, path)
    const risk = deriveRisk(method, path)
    const requestBodySchema = BODY_SCHEMAS[key] || (method === 'GET' || method === 'DELETE' ? null : objectSchema())
    const requiredFields = Array.isArray((requestBodySchema as any)?.required) ? (requestBodySchema as any).required : []
    return {
      method,
      path,
      description,
      domain,
      intent,
      risk,
      reversible: reversible(method, path),
      explicit_confirmation_required: risk === 'high',
      idempotency_supported: method !== 'GET',
      dry_run_supported: method !== 'GET',
      preconditions: PRECONDITION_OVERRIDES[key] || (method === 'GET' ? [] : ['Read the exact target before mutation.']),
      precondition_path: PRECONDITION_PATH_OVERRIDES[key] ?? null,
      verification_path: VERIFICATION_OVERRIDES[key] ?? null,
      required_fields: requiredFields,
      request_body_schema: requestBodySchema,
      response_schema: objectSchema(),
    }
  }).filter((item) => {
    if (filters.domain && item.domain !== filters.domain) return false
    if (filters.intent && item.intent !== filters.intent) return false
    if (filters.method && item.method !== filters.method.toUpperCase()) return false
    return !q || `${item.method} ${item.path} ${item.description} ${item.domain} ${item.intent}`.toLowerCase().includes(q)
  })
}

export function buildAgentOpenApi(origin: string, capabilities: readonly CapabilityTuple[]) {
  const catalog = buildCapabilityCatalog(capabilities)
  const paths: Record<string, Record<string, unknown>> = {}
  for (const capability of catalog) {
    const parameters: any[] = [...capability.path.matchAll(/:([^/]+)/g)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string', minLength: 1 },
    }))
    if (capability.method !== 'GET') parameters.push({
      name: 'x-client-mutation-id',
      in: 'header',
      required: false,
      description: 'Stable retry key for direct product mutations. Generic /agent/request uses body idempotency_key instead.',
      schema: { type: 'string', maxLength: 120 },
    })
    const openApiPath = capability.path.replace(/:([^/]+)/g, '{$1}')
    const operation: Record<string, unknown> = {
      operationId: `${capability.method.toLowerCase()}_${capability.path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
      summary: capability.description,
      tags: [capability.domain],
      parameters,
      'x-intent': capability.intent,
      'x-risk': capability.risk,
      'x-reversible': capability.reversible,
      'x-precondition-path': capability.precondition_path,
      'x-verification-path': capability.verification_path,
      responses: {
        '200': { description: 'Successful JSON response', content: { 'application/json': { schema: capability.response_schema } } },
        '400': { $ref: '#/components/responses/ValidationError' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
        '422': { $ref: '#/components/responses/ValidationError' },
        '429': { $ref: '#/components/responses/RateLimited' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    }
    if (capability.request_body_schema) operation.requestBody = {
      required: capability.required_fields.length > 0,
      content: { 'application/json': { schema: capability.request_body_schema } },
    }
    ;(paths[openApiPath] ||= {})[capability.method.toLowerCase()] = operation
  }
  paths['/agent/request'] = {
    post: {
      operationId: 'agent_request',
      summary: 'Dry-run or execute one allow-listed capability with protocol-v2 safeguards.',
      tags: ['agent-control'],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentRequest' } } } },
      responses: {
        '200': { description: 'Dry-run or verified operation receipt', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentReceipt' } } } },
        '400': { $ref: '#/components/responses/ValidationError' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  }
  const errorSchema = objectSchema({ error: { type: 'string' }, message: { type: 'string' } }, ['error'])
  return {
    openapi: '3.1.0',
    info: { title: 'Learning Compass Agent API', version: AGENT_CONTRACT_VERSION },
    servers: [{ url: origin }],
    paths,
    components: {
      schemas: {
        AgentAssertion: objectSchema({ path: { type: 'string', pattern: '^/' }, field: { type: 'string', minLength: 1 }, equals: {} }, ['path', 'field', 'equals']),
        AgentRequest: BODY_SCHEMAS['POST /agent/request'],
        AgentReceipt: objectSchema({ intent: { type: 'string' }, target: { type: 'string' }, before: {}, mutation_or_job: {}, after: {}, evidence: { type: 'array' }, blocker: {} }, ['intent', 'target', 'before', 'mutation_or_job', 'after', 'evidence', 'blocker']),
      },
      responses: {
        ValidationError: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
        Forbidden: { description: 'Operation is not allowed', content: { 'application/json': { schema: errorSchema } } },
        NotFound: { description: 'Target not found', content: { 'application/json': { schema: errorSchema } } },
        Conflict: { description: 'Product gate or optimistic precondition failed', content: { 'application/json': { schema: errorSchema } } },
        RateLimited: { description: 'Rate limit exceeded', content: { 'application/json': { schema: errorSchema } } },
        ServerError: { description: 'Unexpected server error', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  }
}
