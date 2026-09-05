import { selectLearningSourceRenditions } from './learning-material-renditions'
import { isSyntheticWholeBookChapter } from './book-projection'

type Row = Record<string, any>
export type ObsidianFile = { path: string; content: string }
export class ThreadExportError extends Error {
  constructor(
    public status: 404 | 413,
    message: string,
  ) {
    super(message)
  }
}
const safeName = (value: string) =>
  value
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || 'Untitled'
const uniqueName = async (title: string, id: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
  return `${safeName(title)}--${Array.from(new Uint8Array(hash).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
const text = (value: unknown) => String(value || '')
const heading = (value: unknown) => text(value).replace(/[\r\n]+/g, ' ')
const link = (label: string, url: string) =>
  `[${label.replace(/[[\]\\]/g, '\\$&').replace(/[\r\n]/g, ' ')}](<${url.replace(/[<>\r\n]/g, (char) => encodeURIComponent(char))}>)`
const webLink = (label: string, url: unknown) => (/^https?:\/\//i.test(text(url)) ? link(label, text(url)) : '')
const frontmatter = (fields: Row) =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value ?? null)}`)
    .join('\n')}\n---\n\n`

export async function buildThreadObsidianExport(db: D1Database, threadId: string, origin: string, stageId?: string) {
  const thread = await db.prepare('SELECT * FROM learning_threads WHERE id=?').bind(threadId).first<Row>()
  if (!thread) throw new ThreadExportError(404, 'Thread not found.')
  const [stageRows, lessonRows, placementRows, scopedSourceRows] = await Promise.all([
    db
      .prepare('SELECT * FROM learning_path_stages WHERE thread_id=? ORDER BY position,id LIMIT 501')
      .bind(threadId)
      .all<Row>(),
    db
      .prepare(
        `SELECT l.* FROM thread_lessons l JOIN learning_path_stages s ON s.id=l.stage_id
      WHERE l.thread_id=? ORDER BY s.position,s.id,l.position,l.id LIMIT 2001`,
      )
      .bind(threadId)
      .all<Row>(),
    db
      .prepare(
        `SELECT 'thread' scope,thread_id owner_id,recommendation_id,role,position FROM thread_sources WHERE thread_id=? AND status!='removed'
      UNION ALL SELECT 'level',ps.stage_id,ps.recommendation_id,ps.role,ps.position FROM learning_path_sources ps JOIN learning_path_stages s ON s.id=ps.stage_id WHERE s.thread_id=?
      UNION ALL SELECT 'lesson',ls.lesson_id,ls.recommendation_id,ls.role,ls.position FROM thread_lesson_sources ls JOIN thread_lessons l ON l.id=ls.lesson_id WHERE l.thread_id=?`,
      )
      .bind(threadId, threadId, threadId)
      .all<Row>(),
    db
      .prepare(
        `SELECT DISTINCT recommendation_id FROM notes WHERE recommendation_id IS NOT NULL AND
      (thread_id=? OR stage_id IN (SELECT id FROM learning_path_stages WHERE thread_id=? AND (? IS NULL OR id=?))
      OR lesson_id IN (SELECT id FROM thread_lessons WHERE thread_id=? AND (? IS NULL OR stage_id=?)))`,
      )
      .bind(threadId, threadId, stageId || null, stageId || null, threadId, stageId || null, stageId || null)
      .all<Row>(),
  ])
  if ((stageRows.results?.length || 0) > 500 || (lessonRows.results?.length || 0) > 2000)
    throw new ThreadExportError(413, 'This Thread is too large to export in one download.')
  if (stageId && !stageRows.results?.some((stage) => stage.id === stageId))
    throw new ThreadExportError(404, 'Level not found in this Thread.')
  const stages = (stageRows.results || []).filter((stage) => !stageId || stage.id === stageId)
  const stageIds = new Set(stages.map((stage) => stage.id))
  const lessons = (lessonRows.results || []).filter((lesson) => stageIds.has(lesson.stage_id))
  const lessonIds = new Set(lessons.map((lesson) => lesson.id))
  const placements = (placementRows.results || []).filter(
    (p) => p.scope === 'thread' || (p.scope === 'level' ? stageIds.has(p.owner_id) : lessonIds.has(p.owner_id)),
  )
  const sourceIds = [
    ...new Set([
      ...placements.map((p) => p.recommendation_id),
      ...(scopedSourceRows.results || []).map((note) => note.recommendation_id),
    ]),
  ]
  // JSON table arguments avoid D1's parameter ceiling on long curricula.
  const [sourceRows, noteRows, artifactRows] = await Promise.all([
    db
      .prepare(
        `SELECT r.*,m.branch_id,b.label branch_label,d.label domain_label FROM recommendations r
      LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id LEFT JOIN tree_nodes b ON b.id=m.branch_id
      LEFT JOIN tree_nodes d ON d.id=b.super_category WHERE r.id IN (SELECT value FROM json_each(?))
      AND r.deleted_at IS NULL AND lower(r.status)!='deleted'`,
      )
      .bind(JSON.stringify(sourceIds))
      .all<Row>(),
    db
      .prepare(
        `SELECT n.*,r.video_title source_title,r.content_type,r.video_url,r.notebook_url,b.label branch_label,d.label domain_label
      FROM notes n LEFT JOIN recommendations r ON r.id=n.recommendation_id LEFT JOIN tree_nodes b ON b.id=n.branch_id LEFT JOIN tree_nodes d ON d.id=b.super_category
      WHERE (n.thread_id=? OR n.stage_id IN (SELECT value FROM json_each(?)) OR n.lesson_id IN (SELECT value FROM json_each(?))
        OR (n.thread_id IS NULL AND n.stage_id IS NULL AND n.lesson_id IS NULL AND n.recommendation_id IN (SELECT value FROM json_each(?))))
      AND (n.recommendation_id IS NULL OR (r.id IS NOT NULL AND r.deleted_at IS NULL AND lower(r.status)!='deleted'))
      ORDER BY n.created_at,n.id LIMIT 1001`,
      )
      .bind(threadId, JSON.stringify([...stageIds]), JSON.stringify([...lessonIds]), JSON.stringify(sourceIds))
      .all<Row>(),
    db
      .prepare(
        `SELECT id,filename,media_type,size_bytes,metadata_json,created_at FROM artifacts
      WHERE json_extract(metadata_json,'$.recommendation_id') IN (SELECT value FROM json_each(?))
      AND COALESCE(json_extract(metadata_json,'$.publication_state'),'ready') NOT IN ('staged','superseded')
      ORDER BY created_at DESC LIMIT 2001`,
      )
      .bind(JSON.stringify(sourceIds))
      .all<Row>(),
  ])
  if ((noteRows.results?.length || 0) > 1000 || (artifactRows.results?.length || 0) > 2000)
    throw new ThreadExportError(413, 'Choose a smaller Level to export all its material.')
  const notes = noteRows.results || []
  const sectionsResult = await db
    .prepare(
      'SELECT * FROM note_sections WHERE note_id IN (SELECT value FROM json_each(?)) ORDER BY note_id,position,id',
    )
    .bind(JSON.stringify(notes.map((note) => note.id)))
    .all<Row>()
  const sections = new Map<string, Row[]>()
  for (const section of sectionsResult.results || [])
    sections.set(section.note_id, [...(sections.get(section.note_id) || []), section])
  const sources = sourceRows.results || []
  const sourcesById = new Map(sources.map((source) => [source.id, source]))
  const root = `Learning Compass - ${await uniqueName(thread.title, stageId ? `${thread.id}:${stageId}` : thread.id)}`
  const files: ObsidianFile[] = []
  const notePaths = new Map(
    await Promise.all(
      notes.map(async (note): Promise<[string, string]> => [
        note.id,
        `Notes/${await uniqueName(note.title, note.id)}.md`,
      ]),
    ),
  )
  const sourcePaths = new Map(
    await Promise.all(
      sources.map(async (source): Promise<[string, string]> => [
        source.id,
        `Sources/${await uniqueName(source.video_title, source.id)}.md`,
      ]),
    ),
  )
  const wikilink = (path: string, label: string) =>
    `[[${root}/${path.replace(/\.md$/, '')}|${heading(label).replace(/[[\]|]/g, '')}]]`
  const compass = (path: string) => `${origin}/#/${path}`
  const missing: string[] = []
  const attachments: Array<{ path: string; url: string; size_bytes: number }> = []
  const sourceAttachments = new Map<string, string[]>()
  const normalizedArtifacts = (artifactRows.results || []).flatMap((artifact) => {
    let metadata: Row
    try {
      metadata = JSON.parse(artifact.metadata_json || '{}')
    } catch {
      return []
    }
    const sourceId = text(metadata.recommendation_id)
    if (!sourcesById.has(sourceId)) return []
    if (metadata.scope === 'book' && isSyntheticWholeBookChapter(metadata)) return []
    // The shared selector selects a coherent pair per chapter as well as per source.
    return [
      {
        ...artifact,
        id: text(artifact.id),
        metadata: {
          ...metadata,
          export_source_id: sourceId,
          recommendation_id:
            metadata.scope === 'book'
              ? `${sourceId}/${metadata.chapter_key || metadata.chapter_number || 'book'}`
              : sourceId,
          scope: 'source',
        },
      },
    ]
  })
  for (const pair of selectLearningSourceRenditions(normalizedArtifacts).values()) {
    for (const artifact of [pair.html, pair.pdf]) {
      if (!artifact) continue
      const sourceId = text(artifact.metadata?.export_source_id)
      const extension = artifact === pair.pdf ? 'pdf' : 'html'
      const path = `Attachments/${await uniqueName(artifact.filename || 'Companion', artifact.id)}.${extension}`
      attachments.push({
        path: `${root}/${path}`,
        url: `/artifacts/${encodeURIComponent(artifact.id)}`,
        size_bytes: Number(artifact.size_bytes || 0),
      })
      sourceAttachments.set(sourceId, [
        ...(sourceAttachments.get(sourceId) || []),
        link(`Download ${extension.toUpperCase()}`, `${origin}/artifacts/${encodeURIComponent(artifact.id)}`),
        link(`Local ${extension.toUpperCase()} (when included)`, `../${path}`),
      ])
    }
  }
  const addFile = (path: string, content: string) => files.push({ path: `${root}/${path}`, content })
  for (const note of notes) {
    const blocks = sections.get(note.id) || []
    addFile(
      notePaths.get(note.id)!,
      frontmatter({
        title: note.title,
        compass_id: note.id,
        type: note.kind,
        thread_id: thread.id,
        level_id: note.stage_id,
        lesson_id: note.lesson_id,
        source_id: note.recommendation_id,
        branch: note.branch_label,
        domain: note.domain_label,
        revision: note.revision,
        extraction_contract: note.extraction_contract,
        updated: note.updated_at,
        section_directions: blocks.map((section) => ({ section: section.section_key, direction: section.direction })),
      }) +
        [
          `# ${heading(note.title)}`,
          '',
          link('Open note in Compass', compass(`learn/note/${encodeURIComponent(note.id)}`)),
          '',
          ...(sourcePaths.has(note.recommendation_id)
            ? [wikilink(sourcePaths.get(note.recommendation_id)!, note.source_title), '']
            : []),
          webLink('Original source', note.video_url || note.source_url),
          '',
          ...blocks.flatMap((section) => [`## ${heading(section.label)}`, '', text(section.content), '']),
        ].join('\n'),
    )
  }
  for (const source of sources) {
    const ownNotes = notes.filter((note) => note.recommendation_id === source.id)
    if (!ownNotes.some((note) => note.extraction_contract && note.kind !== 'reflection'))
      missing.push(`${source.video_title}: no extracted source note available.`)
    if (!sourceAttachments.has(source.id))
      missing.push(`${source.video_title}: no current complete companion pair or legacy companion available.`)
    addFile(
      sourcePaths.get(source.id)!,
      frontmatter({
        title: source.video_title,
        compass_id: source.id,
        type: source.content_type,
        creator: source.creator,
        branch: source.branch_label,
        domain: source.domain_label,
      }) +
        [
          `# ${heading(source.video_title)}`,
          '',
          webLink('Original source', source.video_url),
          '',
          webLink('NotebookLM', source.notebook_url),
          '',
          '## Notes',
          '',
          ...ownNotes.map((note) => `- ${wikilink(notePaths.get(note.id)!, note.title)}`),
          '',
          '## Companions',
          '',
          ...(sourceAttachments.get(source.id) || []).map((entry) => `- ${entry}`),
          '',
        ].join('\n'),
    )
  }
  const placedLinks = (scope: string, owner: string) =>
    placements
      .filter((p) => p.scope === scope && p.owner_id === owner)
      .sort((a, b) => a.position - b.position)
      .map((p) =>
        sourcePaths.has(p.recommendation_id)
          ? `- ${p.role}: ${wikilink(sourcePaths.get(p.recommendation_id)!, sourcesById.get(p.recommendation_id)!.video_title)}`
          : `- ${p.role}: source no longer available.`,
      )
  addFile(
    'Start here.md',
    frontmatter({
      title: thread.title,
      compass_id: thread.id,
      exported: new Date().toISOString(),
      selected_level: stageId || null,
    }) +
      [
        `# ${heading(thread.title)}`,
        '',
        link('Open Thread in Compass', compass(`learn/thread/${encodeURIComponent(thread.id)}`)),
        '',
        '## Guiding question',
        '',
        text(thread.guiding_question),
        '',
        '## Intended outcome',
        '',
        text(thread.definition_of_done),
        '',
        '## Curriculum',
        '',
        ...stages.flatMap((stage) => [
          `### ${heading(stage.title)}`,
          '',
          text(stage.objective),
          '',
          ...placedLinks('level', stage.id),
          '',
          ...lessons
            .filter((lesson) => lesson.stage_id === stage.id)
            .flatMap((lesson) => [
              `#### ${lesson.position + 1}. ${heading(lesson.title)}`,
              '',
              `Status: ${lesson.status}`,
              '',
              link(
                'Open lesson',
                compass(`learn/t/${encodeURIComponent(thread.id)}/l/${encodeURIComponent(lesson.id)}`),
              ),
              '',
              text(lesson.content),
              '',
              ...placedLinks('lesson', lesson.id),
              '',
              ...notes
                .filter((note) => note.lesson_id === lesson.id)
                .map((note) => `- ${wikilink(notePaths.get(note.id)!, note.title)}`),
              '',
            ]),
        ]),
        '## Thread resources',
        '',
        ...placedLinks('thread', thread.id),
        '',
        '## All notes',
        '',
        ...notes.map((note) => `- ${wikilink(notePaths.get(note.id)!, note.title)}`),
        '',
        '## Synthesis',
        '',
        text(thread.final_synthesis),
        '',
      ].join('\n'),
  )
  addFile(
    'README.md',
    `# Using this folder in Obsidian\n\nUnzip the download into your vault, then open **Start here**. No plugin is required. Keep this folder name so its internal links continue to resolve.\n\nThis is a snapshot of existing Compass notes, including book and chapter notes and separate personal reflections. It never starts extraction or writes changes back to Compass. Handwriting transcription and uncertain words remain exactly as saved by Hermes. The frontmatter retains each section's original direction; prose is ordinary UTF-8 Markdown.\n\nCompanion links open Compass online. Local companion links work when you include companions in the download. Original websites and NotebookLM remain external links.\n\n## Material not available\n\n${missing.length ? missing.map((entry) => `- ${entry}`).join('\n') : 'All selected sources have extracted notes and companion files.'}\n`,
  )
  const bytes = files.reduce((sum, file) => sum + new TextEncoder().encode(file.content).length, 0)
  if (bytes > 12 * 1024 * 1024) throw new ThreadExportError(413, 'The notes exceed 12 MB. Export a smaller Level.')
  return {
    filename: `${safeName(thread.title)}-obsidian.zip`,
    files,
    attachments,
    summary: {
      notes: notes.length,
      sources: sources.length,
      lessons: lessons.length,
      companion_files: attachments.length,
      missing,
    },
    markdown_bytes: bytes,
  }
}
