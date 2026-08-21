export const AGENT_CONTRACT_VERSION = '2026-08-22'
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

const BODY_SCHEMAS: Record<string, JsonSchema> = {
  'POST /capture': objectSchema({ source: { type: 'string', minLength: 1 }, title: { type: 'string' }, artifact_id: { type: 'string' }, branch_id: { type: 'string', minLength: 1 }, branch_reason: { type: 'string', maxLength: 500 } }, ['source', 'branch_id']),
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
  'POST /capture/:id/triage': objectSchema({ action: { type: 'string', enum: ['queue', 'exclude'] }, override_queue_cap: { type: 'boolean' } }, ['action']),
  'POST /sessions/start': objectSchema({ recommendation_id: { type: 'string' }, thread_id: { type: 'string' }, target_kind: { type: 'string' }, target_artifact_id: { type: 'string' } }, ['recommendation_id', 'thread_id', 'target_kind']),
  'POST /feedback/record': objectSchema({
    recommendation_id: { type: 'string' }, source_url: { type: 'string', format: 'uri' }, title: { type: 'string' }, thread_id: { type: 'string' },
    feedback: { type: 'string', minLength: 1, maxLength: 10000 }, score: { type: 'number', minimum: 0, maximum: 10 },
    completion_state: { type: 'string', enum: ['completed', 'in_progress', 'stopped'] },
    disposition: { type: 'string', enum: ['undecided', 'retain', 'apply', 'reference', 'drop'] },
    reason_tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 8 },
    expected: { type: 'string', maxLength: 2000 }, actual: { type: 'string', maxLength: 2000 },
    effort: { type: 'string', enum: ['light', 'moderate', 'deep'] }, length_minutes: { type: 'integer', minimum: 0, maximum: 100000 },
  }, ['feedback']),
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
  'POST /recommendations/map': objectSchema({ ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }, branch_id: { type: 'string', minLength: 1 } }, ['ids', 'branch_id']),
  'POST /learning/core/threads/:id/stages/:stageId/lessons': objectSchema({ position: { type: 'integer', minimum: 0 }, title: { type: 'string', minLength: 1 }, description: { type: 'string' }, objective: { type: 'string' }, content: { type: 'string' }, estimated_minutes: { type: 'integer', minimum: 1, maximum: 600 }, legacy_item_id: { type: 'string' }, why_learn: { type: 'string' }, why_now: { type: 'string' }, takeaway: { type: 'string' } }, ['title']),
  'POST /learning/core/threads/:id/lessons/:lessonId/sources': objectSchema({ recommendation_id: { type: 'string', minLength: 1 }, role: { type: 'string', enum: ['primary', 'case', 'challenge', 'reference', 'optional'] }, position: { type: 'integer', minimum: 0 }, branch_id: { type: 'string', minLength: 1 } }, ['recommendation_id', 'role', 'branch_id']),
  'POST /learning/core/canon/domains': objectSchema({ title: { type: 'string', minLength: 1 }, slug: { type: 'string' }, kind: { type: 'string', enum: ['family', 'domain'] }, parent_id: { type: 'string' }, branch_id: { type: 'string', minLength: 1 }, boundary: { type: 'string', minLength: 1 }, orientation: { type: 'string' }, sort_order: { type: 'integer' } }, ['title', 'branch_id', 'boundary']),
  'PATCH /learning/core/canon/domains/:id': objectSchema({ title: { type: 'string' }, boundary: { type: 'string' }, orientation: { type: 'string' }, branch_id: { type: 'string' }, curation_status: { type: 'string', enum: ['unmapped', 'curating', 'complete'] }, validation_state: { type: 'string', enum: ['untested', 'exploring', 'field_tested'] }, sort_order: { type: 'integer' } }),
  'PUT /learning/core/canon/domains/:id/entries/:role': objectSchema({ title: { type: 'string', minLength: 1 }, author: { type: 'string', minLength: 1 }, canonical_url: { type: 'string', format: 'uri' }, isbn: { type: 'string' }, why_slot: { type: 'string', minLength: 1 }, beginner_case: { type: 'string', minLength: 1 }, expert_case: { type: 'string', minLength: 1 }, unique_contribution: { type: 'string', minLength: 1 }, limitations: { type: 'string', minLength: 1 }, difficulty: { type: 'string', minLength: 1 }, rejected_alternative: { type: 'string', minLength: 1 }, rejection_reason: { type: 'string', minLength: 1 }, evidence: { type: 'array', minItems: 1 }, recommendation_id: { type: 'string' }, editorial_status: { type: 'string', enum: ['draft', 'reviewed', 'approved'] }, validation_state: { type: 'string', enum: ['untested', 'exploring', 'field_tested'] }, replacement_reason: { type: 'string' } }, ['title', 'author', 'why_slot', 'beginner_case', 'expert_case', 'unique_contribution', 'limitations', 'difficulty', 'rejected_alternative', 'rejection_reason']),
  'POST /learning/srs/review': objectSchema({ card_id: { type: 'string', minLength: 1 }, grade: { type: 'integer', minimum: 0, maximum: 5 } }, ['card_id', 'grade']),
  'POST /learning/srs/create': objectSchema({ thread_id: { type: 'string' }, stage_id: { type: 'string' }, lesson_id: { type: 'string' }, note_id: { type: 'string' }, recommendation_id: { type: 'string' }, question: { type: 'string', minLength: 1 }, answer: { type: 'string', minLength: 1 }, topic: { type: 'string' }, branch: { type: 'string' } }, ['question', 'answer']),
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
  'POST /annotations': '/annotations/:id',
  'POST /annotations/:id/archive': '/annotations/:id',
  'POST /capture/:id/triage': '/capture/:id/record',
  'POST /capture/:id/visualise': '/capture/:id/record',
  'POST /feedback/record': '/capture/:id/record',
  'POST /sessions/start': '/sessions',
  'POST /recommendations/map': '/capture/:id/record',
  'POST /recommendations/action': '/capture/:id/record',
  'DELETE /recommendations/:id/permanent': '/recommendations/list',
  'POST /brain/branch-swipe': '/brain/branch-deck',
  'PUT /brain/profile/assertions/:key': '/brain/profile/intelligence',
  'POST /learning/core/threads': '/learning/core/threads/:id',
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
  'PUT /settings/:key': '/settings',
  'PUT /dashboard/layout': '/dashboard/layout',
}

const PRECONDITION_OVERRIDES: Record<string, string[]> = {
  'POST /capture/:id/triage': ['Read the exact capture before changing Queue state.', 'Queue cap and branch preflight must pass.'],
  'DELETE /recommendations/:id/permanent': ['Target must be archived/non-active.', 'Explicit irreversible confirmation is required.'],
  'DELETE /learning/core/threads/:id': ['Read the exact Thread and require explicit destructive intent.'],
  'POST /compass/pick/:id/start': ['The pick must be ready and Queue must be below the cap.'],
  'POST /learning/srs/review': ['The learner must supply or confirm the recall grade.', 'Confirm the exact card state before recording the review.'],
}

const PRECONDITION_PATH_OVERRIDES: Record<string, string> = {
  'DELETE /recommendations/:id/permanent': '/capture/:id/record',
  'DELETE /learning/core/threads/:id': '/learning/core/threads/:id',
  'POST /learning/srs/review': '/learning/srs/cards/:id',
  'POST /analytics/hermes/engine/activate': '/analytics/hermes/engine',
  'POST /analytics/hermes/recalibrate': '/analytics/hermes/engine',
  'POST /analytics/hermes/repair': '/analytics/hermes/repair',
  'POST /notifications/test': '/notifications',
}

const VERIFICATION_ID_SOURCES: Record<string, string[]> = {
  'POST /capture': ['response.id'],
  'POST /feedback/record': ['body.recommendation_id', 'response.recommendation_id', 'response.source.id'],
  'POST /recommendations/map': ['body.ids', 'body.id', 'response.sources.*.id'],
  'POST /recommendations/action': ['body.ids', 'body.id', 'response.ids'],
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

export function resolveCapabilityReadbacks(key: string, template: string | null, capabilityPath: string, concretePath: string, body?: any, response?: any) {
  if (!template) return [] as string[]
  const names = [...capabilityPath.matchAll(/:([^/]+)/g)].map((match) => match[1])
  const pattern = new RegExp('^' + capabilityPath.replace(/:[^/]+/g, '([^/]+)') + '(?:\\?.*)?$')
  const concreteValues = concretePath.match(pattern)?.slice(1) || []
  const params = Object.fromEntries(names.map((name, index) => [name, concreteValues[index]]))
  const placeholders = [...template.matchAll(/:([^/]+)/g)].map((match) => match[1])
  if (!placeholders.length) return [template]
  const placeholder = placeholders[0]
  const direct = params[placeholder] || body?.[placeholder]
  const configured = (VERIFICATION_ID_SOURCES[key] || []).flatMap((source) => {
    const [root, ...rest] = source.split('.')
    return valuesAt(root === 'body' ? body : response, rest.join('.'))
  })
  const values = [...new Set([...(direct ? [direct] : []), ...configured])]
  return values.map((value) => template.replace(`:${placeholder}`, encodeURIComponent(String(value))))
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
  if (/permanent|\/learning\/core\/threads\/:id$|engine\/activate|recalibrate|repair|notifications\/test/.test(path)) return 'high'
  if (path === '/learning/srs/review' || /\/verify$/.test(path) || /\/stages\/[^/]+\/start$/.test(path)) return 'high'
  return 'medium'
}

const reversible = (method: AgentMethod, path: string) => {
  if (/permanent|\/threads\/:id$|\/artifacts\/:id$|\/notes\/:id$|\/learning\/srs\/cards\/:id$/.test(path)) return false
  return method !== 'DELETE' || /feeds|collections/.test(path)
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
      ...(capability.method !== 'GET' ? { security: [{ ApiToken: [] }] } : {}),
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
      security: [{ ApiToken: [] }],
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
      securitySchemes: {
        ApiToken: { type: 'apiKey', in: 'header', name: 'x-api-token', description: 'Required for writes when API_TOKEN is configured.' },
      },
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
