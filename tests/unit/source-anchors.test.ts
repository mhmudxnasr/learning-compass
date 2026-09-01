import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let app: any
let checksum: (input: any) => Promise<string>
let vite: ViteDevServer

test.before(async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  const module = await vite.ssrLoadModule('/src/api/annotations.ts')
  app = module.default
  checksum = module.annotationEvidenceChecksum
})

test.after(async () => { await vite.close() })

class AnchorDatabase {
  annotation: any = null
  annotations = new Map<string, any>()
  projectionWrites: Array<{ sql: string; args: any[] }> = []
  historicalUrl: string | null = null
  failNextInPlaceUpdate = false
  failNextOwnershipInsert = false
  failNextRevisionOwnership = false

  source = {
    id: 'rec-1', video_title: 'Grounded source', video_url: 'https://example.com/essay', creator: 'Author', content_type: 'article',
    branch_id: 'branch-1', branch_label: 'Evidence', branch_status: 'active', branch_domain: 'thinking', branch_domain_verified: 'thinking', thread_id: null,
  }

  prepare(sql: string) {
    const statement: any = {
      args: [] as any[],
      bind: (...args: any[]) => { statement.args = args; return statement },
      first: async () => {
        if (sql.includes("json_extract(m.source_metadata_json,'$.raw_source')")) {
          const historicalDedupMatch = this.historicalUrl && statement.args.includes('arti_example_com_essay')
          return statement.args.includes(this.source.video_url) || historicalDedupMatch ? this.source : null
        }
        if (sql.includes('FROM recommendations r LEFT JOIN recommendation_meta') && sql.includes('WHERE r.id=?')) return statement.args[0] === this.source.id ? this.source : null
        if (sql.includes('SELECT b.id,b.status,b.super_category')) return statement.args[0] === 'branch-1' ? { id: 'branch-1', status: 'active', super_category: 'thinking', domain_id: 'thinking' } : null
        if (sql.includes('FROM source_annotations a')) {
          const annotation = this.annotations.get(String(statement.args[0]))
          return annotation ? { ...annotation, source_title: this.source.video_title, source_url: this.source.video_url, source_creator: this.source.creator, branch_label: this.source.branch_label, branch_status: this.source.branch_status, branch_domain: this.source.branch_domain } : null
        }
        return null
      },
      all: async () => ({ results: [] }),
      run: async () => {
        if (sql.includes('INSERT INTO source_annotations')) {
          if (sql.includes('revision_of_annotation_id')) {
            if (this.failNextRevisionOwnership) { this.failNextRevisionOwnership = false; return { meta: { changes: 0 } } }
            const previous = this.annotations.get(String(statement.args[10]))
            if (!previous || previous.status !== 'active' || previous.source_checksum !== statement.args[11]) return { meta: { changes: 0 } }
            this.annotation = {
              ...previous,
              id: statement.args[0], locator_type: statement.args[1], selector_json: statement.args[2], selector_source_identities_json: statement.args[3], quote: statement.args[4], context_before: statement.args[5], context_after: statement.args[6],
              language: statement.args[7], source_checksum: statement.args[8], revision_of_annotation_id: statement.args[9], status: 'active', created_at: '2026-08-31 12:01:00', updated_at: '2026-08-31 12:01:00',
            }
          } else {
            if (this.failNextOwnershipInsert) { this.failNextOwnershipInsert = false; return { meta: { changes: 0 } } }
            this.annotation = {
              id: statement.args[0], recommendation_id: statement.args[12], artifact_id: statement.args[1], thread_id: statement.args[2], branch_id: statement.args[13],
              locator_type: statement.args[3], selector_json: statement.args[4], selector_source_identities_json: statement.args[5], quote: statement.args[6], context_before: statement.args[7], context_after: statement.args[8],
              language: statement.args[9], source_checksum: statement.args[10], created_by: statement.args[11], status: 'active', created_at: '2026-08-31 12:00:00', updated_at: '2026-08-31 12:00:00',
            }
          }
          this.annotations.set(this.annotation.id, this.annotation)
        } else if (sql.includes('UPDATE source_annotations SET locator_type=')) {
          const annotation = this.annotations.get(String(statement.args[8]))
          if (this.failNextInPlaceUpdate) { this.failNextInPlaceUpdate = false; return { meta: { changes: 0 } } }
          if (!annotation || annotation.status !== 'active' || annotation.source_checksum !== statement.args[9]) return { meta: { changes: 0 } }
          Object.assign(annotation, {
            locator_type: statement.args[0], selector_json: statement.args[1], selector_source_identities_json: statement.args[2], quote: statement.args[3], context_before: statement.args[4], context_after: statement.args[5],
            language: statement.args[6], source_checksum: statement.args[7], updated_at: '2026-08-31 12:01:00',
          })
        } else if (sql.includes("UPDATE source_annotations SET status='archived'")) {
          const annotation = this.annotations.get(String(statement.args[0]))
          if (!annotation || annotation.status !== 'active' || statement.args.length > 1 && annotation.source_checksum !== statement.args[1]) return { meta: { changes: 0 } }
          if (statement.args.length > 2 && !this.annotations.has(String(statement.args[2]))) return { meta: { changes: 0 } }
          annotation.status = 'archived'
        }
        if (sql.includes('search_idx')) this.projectionWrites.push({ sql, args: statement.args })
        return { meta: { changes: 1 } }
      },
    }
    return statement
  }

  async batch(statements: any[]) { return Promise.all(statements.map((statement) => statement.run())) }
}

class AnchorSqliteD1 {
  constructor(privateSqlite: DatabaseSync) { this.sqlite = privateSqlite }
  private readonly sqlite: DatabaseSync

  prepare(sql: string) {
    const statement = {
      args: [] as unknown[],
      bind: (...args: unknown[]) => { statement.args = args; return statement },
      first: async <T>() => this.sqlite.prepare(sql).get(...statement.args as any[]) as T || null,
      all: async <T>() => ({ results: this.sqlite.prepare(sql).all(...statement.args as any[]) as T[] }),
      run: async () => {
        const result = this.sqlite.prepare(sql).run(...statement.args as any[])
        return { meta: { changes: Number(result.changes || 0) } }
      },
    }
    return statement
  }

  async batch(statements: Array<{ run: () => Promise<any> }>) {
    this.sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}

function anchorSqliteFixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE recommendations (
      id TEXT PRIMARY KEY,video_title TEXT,video_url TEXT,creator TEXT,content_type TEXT,
      dedup_key TEXT,status TEXT,deleted_at TEXT,updated_at TEXT
    );
    CREATE TABLE recommendation_meta (recommendation_id TEXT PRIMARY KEY,branch_id TEXT,source_metadata_json TEXT);
    CREATE TABLE tree_nodes (id TEXT PRIMARY KEY,label TEXT,type TEXT,status TEXT,super_category TEXT);
    CREATE TABLE learning_threads (id TEXT PRIMARY KEY,title TEXT,status TEXT,superseded_at TEXT,updated_at TEXT);
    CREATE TABLE thread_sources (thread_id TEXT,recommendation_id TEXT,status TEXT);
    CREATE TABLE learning_path_stages (id TEXT PRIMARY KEY,thread_id TEXT);
    CREATE TABLE learning_path_sources (stage_id TEXT,recommendation_id TEXT);
    CREATE TABLE thread_lessons (id TEXT PRIMARY KEY,thread_id TEXT);
    CREATE TABLE thread_lesson_sources (lesson_id TEXT,recommendation_id TEXT);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY,metadata_json TEXT);
    CREATE TABLE source_url_replacements (
      recommendation_id TEXT,previous_url TEXT,source_url TEXT,
      previous_dedup_key TEXT,source_dedup_key TEXT
    );
    CREATE TABLE source_annotations (
      id TEXT PRIMARY KEY,recommendation_id TEXT,artifact_id TEXT,thread_id TEXT,branch_id TEXT,
      locator_type TEXT,selector_json TEXT,selector_source_identities_json TEXT NOT NULL DEFAULT '[]',
      quote TEXT,context_before TEXT,context_after TEXT,language TEXT,source_checksum TEXT,
      created_by TEXT,status TEXT,revision_of_annotation_id TEXT,created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE unit_anchors (annotation_id TEXT,unit_id TEXT);
    CREATE TABLE learning_units (id TEXT PRIMARY KEY,unit_type TEXT,statement TEXT,status TEXT,confidence REAL,updated_at TEXT);
    CREATE TABLE notes (id TEXT PRIMARY KEY,title TEXT,kind TEXT,status TEXT,provenance_json TEXT,updated_at TEXT);
    CREATE TABLE srs_drafts (id TEXT PRIMARY KEY,question TEXT,answer TEXT,status TEXT,provenance_json TEXT,updated_at TEXT);
    CREATE TABLE search_idx (source TEXT,ref_id TEXT,text TEXT,PRIMARY KEY(source,ref_id));

    INSERT INTO tree_nodes VALUES ('domain','Domain','category','active',NULL),('branch','Branch','branch','active','domain');
    INSERT INTO recommendations VALUES (
      'rec','Tracked canonical','https://example.com/essay?utm_campaign=canonical','Author','article',
      'arti_example_com_essay','active',NULL,datetime('now')
    );
    INSERT INTO recommendation_meta VALUES ('rec','branch','{}');
  `)
  return { sqlite, DB: new AnchorSqliteD1(sqlite) }
}

test('source anchor checksum is deterministic and binds the exact evidence fields', async () => {
  const base = { recommendation_id: 'rec-1', locator_type: 'web', selector: { url: 'https://example.com/essay' }, quote: 'Exact claim', context_before: 'Before', context_after: 'After' }
  const first = await checksum(base)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(await checksum(base), first)
  assert.equal(await checksum({ ...base, selector: { beta: 2, alpha: 1 } }), await checksum({ ...base, selector: { alpha: 1, beta: 2 } }))
  assert.notEqual(await checksum({ ...base, quote: 'Changed claim' }), first)
})

test('source selection resolution, creation, editing, and archive preserve ownership and search projection', async () => {
  const DB = new AnchorDatabase()
  const env = { DB } as any

  const resolved = await app.request('https://app.test/resolve?source_url=https%3A%2F%2Fexample.com%2Fessay', {}, env)
  assert.equal(resolved.status, 200)
  assert.deepEqual((await resolved.json() as any).source, {
    id: 'rec-1', title: 'Grounded source', url: 'https://example.com/essay', creator: 'Author', content_type: 'article',
    branch_id: 'branch-1', branch_label: 'Evidence', branch_status: 'active', branch_domain: 'thinking', branch_verified: true, thread_id: null,
  })

  const resolvedFragment = await app.request('https://app.test/resolve?source_url=https%3A%2F%2Fexample.com%2Fessay%23claim', {}, env)
  assert.equal(resolvedFragment.status, 200)
  assert.equal((await resolvedFragment.json() as any).source.id, 'rec-1')

  DB.historicalUrl = 'https://example.com/essay?utm_source=old-share'
  DB.source.video_url = 'https://example.com/replacement'
  const resolvedHistorical = await app.request('https://app.test/resolve?source_url=https%3A%2F%2Fexample.com%2Fessay%3Futm_source%3Dnew-share%23claim', {}, env)
  assert.equal(resolvedHistorical.status, 200)
  assert.equal((await resolvedHistorical.json() as any).source.url, 'https://example.com/replacement')
  DB.source.video_url = 'https://example.com/essay'

  const created = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      recommendation_id: 'rec-1', locator_type: 'web', selector: { url: 'https://example.com/essay', text_quote: { exact: 'Exact claim' } },
      quote: 'Exact claim', context_before: 'Before', context_after: 'After', language: 'en',
    }),
  }, env)
  assert.equal(created.status, 201)
  const createdBody = await created.json() as any
  assert.equal(createdBody.annotation.branch_id, 'branch-1')
  assert.equal(createdBody.annotation.quote, 'Exact claim')
  assert.match(createdBody.annotation.source_checksum, /^[a-f0-9]{64}$/)
  assert.equal(createdBody.annotation.selector.text_quote.exact, 'Exact claim')
  assert.equal(DB.annotation.selector_json, '{"text_quote":{"exact":"Exact claim"},"url":"https://example.com/essay"}')
  assert.equal(createdBody.annotation.source_checksum, await checksum({
    recommendation_id: 'rec-1', locator_type: 'web', selector: createdBody.annotation.selector,
    quote: 'Exact claim', context_before: 'Before', context_after: 'After',
  }))
  assert.equal(DB.projectionWrites.length, 1)

  const edited = await app.request(`https://app.test/${createdBody.annotation.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quote: 'Corrected exact claim', selector: { locator: '#claim' } }),
  }, env)
  assert.equal(edited.status, 200)
  const editedBody = await edited.json() as any
  assert.notEqual(editedBody.annotation.id, createdBody.annotation.id)
  assert.equal(editedBody.annotation.revision_of_annotation_id, createdBody.annotation.id)
  assert.equal(DB.annotations.get(createdBody.annotation.id).status, 'archived')
  assert.equal(editedBody.annotation.quote, 'Corrected exact claim')
  assert.equal(editedBody.annotation.selector.locator, '#claim')
  assert.notEqual(editedBody.annotation.source_checksum, createdBody.annotation.source_checksum)
  // The revision removes the archived projection and inserts the new active one.
  assert.equal(DB.projectionWrites.length, 3)

  const languageOnly = await app.request(`https://app.test/${editedBody.annotation.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'en-US' }),
  }, env)
  assert.equal(languageOnly.status, 200)
  assert.equal((await languageOnly.json() as any).annotation.language, 'en-US')
  assert.equal(DB.projectionWrites.length, 4)

  DB.failNextInPlaceUpdate = true
  const racedLanguage = await app.request(`https://app.test/${editedBody.annotation.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'ar' }),
  }, env)
  assert.equal(racedLanguage.status, 409)
  assert.equal((await racedLanguage.json() as any).error, 'annotation_revision_conflict')
  assert.equal(DB.projectionWrites.length, 4)

  const archived = await app.request(`https://app.test/${editedBody.annotation.id}/archive`, { method: 'POST' }, env)
  assert.equal(archived.status, 200)
  assert.equal((await archived.json() as any).annotation.status, 'archived')
  assert.match(DB.projectionWrites.at(-1)?.sql || '', /DELETE FROM search_idx/)
})

test('anchor creation refuses a source that has not been mapped to a reviewed branch', async () => {
  const DB = new AnchorDatabase()
  DB.source.branch_id = null as any
  DB.source.branch_label = null as any
  DB.source.branch_status = null as any
  const response = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendation_id: 'rec-1', locator_type: 'web', quote: 'Exact claim' }),
  }, { DB } as any)
  assert.equal(response.status, 409)
  assert.equal((await response.json() as any).error, 'source_branch_required')
  assert.equal(DB.annotation, null)
})

test('anchor creation rejects a selector URL owned by a different recommendation', async () => {
  const DB = new AnchorDatabase()
  DB.source.video_url = 'https://unrelated.example/source'
  const response = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      recommendation_id: 'rec-1', locator_type: 'web', selector: { url: 'https://example.com/essay', locator: 'https://example.com/essay#claim' }, quote: 'Same exact claim',
    }),
  }, { DB } as any)
  assert.equal(response.status, 409)
  assert.equal((await response.json() as any).error, 'annotation_source_url_mismatch')
  assert.equal(DB.annotation, null)
})

test('atomic anchor creation accepts UTM and fragment variants through normalized dedup identity', async () => {
  const { sqlite, DB } = anchorSqliteFixture()
  try {
    const accepted = await app.request('https://app.test/', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recommendation_id: 'rec', locator_type: 'web',
        selector: { url: 'https://example.com/essay?utm_source=android#claim' }, quote: 'Tracked exact claim',
      }),
    }, { DB } as any)
    assert.equal(accepted.status, 201, await accepted.text())
    const stored = sqlite.prepare(`SELECT selector_json,selector_source_identities_json,source_checksum FROM source_annotations`).get() as any
    assert.equal(stored.selector_json, JSON.stringify({ url: 'https://example.com/essay?utm_source=android#claim' }))
    assert.equal(stored.selector_source_identities_json, '["https://example.com/essay"]')
    assert.equal(stored.source_checksum, await checksum({
      recommendation_id: 'rec', locator_type: 'web',
      selector: { url: 'https://example.com/essay?utm_source=android#claim' }, quote: 'Tracked exact claim',
      context_before: null, context_after: null,
    }))

    const rejected = await app.request('https://app.test/', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recommendation_id: 'rec', locator_type: 'web',
        selector: { url: 'https://example.com/unrelated?utm_source=android#claim' }, quote: 'Wrong source claim',
      }),
    }, { DB } as any)
    assert.equal(rejected.status, 409)
    assert.equal((await rejected.json() as any).error, 'annotation_source_url_mismatch')
    assert.equal((sqlite.prepare('SELECT COUNT(*) count FROM source_annotations').get() as any).count, 1)
  } finally {
    sqlite.close()
  }
})

test('anchor creation preserves an exact long Android passage and rejects an oversized selector before hashing', async () => {
  const longDB = new AnchorDatabase()
  const longQuote = `${'passage '.repeat(999)}passage`
  const longResponse = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendation_id: 'rec-1', locator_type: 'web', selector: { url: 'https://example.com/essay' }, quote: longQuote }),
  }, { DB: longDB } as any)
  assert.equal(longResponse.status, 201)
  assert.equal((await longResponse.json() as any).annotation.quote, longQuote)

  const oversizedDB = new AnchorDatabase()
  const oversized = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendation_id: 'rec-1', locator_type: 'web', selector: { exact: 'x'.repeat(12001) }, quote: 'Exact claim' }),
  }, { DB: oversizedDB } as any)
  assert.equal(oversized.status, 400)
  assert.equal((await oversized.json() as any).error, 'selector_too_large')
  assert.equal(oversizedDB.annotation, null)

  const oversizedQuoteDB = new AnchorDatabase()
  const oversizedQuote = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendation_id: 'rec-1', locator_type: 'web', quote: 'q'.repeat(10001) }),
  }, { DB: oversizedQuoteDB } as any)
  assert.equal(oversizedQuote.status, 400)
  assert.equal((await oversizedQuote.json() as any).error, 'quote_too_large')
  assert.equal(oversizedQuoteDB.annotation, null)

  const oversizedContext = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendation_id: 'rec-1', locator_type: 'web', quote: 'Exact claim', context_before: 'c'.repeat(2001) }),
  }, { DB: new AnchorDatabase() } as any)
  assert.equal(oversizedContext.status, 400)
  assert.equal((await oversizedContext.json() as any).error, 'context_too_large')
})

test('anchor creation and revision fail closed when canonical ownership changes after validation', async () => {
  const createDB = new AnchorDatabase()
  createDB.failNextOwnershipInsert = true
  const create = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendation_id: 'rec-1', locator_type: 'web', selector: { url: 'https://example.com/essay' }, quote: 'Exact claim' }),
  }, { DB: createDB } as any)
  assert.equal(create.status, 409)
  assert.equal((await create.json() as any).error, 'annotation_ownership_conflict')
  assert.equal(createDB.annotation, null)

  const reviseDB = new AnchorDatabase()
  const created = await app.request('https://app.test/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendation_id: 'rec-1', locator_type: 'web', selector: { url: 'https://example.com/essay' }, quote: 'Exact claim' }),
  }, { DB: reviseDB } as any)
  const original = (await created.json() as any).annotation
  reviseDB.failNextRevisionOwnership = true
  const revised = await app.request(`https://app.test/${original.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quote: 'Changed claim' }),
  }, { DB: reviseDB } as any)
  assert.equal(revised.status, 409)
  assert.equal((await revised.json() as any).error, 'annotation_revision_conflict')
  assert.equal(reviseDB.annotations.get(original.id).status, 'active')

  const oversizedRevision = await app.request(`https://app.test/${original.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quote: 'q'.repeat(10001) }),
  }, { DB: reviseDB } as any)
  assert.equal(oversizedRevision.status, 400)
  assert.equal((await oversizedRevision.json() as any).error, 'quote_too_large')
  assert.equal(reviseDB.annotations.get(original.id).quote, 'Exact claim')
})

test('client surfaces exact anchor search, explicit learning actions, and browser-selection intake', () => {
  const search = readFileSync('client/src/shell/SearchDialog.tsx', 'utf8')
  const learn = readFileSync('client/src/workspaces/LearnWorkspace.tsx', 'utf8')
  const library = readFileSync('client/src/workspaces/library/LibraryViews.tsx', 'utf8')
  const extension = readFileSync('browser-extension/background.js', 'utf8')
  const product = readFileSync('src/api/product.ts', 'utf8')

  assert.match(search, /annotations: \{ label: 'Source anchors'/)
  assert.match(search, /annotation=\$\{encodeURIComponent\(item\.id\)\}/)
  assert.match(learn, /Nothing is generated or retained until you submit its form/)
  assert.match(learn, /Write a note/)
  assert.match(learn, /Create a Learning Unit/)
  assert.match(learn, /Write a recall card/)
  assert.match(learn, /annotation_id: annotation\.id/)
  assert.match(library, /method: 'PATCH'/)
  assert.match(library, /\/archive`/)
  assert.match(extension, /anchor_url: sourceUrl, anchor_quote: quote/)
  assert.doesNotMatch(extension, /focus=inbox/)
  assert.match(product, /validateNoteProvenance/)
  assert.match(product, /loadSourceAnnotationEvidence/)
  const annotations = readFileSync('src/api/annotations.ts', 'utf8')
  assert.match(annotations, /source_url_replacements/)
  assert.match(annotations, /previous_dedup_key/)
  assert.match(annotations, /genericDedupSuffix/)
  assert.match(annotations, /json_extract\(metadata_json,'\$\.recommendation_id'\)=\?/)
  assert.match(annotations, /JOIN tree_nodes d ON d\.id=b\.super_category/)
  assert.match(annotations, /learning_path_sources/)
  assert.match(annotations, /thread_lesson_sources/)
  assert.match(annotations, /json_each\(CASE WHEN json_valid/)
  assert.match(annotations, /INSERT INTO source_annotations[\s\S]*SELECT \?,r\.id[\s\S]*m\.branch_id=\?/)
  assert.match(annotations, /JOIN recommendation_meta m ON m\.recommendation_id=r\.id AND a\.branch_id=m\.branch_id/)
  assert.match(annotations, /if \(!inserted\.meta\.changes\)/)
  assert.match(annotations, /revision\.revision_of_annotation_id=\?/)
  assert.match(annotations, /const serialized = stableJson\(selector\)/)
  assert.doesNotMatch(annotations, /JSON\.stringify\((?:metadata|selector)\)\.slice/)
  assert.match(extension, /const quote = info\.selectionText\.trim\(\)/)
  assert.match(extension, /if \(quote\.length > 10000\)/)
  assert.match(extension, /openAnchorLimitError\(quote\.length\)/)
  assert.doesNotMatch(extension, /selectionText\.trim\(\)\.slice/)
  assert.match(learn, /anchor_error/)
  assert.match(learn, /nothing was truncated or saved/)
  assert.doesNotMatch(library, /annotations\.slice\(0, 20\)/)

  const learningCore = readFileSync('src/api/learning-core.ts', 'utf8')
  const recall = readFileSync('src/api/learning.ts', 'utf8')
  assert.match(learningCore, /evidence\?\.locator/)
  assert.match(learningCore, /evidence\?\.quote/)
  assert.match(learningCore, /evidence\?\.source_checksum/)
  assert.match(learningCore, /soleAnnotationEvidence\?\.artifact_id/)
  assert.match(learningCore, /soleAnnotationEvidence\?\.source_checksum/)
  assert.match(recall, /const sourceAnchor = annotation\?\.locator/)
})
