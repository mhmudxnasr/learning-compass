type PairArtifact = { id: string; metadata_json: string }
type PairLedger = {
  corpus_id: string | null
  html_artifact_id: string
  pdf_artifact_id: string
}

export async function loadCompanionPair(db: D1Database, id: string) {
  const [artifacts, ledger] = await Promise.all([
    db
      .prepare(
        `SELECT a.id,a.metadata_json FROM artifacts a
       JOIN recommendations r ON r.id=json_extract(a.metadata_json,'$.recommendation_id')
       WHERE json_extract(a.metadata_json,'$.pair_id')=? AND r.deleted_at IS NULL AND r.status!='deleted'
       ORDER BY a.id LIMIT 3`,
      )
      .bind(id)
      .all<PairArtifact>(),
    db
      .prepare('SELECT corpus_id,html_artifact_id,pdf_artifact_id FROM lite_visual_pairs WHERE pair_id=?')
      .bind(id)
      .first<PairLedger>(),
  ])
  const rows = artifacts.results || []
  if (!rows.length) return null
  const members = rows.map((row) => ({ ...row, metadata: JSON.parse(row.metadata_json) }))
  const html = members.find((row) => row.metadata.role === 'html')
  const pdf = members.find((row) => row.metadata.role === 'pdf')
  const consistent = members.every(
    (row) =>
      row.metadata.generator === 'lite-visual' &&
      row.metadata.recommendation_id === html?.metadata.recommendation_id &&
      (row.metadata.chapter_key || '') === (html?.metadata.chapter_key || ''),
  )
  const complete =
    rows.length === 2 &&
    Boolean(html && pdf) &&
    consistent &&
    (!ledger || (ledger.html_artifact_id === html?.id && ledger.pdf_artifact_id === pdf?.id))
  const corpusId = ledger?.corpus_id || members.find((row) => row.metadata.corpus_id)?.metadata.corpus_id || null
  const operation = `retire-pair:${id}`
  const retired =
    complete &&
    members.every(
      (row) => row.metadata.publication_state === 'superseded' && row.metadata.retirement_operation === operation,
    )
  return {
    rows,
    record: {
      id,
      recommendation_id: html?.metadata.recommendation_id || null,
      html_artifact_id: html?.id || null,
      pdf_artifact_id: pdf?.id || null,
      corpus_id: corpusId,
      complete,
      retired,
      can_retire:
        complete && !corpusId && (retired || members.every((row) => row.metadata.publication_state === 'ready')),
    },
  }
}

export async function retireCompanionPair(
  db: D1Database,
  pair: NonNullable<Awaited<ReturnType<typeof loadCompanionPair>>>,
) {
  if (pair.record.retired) return pair.record
  const [html, pdf] = pair.rows
  const operation = `retire-pair:${pair.record.id}`
  // Both exact metadata snapshots must still match in the same D1 transaction.
  // R2 objects and source/lesson relationships remain untouched for recovery.
  await db.batch([
    db
      .prepare(
        `WITH eligible AS MATERIALIZED (SELECT COUNT(*) count FROM artifacts
         WHERE (id=? AND metadata_json=?) OR (id=? AND metadata_json=?))
       UPDATE artifacts SET metadata_json=json_set(metadata_json,
        '$.publication_state','superseded','$.retirement_operation',?,'$.retired_at',datetime('now'))
       WHERE id IN (?,?) AND 2=(SELECT count FROM eligible)
       AND NOT EXISTS (SELECT 1 FROM lite_visual_pairs WHERE pair_id=? AND corpus_id IS NOT NULL)`,
      )
      .bind(html.id, html.metadata_json, pdf.id, pdf.metadata_json, operation, html.id, pdf.id, pair.record.id),
    db
      .prepare(
        `UPDATE lite_visual_pairs SET state='superseded' WHERE pair_id=? AND corpus_id IS NULL
       AND 2=(SELECT COUNT(*) FROM artifacts WHERE id IN (?,?)
         AND json_extract(metadata_json,'$.retirement_operation')=?
         AND json_extract(metadata_json,'$.publication_state')='superseded')`,
      )
      .bind(pair.record.id, html.id, pdf.id, operation),
  ])
  return (await loadCompanionPair(db, pair.record.id))?.record || null
}
