import { normalizeUrlForDedup } from '../lib.ts'
import { validatePublicHttpUrl } from './public-url.ts'

export const SOURCE_HEALTH_STATUSES = ['verified', 'restricted', 'unavailable', 'unknown', 'invalid'] as const
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number]
export type SourceHealthPurpose = 'current' | 'replacement'

export type SourceHealthCheck = {
  status: SourceHealthStatus
  checked_url: string
  http_status?: number
  final_url?: string
  error_code?: string
}

export type RecordedSourceHealthCheck = SourceHealthCheck & {
  attempt_id: string
  checked_at: string
}

type SourceHealthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type VerificationOptions = {
  fetcher?: SourceHealthFetch
  headTimeoutMs?: number
  getTimeoutMs?: number
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const RESTRICTED_STATUSES = new Set([401, 403, 407, 406, 418, 423, 425, 429, 451])
const INVALID_URL_ERRORS = new Set([
  'invalid_public_url',
  'url_credentials_not_allowed',
  'private_or_local_url',
  'invalid_source_redirect',
  'too_many_source_redirects',
])

export const sourceHealthMatchesCurrentUrl = (checkedUrl: unknown, currentUrl: unknown) => {
  const checked = String(checkedUrl || '').trim()
  const current = String(currentUrl || '').trim()
  return Boolean(checked && current && normalizeUrlForDedup(checked) === normalizeUrlForDedup(current))
}

const safeAttemptUrl = (value: unknown) => {
  try {
    return validatePublicHttpUrl(value)
  } catch {
    try {
      const parsed = new URL(String(value || '').trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) return '[invalid-url]'
      parsed.username = ''
      parsed.password = ''
      parsed.hash = ''
      parsed.search = ''
      return parsed.toString()
    } catch {
      return '[invalid-url]'
    }
  }
}

const botChallengeResponse = (response: Response) => {
  const challenge = String(response.headers.get('cf-mitigated') || '').toLowerCase()
  return (
    challenge === 'challenge' ||
    Boolean(
      response.headers.get('x-captcha') ||
      response.headers.get('x-datadome') ||
      response.headers.get('x-sucuri-id') ||
      response.headers.get('x-akamai-session-info'),
    )
  )
}

const requestSignal = (timeoutMs: number) => AbortSignal.timeout(Math.max(1, timeoutMs))

async function fetchPublicSource(
  rawUrl: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  fetcher: SourceHealthFetch,
) {
  let current = validatePublicHttpUrl(rawUrl)
  const deadline = Date.now() + Math.max(250, timeoutMs)
  for (let redirect = 0; redirect <= 5; redirect++) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw new Error('source_check_timeout')
    const response = await fetcher(current, {
      method,
      redirect: 'manual',
      signal: requestSignal(remainingMs),
      headers: {
        'user-agent': 'LearningCompassVerifier/1.0',
        ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
      },
    })
    if (!REDIRECT_STATUSES.has(response.status)) return { response, finalUrl: current }
    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => {})
    if (!location || redirect === 5)
      throw new Error(redirect === 5 ? 'too_many_source_redirects' : 'invalid_source_redirect')
    current = validatePublicHttpUrl(new URL(location, current).toString())
  }
  throw new Error('too_many_source_redirects')
}

const classifyResponse = (response: Response, finalUrl: string): SourceHealthCheck => {
  const result = {
    checked_url: finalUrl,
    http_status: response.status,
    final_url: finalUrl,
  }
  if (botChallengeResponse(response) || RESTRICTED_STATUSES.has(response.status)) {
    return { status: 'restricted', error_code: 'access_restricted', ...result }
  }
  if (response.ok) return { status: 'verified', ...result }
  if ([404, 410].includes(response.status)) return { status: 'unavailable', error_code: 'not_found', ...result }
  return { status: 'unknown', error_code: 'unexpected_http_status', ...result }
}

/**
 * Check one public HTTP(S) URL without changing canonical source identity.
 * Only a GET-confirmed 404/410 is conclusive enough for unavailable;
 * authentication, throttling, bot challenges, server errors, and network
 * failures stay restricted/unknown.
 */
export async function verifyPublicSourceUrl(
  value: unknown,
  options: VerificationOptions = {},
): Promise<SourceHealthCheck> {
  const attemptedUrl = safeAttemptUrl(value)
  let publicUrl: string
  try {
    publicUrl = validatePublicHttpUrl(value)
  } catch (error) {
    const code = error instanceof Error && INVALID_URL_ERRORS.has(error.message) ? error.message : 'invalid_public_url'
    return { status: 'invalid', checked_url: attemptedUrl, error_code: code }
  }
  const checkedUrl = normalizeUrlForDedup(publicUrl)

  const fetcher = options.fetcher || fetch
  try {
    const head = await fetchPublicSource(publicUrl, 'HEAD', options.headTimeoutMs || 3500, fetcher)
    const headStatus = head.response.status
    const headResult = classifyResponse(head.response, head.finalUrl)
    await head.response.body?.cancel().catch(() => {})

    // Some origins do not implement HEAD, while an intermediary can emit a
    // misleading 404. A one-byte GET distinguishes those cases from a missing
    // source without downloading the source body.
    if (![404, 405, 410].includes(headStatus)) return { ...headResult, checked_url: checkedUrl }

    const get = await fetchPublicSource(publicUrl, 'GET', options.getTimeoutMs || 2500, fetcher)
    const getResult = classifyResponse(get.response, get.finalUrl)
    await get.response.body?.cancel().catch(() => {})
    return { ...getResult, checked_url: checkedUrl }
  } catch (error) {
    if (error instanceof Error && INVALID_URL_ERRORS.has(error.message)) {
      return { status: 'invalid', checked_url: checkedUrl, error_code: error.message }
    }
    return { status: 'unknown', checked_url: checkedUrl, error_code: 'request_failed' }
  }
}

export async function recordSourceHealthCheck(
  DB: D1Database,
  recommendationId: string,
  purpose: SourceHealthPurpose,
  check: SourceHealthCheck,
  currentSourceUrl = check.checked_url,
): Promise<RecordedSourceHealthCheck> {
  const attemptId = `source_check_${crypto.randomUUID()}`
  const checkedAt = new Date().toISOString()
  const statements = [
    DB.prepare(
      `INSERT INTO source_health_attempts
      (id,recommendation_id,purpose,checked_url,status,http_status,final_url,error_code,checked_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      attemptId,
      recommendationId,
      purpose,
      check.checked_url,
      check.status,
      check.http_status ?? null,
      check.final_url ?? null,
      check.error_code ?? null,
      checkedAt,
    ),
  ]
  if (purpose === 'current') {
    statements.push(
      DB.prepare(
        `INSERT INTO source_health
      (recommendation_id,checked_url,status,last_checked_at,http_status,final_url,error_code,updated_at)
      SELECT ?,?,?,?,?,?,?,datetime('now')
      WHERE EXISTS (
        SELECT 1 FROM recommendations
        WHERE id=? AND video_url=? AND deleted_at IS NULL AND (status IS NULL OR status!='deleted')
      )
      ON CONFLICT(recommendation_id) DO UPDATE SET
        checked_url=excluded.checked_url,
        status=excluded.status,
        last_checked_at=excluded.last_checked_at,
        http_status=excluded.http_status,
        final_url=excluded.final_url,
        error_code=excluded.error_code,
        updated_at=datetime('now')`,
      ).bind(
        recommendationId,
        // The projection binds the verdict to the exact canonical identity that
        // was read before the network check. Attempts retain the normalized URL;
        // using the source literal here keeps SQL joins and stale-check selection
        // correct for legacy URLs that still contain tracking parameters.
        currentSourceUrl,
        check.status,
        checkedAt,
        check.http_status ?? null,
        check.final_url ?? null,
        check.error_code ?? null,
        recommendationId,
        currentSourceUrl,
      ),
    )
  }
  await DB.batch(statements)
  return { ...check, attempt_id: attemptId, checked_at: checkedAt }
}

export async function checkAndRecordSourceHealth(
  DB: D1Database,
  recommendationId: string,
  sourceUrl: string,
  purpose: SourceHealthPurpose = 'current',
  options: VerificationOptions = {},
) {
  const check = await verifyPublicSourceUrl(sourceUrl, options)
  return recordSourceHealthCheck(DB, recommendationId, purpose, check, sourceUrl)
}

export async function loadSourceHealth(DB: D1Database, recommendationId: string, currentSourceUrl: string, limit = 20) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 20)
  const [health, attempts, replacements] = await Promise.all([
    DB.prepare(
      `SELECT recommendation_id,checked_url,status,last_checked_at,http_status,final_url,error_code
      FROM source_health WHERE recommendation_id=?`,
    )
      .bind(recommendationId)
      .first<any>(),
    DB.prepare(
      `SELECT id,purpose,checked_url,status,http_status,final_url,error_code,checked_at
      FROM source_health_attempts WHERE recommendation_id=? ORDER BY checked_at DESC,id DESC LIMIT ?`,
    )
      .bind(recommendationId, boundedLimit)
      .all<any>(),
    DB.prepare(
      `SELECT id,previous_url,source_url,previous_dedup_key,source_dedup_key,
        verification_attempt_id,verification_status,verification_http_status,verification_final_url,replaced_at
      FROM source_url_replacements WHERE recommendation_id=? ORDER BY replaced_at DESC,id DESC LIMIT ?`,
    )
      .bind(recommendationId, boundedLimit)
      .all<any>(),
  ])
  return {
    health: health && sourceHealthMatchesCurrentUrl(health.checked_url, currentSourceUrl) ? health : null,
    attempts: attempts.results || [],
    replacements: replacements.results || [],
  }
}

/**
 * Refresh only the product's current commitment surfaces. This intentionally
 * excludes the general Library: health is a warning ledger, not a crawler.
 */
export async function refreshScopedSourceHealth(DB: D1Database, limit = 8) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 8, 1), 12)
  const candidates = await DB.prepare(
    `WITH ranked_stages AS (
      SELECT s.id,s.thread_id,
        ROW_NUMBER() OVER (PARTITION BY s.thread_id ORDER BY s.position,s.id) stage_rank
      FROM learning_path_stages s
      JOIN learning_threads t ON t.id=s.thread_id
      WHERE t.status='active' AND t.superseded_at IS NULL AND s.status IN ('available','in_progress')
    ), ranked_lessons AS (
      SELECT l.id,l.stage_id,
        ROW_NUMBER() OVER (
          PARTITION BY l.stage_id
          ORDER BY CASE WHEN l.status='in_progress' THEN 0 ELSE 1 END,l.position,l.id
        ) lesson_rank
      FROM thread_lessons l
      JOIN ranked_stages s ON s.id=l.stage_id AND s.stage_rank=1
      WHERE COALESCE(l.status,'not_started')!='completed'
    ), scoped AS (
      SELECT r.id recommendation_id,r.video_url source_url,1 priority
      FROM recommendations r LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.status='active' AND r.deleted_at IS NULL AND COALESCE(r.content_type,'')!='book'
        AND COALESCE(m.learning_state,'queued') IN ('queued','in_progress')
      UNION ALL
      SELECT r.id,r.video_url,2
      FROM recommendations r
      JOIN thread_lesson_sources ls ON ls.recommendation_id=r.id
      JOIN ranked_lessons l ON l.id=ls.lesson_id AND l.lesson_rank=1
      WHERE r.deleted_at IS NULL
      UNION ALL
      SELECT r.id,r.video_url,3
      FROM recommendations r JOIN recommendation_meta m ON m.recommendation_id=r.id
      WHERE r.deleted_at IS NULL AND r.content_type='book'
        AND json_extract(COALESCE(m.source_metadata_json,'{}'),'$.book_primary')=1
        AND json_extract(COALESCE(m.source_metadata_json,'{}'),'$.book_reading_state')='reading'
    ), targets AS (
      SELECT recommendation_id,source_url,MIN(priority) priority
      FROM scoped WHERE source_url LIKE 'http://%' OR source_url LIKE 'https://%'
      GROUP BY recommendation_id,source_url
    )
    SELECT targets.recommendation_id,targets.source_url,targets.priority
    FROM targets LEFT JOIN source_health h ON h.recommendation_id=targets.recommendation_id
    WHERE h.last_checked_at IS NULL OR h.checked_url!=targets.source_url OR datetime(h.last_checked_at)<datetime('now','-24 hours')
    ORDER BY targets.priority,COALESCE(h.last_checked_at,'') ASC,targets.recommendation_id
    LIMIT ?`,
  )
    .bind(boundedLimit)
    .all<any>()
  const rows = candidates.results || []
  const checks: RecordedSourceHealthCheck[] = []
  for (let offset = 0; offset < rows.length; offset += 4) {
    const batch = rows.slice(offset, offset + 4)
    checks.push(
      ...(await Promise.all(
        batch.map((row: any) =>
          checkAndRecordSourceHealth(DB, String(row.recommendation_id), String(row.source_url), 'current'),
        ),
      )),
    )
  }
  return {
    checked: checks.length,
    statuses: Object.fromEntries(
      SOURCE_HEALTH_STATUSES.map((status) => [status, checks.filter((check) => check.status === status).length]),
    ),
    scope: ['queue', 'active_lesson', 'current_book'],
  }
}
