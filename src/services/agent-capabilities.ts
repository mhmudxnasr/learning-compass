export const AGENT_CONTRACT_VERSION = '2026-08-17'
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
  'POST /capture': objectSchema({ source: { type: 'string', minLength: 1 }, title: { type: 'string' }, artifact_id: { type: 'string' } }, ['source']),
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
  'POST /feedback/record': objectSchema({ recommendation_id: { type: 'string' }, source: { type: 'string' }, feedback: { type: 'string' }, rating: { type: 'number', minimum: 0, maximum: 10 }, disposition: { type: 'string', enum: ['retain', 'apply', 'reference', 'drop'] }, complete: { type: 'boolean' } }, ['feedback']),
  'POST /recommendations/map': objectSchema({ ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 }, branch_id: { type: 'string', minLength: 1 } }, ['ids', 'branch_id']),
  'POST /learning/core/evidence': objectSchema({ thread_id: { type: 'string' }, unit_id: { type: 'string' }, stage_id: { type: 'string' }, evidence_type: { type: 'string' }, result: { type: 'string' }, response: { type: 'string' }, proof_ref: { type: 'string' } }, ['evidence_type', 'result']),
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
  'POST /learning/core/evidence': '/learning/core/threads/:thread_id',
  'PUT /settings/:key': '/settings',
  'PUT /dashboard/layout': '/dashboard/layout',
}

const PRECONDITION_OVERRIDES: Record<string, string[]> = {
  'POST /capture/:id/triage': ['Read the exact capture before changing Queue state.', 'Queue cap and branch preflight must pass.'],
  'DELETE /recommendations/:id/permanent': ['Target must be archived/non-active.', 'Explicit irreversible confirmation is required.'],
  'DELETE /learning/core/threads/:id': ['Read the exact Thread and require explicit destructive intent.'],
  'POST /compass/pick/:id/start': ['The pick must be ready and Queue must be below the cap.'],
  'POST /learning/core/threads/:id/verify': ['Final synthesis and every evidence requirement must be complete.'],
}

const PRECONDITION_PATH_OVERRIDES: Record<string, string> = {
  'DELETE /recommendations/:id/permanent': '/capture/:id/record',
  'DELETE /learning/core/threads/:id': '/learning/core/threads/:id',
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
  if (key === 'POST /learning/core/evidence' && !body?.thread_id) {
    if (response?.recommendation_id) return [`/capture/${encodeURIComponent(response.recommendation_id)}/record`]
    return ['/learning/core/units']
  }
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
