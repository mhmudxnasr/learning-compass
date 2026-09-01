import { deriveDedupKey, normalizeSourceUrlIdentity, type Bindings } from '../lib.ts'

export type ShareIntakeDestination = 'capture' | 'anchor'
export type ShareIntakeKind = ShareIntakeDestination | 'review'

export type ShareIntake = {
  id: string
  kind: ShareIntakeKind
  resolved_kind: ShareIntakeDestination | null
  effective_kind: ShareIntakeDestination | null
  title: string | null
  shared_text: string | null
  source_url: string | null
  source_identity_url: string | null
  source_identity_key: string | null
  status: 'pending' | 'consumed'
  recommendation_id: string | null
  annotation_id: string | null
  recoverable_annotation_id?: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  consumed_at: string | null
}

export class ShareIntakeError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
    this.name = 'ShareIntakeError'
  }
}

const isSharedUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length < 2048 && /^https?:\/\/[^\s<>"']+$/i.test(value)

export function extractSharedSourceUrl(text: unknown) {
  const value = String(text || '').trim()
  for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    let candidate = String(match[0] || '').replace(/[.,;?]+$/g, '')
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ] as const) {
      while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length)
        candidate = candidate.slice(0, -1)
    }
    if (isSharedUrl(candidate)) return candidate
  }
  return null
}

export function classifyShareIntake(text: unknown, sourceUrl: unknown): Extract<ShareIntakeKind, 'capture' | 'review'> {
  const sharedText = String(text || '').trim()
  const url = String(sourceUrl || '').trim()
  return url && sharedText && sharedText !== url ? 'review' : 'capture'
}

const withoutUrlFragmentSql = (expression: string) =>
  `rtrim(CASE WHEN instr(${expression},'#')>0 THEN substr(${expression},1,instr(${expression},'#')-1) ELSE ${expression} END,'/')`
const selectorUrlSql = `json_extract(a.selector_json,'$.url')`
const selectorLocatorSql = `json_extract(a.selector_json,'$.locator')`
const selectorMatchesIntakeSql = `(${selectorUrlSql}=si.source_url OR ${selectorLocatorSql}=si.source_url
  OR ${withoutUrlFragmentSql(selectorUrlSql)}=si.source_identity_url OR ${withoutUrlFragmentSql(selectorLocatorSql)}=si.source_identity_url
  OR EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(a.selector_source_identities_json) THEN a.selector_source_identities_json ELSE '[]' END) selector_identity
    WHERE selector_identity.value=si.source_identity_url
  ))`
const annotationSourceMatchesIntakeSql = `(r.video_url=si.source_url OR ${withoutUrlFragmentSql('r.video_url')}=si.source_identity_url OR EXISTS (
  SELECT 1 FROM source_url_replacements identity_history
  WHERE identity_history.recommendation_id=r.id AND (
    identity_history.previous_url=si.source_url OR identity_history.source_url=si.source_url
    OR ${withoutUrlFragmentSql('identity_history.previous_url')}=si.source_identity_url
    OR ${withoutUrlFragmentSql('identity_history.source_url')}=si.source_identity_url
    OR identity_history.previous_dedup_key=si.source_identity_key OR identity_history.source_dedup_key=si.source_identity_key
    OR (substr(si.source_identity_key,1,3)!='yt_' AND substr(si.source_identity_key,1,5)!='book_' AND (
      substr(identity_history.previous_dedup_key,instr(identity_history.previous_dedup_key,'_')+1)=substr(si.source_identity_key,instr(si.source_identity_key,'_')+1)
      OR substr(identity_history.source_dedup_key,instr(identity_history.source_dedup_key,'_')+1)=substr(si.source_identity_key,instr(si.source_identity_key,'_')+1)
    ))
  )
  )
  OR r.dedup_key=si.source_identity_key
  OR (substr(si.source_identity_key,1,3)!='yt_' AND substr(si.source_identity_key,1,5)!='book_'
    AND substr(r.dedup_key,instr(r.dedup_key,'_')+1)=substr(si.source_identity_key,instr(si.source_identity_key,'_')+1)))`
const selectorMatchesBoundSql = `(${selectorUrlSql}=? OR ${selectorLocatorSql}=?
  OR ${withoutUrlFragmentSql(selectorUrlSql)}=? OR ${withoutUrlFragmentSql(selectorLocatorSql)}=?
  OR EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(a.selector_source_identities_json) THEN a.selector_source_identities_json ELSE '[]' END) selector_identity
    WHERE selector_identity.value=?
  ))`
const annotationSourceMatchesBoundSql = `(r.video_url=? OR ${withoutUrlFragmentSql('r.video_url')}=? OR EXISTS (
  SELECT 1 FROM source_url_replacements identity_history
  WHERE identity_history.recommendation_id=r.id AND (
    identity_history.previous_url=? OR identity_history.source_url=?
    OR ${withoutUrlFragmentSql('identity_history.previous_url')}=?
    OR ${withoutUrlFragmentSql('identity_history.source_url')}=?
    OR identity_history.previous_dedup_key=? OR identity_history.source_dedup_key=?
    OR (? IS NOT NULL AND (
      substr(identity_history.previous_dedup_key,instr(identity_history.previous_dedup_key,'_')+1)=?
      OR substr(identity_history.source_dedup_key,instr(identity_history.source_dedup_key,'_')+1)=?
    ))
  )
  )
  OR r.dedup_key=? OR (? IS NOT NULL AND substr(r.dedup_key,instr(r.dedup_key,'_')+1)=?))`

const intakeSelect = `SELECT si.*,
  CASE WHEN si.kind='review' THEN si.resolved_kind ELSE si.kind END effective_kind,
  CASE WHEN (si.kind='anchor' OR (si.kind='review' AND si.resolved_kind='anchor')) AND si.status='pending' THEN (
    SELECT a.id FROM source_annotations a
    JOIN recommendations r ON r.id=a.recommendation_id AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
    JOIN recommendation_meta m ON m.recommendation_id=r.id AND a.branch_id=m.branch_id
    JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
    JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
    WHERE a.status='active' AND a.quote=si.shared_text
      AND si.source_identity_url IS NOT NULL
      AND ${selectorMatchesIntakeSql}
      AND ${annotationSourceMatchesIntakeSql}
      AND (json_extract(a.selector_json,'$.share_intake_id')=si.id OR a.created_at>=si.created_at)
    ORDER BY a.created_at DESC LIMIT 1
  ) ELSE NULL END recoverable_annotation_id
  FROM share_intakes si`

export async function createShareIntake(
  DB: Bindings['DB'],
  input: {
    kind: ShareIntakeKind
    title?: string | null
    text?: string | null
    sourceUrl?: string | null
  },
) {
  const title =
    String(input.title || '')
      .trim()
      .slice(0, 500) || null
  const rawSharedText = String(input.text || '').trim()
  if (rawSharedText.length > 10000) {
    throw new ShareIntakeError('share_text_too_large', 'Shared text must contain at most 10,000 characters.')
  }
  const sharedText = rawSharedText || null
  const sourceUrl =
    String(input.sourceUrl || '')
      .trim()
      .slice(0, 2048) || null
  const sourceIdentityUrl = sourceUrl ? normalizeSourceUrlIdentity(sourceUrl) : null
  const sourceIdentityKey = sourceIdentityUrl
    ? deriveDedupKey({ video_url: sourceIdentityUrl, content_type: 'article' })
    : null
  const candidate = sourceUrl || sharedText
  if (!candidate) throw new ShareIntakeError('share_intake_empty', 'The shared item is empty.')
  if ((input.kind === 'anchor' || input.kind === 'review') && (!sourceUrl || !sharedText)) {
    throw new ShareIntakeError(
      input.kind === 'review' ? 'share_review_incomplete' : 'share_anchor_incomplete',
      `${input.kind === 'review' ? 'A review share' : 'An anchor share'} requires both its source URL and shared text.`,
    )
  }
  const id = `share_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  await DB.prepare(
    `INSERT INTO share_intakes (id,kind,title,shared_text,source_url,source_identity_url,source_identity_key) VALUES (?,?,?,?,?,?,?)`,
  )
    .bind(id, input.kind, title, sharedText, sourceUrl, sourceIdentityUrl, sourceIdentityKey)
    .run()
  return loadShareIntake(DB, id)
}

export async function loadShareIntake(DB: Bindings['DB'], id: string) {
  const cleanId = String(id || '')
    .trim()
    .slice(0, 120)
  if (!cleanId) return null
  return DB.prepare(`${intakeSelect} WHERE si.id=?`).bind(cleanId).first<ShareIntake>()
}

export async function loadPendingShareIntakes(DB: Bindings['DB'], limit = 10) {
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(Number(limit) || 10)))
  const rows = await DB.prepare(`${intakeSelect} WHERE si.status='pending' ORDER BY si.created_at DESC LIMIT ?`)
    .bind(boundedLimit)
    .all<ShareIntake>()
  return rows.results || []
}

export async function resolveShareIntake(DB: Bindings['DB'], id: string, destination: ShareIntakeDestination) {
  if (destination !== 'capture' && destination !== 'anchor') {
    throw new ShareIntakeError('share_intake_resolution_invalid', 'Choose source capture or selected-passage anchor.')
  }
  const intake = await loadShareIntake(DB, id)
  if (!intake) throw new ShareIntakeError('share_intake_not_found', 'The shared item is unavailable.', 404)
  if (intake.kind !== 'review') {
    throw new ShareIntakeError(
      'share_intake_not_reviewable',
      'This shared item does not require an intent choice.',
      409,
    )
  }
  if (intake.resolved_kind) {
    if (intake.resolved_kind === destination) return intake
    throw new ShareIntakeError(
      'share_intake_resolution_conflict',
      'This shared item was already assigned to a different completion path.',
      409,
    )
  }
  if (intake.status !== 'pending') {
    throw new ShareIntakeError('share_intake_already_consumed', 'The shared item was already completed.', 409)
  }

  const updated = await DB.prepare(
    `UPDATE share_intakes
    SET resolved_kind=?,resolved_at=datetime('now'),updated_at=datetime('now')
    WHERE id=? AND kind='review' AND resolved_kind IS NULL AND status='pending'`,
  )
    .bind(destination, intake.id)
    .run()
  const current = await loadShareIntake(DB, intake.id)
  if (!current) throw new ShareIntakeError('share_intake_not_found', 'The shared item is unavailable.', 404)
  if (current.resolved_kind === destination) return current
  if (!updated.meta.changes && current.resolved_kind) {
    throw new ShareIntakeError(
      'share_intake_resolution_conflict',
      'This shared item was already assigned to a different completion path.',
      409,
    )
  }
  throw new ShareIntakeError(
    'share_intake_resolution_conflict',
    'The shared item could not be assigned to that completion path.',
    409,
  )
}

export async function consumeShareIntake(
  DB: Bindings['DB'],
  id: string,
  target: {
    recommendationId?: string | null
    annotationId?: string | null
  },
) {
  const intake = await loadShareIntake(DB, id)
  if (!intake) throw new ShareIntakeError('share_intake_not_found', 'The shared item is unavailable.', 404)
  const completionKind = intake.effective_kind
  if (!completionKind) {
    throw new ShareIntakeError(
      'share_intake_intent_required',
      'Choose whether this share is a source or a selected passage before completing it.',
      409,
    )
  }

  const recommendationId =
    String(target.recommendationId || '')
      .trim()
      .slice(0, 120) || null
  const annotationId =
    String(target.annotationId || '')
      .trim()
      .slice(0, 120) || null
  const identityDedupSuffix =
    intake.source_identity_key && !/^(?:yt|book)_/.test(intake.source_identity_key)
      ? intake.source_identity_key.slice(intake.source_identity_key.indexOf('_') + 1)
      : null
  if (completionKind === 'capture' && (!recommendationId || annotationId)) {
    throw new ShareIntakeError('share_capture_target_required', 'A captured source record is required.')
  }
  if (completionKind === 'anchor' && (!annotationId || recommendationId)) {
    throw new ShareIntakeError('share_anchor_target_required', 'A saved source annotation is required.')
  }

  if (intake.status === 'consumed') {
    const sameTarget =
      completionKind === 'capture'
        ? intake.recommendation_id === recommendationId
        : intake.annotation_id === annotationId
    if (!sameTarget)
      throw new ShareIntakeError(
        'share_intake_already_consumed',
        'The shared item was already completed with a different target.',
        409,
      )
    return intake
  }

  let updated: { meta: { changes: number } }
  if (completionKind === 'capture') {
    const candidate = intake.source_url || intake.shared_text || ''
    updated = await DB.prepare(
      `UPDATE share_intakes
      SET status='consumed',recommendation_id=?,annotation_id=NULL,consumed_at=datetime('now'),updated_at=datetime('now')
      WHERE id=? AND status='pending'
        AND (kind='capture' OR (kind='review' AND resolved_kind='capture'))
        AND EXISTS (
          SELECT 1 FROM recommendations r
          JOIN recommendation_meta m ON m.recommendation_id=r.id
          JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
          JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
          WHERE r.id=? AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
            AND (${annotationSourceMatchesBoundSql}
              OR json_extract(m.source_metadata_json,'$.raw_source')=?
              OR ${withoutUrlFragmentSql("json_extract(m.source_metadata_json,'$.raw_source')")}=?
            )
        )`,
    )
      .bind(
        recommendationId,
        intake.id,
        recommendationId,
        intake.source_url,
        intake.source_identity_url,
        intake.source_url,
        intake.source_url,
        intake.source_identity_url,
        intake.source_identity_url,
        intake.source_identity_key,
        intake.source_identity_key,
        identityDedupSuffix,
        identityDedupSuffix,
        identityDedupSuffix,
        intake.source_identity_key,
        identityDedupSuffix,
        identityDedupSuffix,
        candidate,
        intake.source_identity_url,
      )
      .run()
  } else {
    updated = await DB.prepare(
      `WITH valid_target AS (
        SELECT a.recommendation_id FROM source_annotations a
        JOIN recommendations r ON r.id=a.recommendation_id AND r.deleted_at IS NULL AND lower(COALESCE(r.status,''))!='deleted'
        JOIN recommendation_meta m ON m.recommendation_id=r.id AND a.branch_id=m.branch_id
        JOIN tree_nodes b ON b.id=m.branch_id AND b.type IN ('branch','leaf') AND lower(COALESCE(b.status,''))!='pruned'
        JOIN tree_nodes d ON d.id=b.super_category AND d.type='category' AND lower(COALESCE(d.status,''))!='pruned'
        WHERE a.id=? AND a.status='active' AND a.quote=?
          AND ${selectorMatchesBoundSql}
          AND ${annotationSourceMatchesBoundSql}
      )
      UPDATE share_intakes
      SET status='consumed',recommendation_id=(SELECT recommendation_id FROM valid_target),annotation_id=?,consumed_at=datetime('now'),updated_at=datetime('now')
      WHERE id=? AND status='pending'
        AND (kind='anchor' OR (kind='review' AND resolved_kind='anchor'))
        AND EXISTS (SELECT 1 FROM valid_target)`,
    )
      .bind(
        annotationId,
        intake.shared_text,
        intake.source_url,
        intake.source_url,
        intake.source_identity_url,
        intake.source_identity_url,
        intake.source_identity_url,
        intake.source_url,
        intake.source_identity_url,
        intake.source_url,
        intake.source_url,
        intake.source_identity_url,
        intake.source_identity_url,
        intake.source_identity_key,
        intake.source_identity_key,
        identityDedupSuffix,
        identityDedupSuffix,
        identityDedupSuffix,
        intake.source_identity_key,
        identityDedupSuffix,
        identityDedupSuffix,
        annotationId,
        intake.id,
      )
      .run()
  }

  if (!updated.meta.changes) {
    const current = await loadShareIntake(DB, intake.id)
    if (current) {
      const sameTarget =
        current.effective_kind === 'capture'
          ? current.recommendation_id === recommendationId
          : current.annotation_id === annotationId
      if (current.status === 'consumed' && sameTarget) return current
      if (current.status === 'pending' && current.effective_kind === completionKind) {
        throw new ShareIntakeError(
          completionKind === 'capture' ? 'share_capture_mismatch' : 'share_anchor_mismatch',
          completionKind === 'capture'
            ? 'The saved source does not match this share or lacks a reviewed branch.'
            : 'The saved annotation does not match this shared passage or its canonical source branch.',
          409,
        )
      }
      throw new ShareIntakeError(
        'share_intake_already_consumed',
        'The shared item was already completed with a different target.',
        409,
      )
    }
    throw new ShareIntakeError('share_intake_not_found', 'The shared item is unavailable.', 404)
  }
  return loadShareIntake(DB, intake.id)
}
