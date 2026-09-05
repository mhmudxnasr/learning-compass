import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { createServer, type ViteDevServer } from 'vite'
import { cairoDate, loadLearningCalendar, validCalendarDate } from '../../src/services/learning-calendar.ts'
import { buildZip } from '../../client/src/features/export/zip.ts'

let vite: ViteDevServer
let exportThread: typeof import('../../src/services/thread-obsidian-export.ts').buildThreadObsidianExport
let home: any
test.before(async () => {
  vite = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  exportThread = (await vite.ssrLoadModule('/src/services/thread-obsidian-export.ts')).buildThreadObsidianExport
  home = (await vite.ssrLoadModule('/src/api/home.ts')).default
})
test.after(async () => {
  await vite.close()
})

function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE recommendations(id TEXT PRIMARY KEY,video_title TEXT,video_url TEXT,content_type TEXT,creator TEXT,notebook_url TEXT,status TEXT DEFAULT 'active',deleted_at TEXT);
    CREATE TABLE recommendation_meta(recommendation_id TEXT,branch_id TEXT);
    CREATE TABLE tree_nodes(id TEXT,label TEXT,super_category TEXT,status TEXT DEFAULT 'active');
    CREATE TABLE learning_threads(id TEXT PRIMARY KEY,title TEXT,guiding_question TEXT,definition_of_done TEXT,final_synthesis TEXT,superseded_at TEXT);
    CREATE TABLE learning_path_stages(id TEXT PRIMARY KEY,thread_id TEXT,position INTEGER,title TEXT,objective TEXT);
    CREATE TABLE thread_lessons(id TEXT PRIMARY KEY,thread_id TEXT,stage_id TEXT,position INTEGER,title TEXT,status TEXT,content TEXT);
    CREATE TABLE thread_sources(thread_id TEXT,recommendation_id TEXT,role TEXT,position INTEGER,status TEXT);
    CREATE TABLE learning_path_sources(stage_id TEXT,recommendation_id TEXT,role TEXT,position INTEGER);
    CREATE TABLE thread_lesson_sources(lesson_id TEXT,recommendation_id TEXT,role TEXT,position INTEGER);
    CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT,kind TEXT,thread_id TEXT,stage_id TEXT,lesson_id TEXT,recommendation_id TEXT,branch_id TEXT,source_url TEXT,created_at TEXT,updated_at TEXT,revision INTEGER,extraction_contract TEXT);
    CREATE TABLE note_sections(id TEXT,note_id TEXT,section_key TEXT,label TEXT,content TEXT,direction TEXT,position INTEGER);
    CREATE TABLE artifacts(id TEXT,filename TEXT,media_type TEXT,size_bytes INTEGER,metadata_json TEXT,created_at TEXT);
    CREATE TABLE srs_cards(id TEXT,question TEXT);
    CREATE TABLE learning_activity_ledger(event_key TEXT,event_type TEXT,occurred_at TEXT,recommendation_id TEXT,note_id TEXT,card_id TEXT);
    CREATE TABLE learning_events(id TEXT,event_type TEXT,occurred_at TEXT,is_explicit INTEGER,thread_id TEXT,recommendation_id TEXT,payload_json TEXT);
    CREATE TABLE book_visual_chapters(recommendation_id TEXT,chapter_key TEXT,chapter_title TEXT);
    INSERT INTO learning_threads VALUES('thread','Systems / تطبيق','Why?','Understand','My synthesis',NULL);
    INSERT INTO learning_path_stages VALUES('level-2','thread',1,'Second','Later'),('level-1','thread',0,'First','Start');
    INSERT INTO thread_lessons VALUES('lesson-2','thread','level-2',0,'Later lesson','not_started','Second body'),('lesson-1','thread','level-1',0,'First lesson','completed','First body');
    INSERT INTO recommendations(id,video_title,video_url,content_type) VALUES('book','Book','https://example.com/book','book'),('talk','Talk','https://example.com/talk','video');
    INSERT INTO tree_nodes VALUES('domain','Domain',NULL,'active'),('branch','Branch','domain','active');
    INSERT INTO recommendation_meta VALUES('book','branch'),('talk','branch');
    INSERT INTO thread_lesson_sources VALUES('lesson-1','book','primary',0),('lesson-2','talk','case',0);
    INSERT INTO notes VALUES('note-1','Same title','source',NULL,NULL,'lesson-1','book','branch',NULL,'2026-09-01','2026-09-01',1,'source_note_v2');
    INSERT INTO notes VALUES('note-2','Same title','reflection',NULL,NULL,'lesson-1','book','branch',NULL,'2026-09-01','2026-09-01',1,NULL);
    INSERT INTO notes VALUES('note-3','Later note','source',NULL,NULL,'lesson-2','talk','branch',NULL,'2026-09-01','2026-09-01',1,'source_note_v2');
    INSERT INTO notes VALUES('outside','Other Thread secret','source','different-thread',NULL,NULL,'book','branch',NULL,'2026-09-01','2026-09-01',1,'source_note_v2');
    INSERT INTO note_sections VALUES('s1','note-1','claim','Source claim','Exact source claim.','ltr',0),('s2','note-1','explanation','شرح','شرح الفكرة بالمصري.','rtl',1),('s3','note-2','reflection','ملاحظة بخط اليد - صفحة 2','كلامي زي ما كتبته [كلمة غير واضحة].','rtl',0);
    INSERT INTO book_visual_chapters VALUES('book','chapter-1','First chapter');
  `)
  const DB = {
    prepare(sql: string) {
      let args: any[] = []
      return {
        bind(...values: any[]) {
          args = values
          return this
        },
        async first() {
          return sqlite.prepare(sql).get(...args) || null
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) }
        },
      }
    },
  } as unknown as D1Database
  return { sqlite, DB }
}

test('calendar uses Cairo winter/summer dates and validates real dates', () => {
  assert.equal(cairoDate('2026-01-01T21:30:00Z'), '2026-01-01')
  assert.equal(cairoDate('2026-07-01T21:30:00Z'), '2026-07-02')
  assert.equal(validCalendarDate('2026-02-30'), false)
  assert.equal(validCalendarDate('2028-02-29'), true)
})

test('calendar counts real events, includes corrections, excludes passive actions and paginates a busy day', async () => {
  const { sqlite, DB } = fixture()
  sqlite.exec(`INSERT INTO srs_cards VALUES('card','A question');
    INSERT INTO learning_events VALUES('lesson-done','lesson_status_changed','2026-09-01 21:30:00',1,'thread',NULL,'{"lesson_id":"lesson-1","from":"in_progress","to":"completed"}');
    INSERT INTO learning_events VALUES('lesson-undo','lesson_status_changed','2026-09-01 21:40:00',1,'thread',NULL,'{"lesson_id":"lesson-1","from":"completed","to":"in_progress"}');
    INSERT INTO learning_events VALUES('auto-start','lesson_status_changed','2026-09-01 21:40:00',0,'thread',NULL,'{"lesson_id":"lesson-2","from":"not_started","to":"in_progress"}');
    INSERT INTO learning_events VALUES('chapter','personal_library_updated','2026-09-01 21:30:00',0,NULL,'book','{"chapter_key":"chapter-1","completed":true,"source":"books_chapter_progress"}');
    INSERT INTO learning_activity_ledger VALUES('passive','session_started','2026-09-01 21:30:00','book',NULL,NULL);
    INSERT INTO learning_activity_ledger VALUES('note','note_created','2026-09-01 21:30:00','book','note-1',NULL);`)
  for (let index = 0; index < 53; index++)
    sqlite
      .prepare('INSERT INTO learning_activity_ledger VALUES(?,?,?,?,?,?)')
      .run(`review-${index}`, 'recall_reviewed', '2026-09-01 21:30:00', 'book', null, 'card')
  const result = await loadLearningCalendar(DB, '2026-09', '2026-09-02')
  assert.equal(result.total, 57)
  assert.equal(result.events.length, 50)
  assert.equal(result.next_offset, 50)
  assert.equal(result.days[0].counts.lesson_reopened, 1)
  assert.equal(result.days[0].counts.chapter_completed, 1)
  assert.equal(result.days[0].date, '2026-09-02')
  const rest = await loadLearningCalendar(DB, '2026-09', '2026-09-02', 50)
  assert.equal(rest.events.length, 7)
  assert.equal(rest.next_offset, null)
  const dayIds = [...result.events, ...rest.events].map((event) => event.id)
  assert.equal(new Set(dayIds).size, 57)
  assert.equal((await loadLearningCalendar(DB, '2026-09', '2026-09-01')).total, 0)
  sqlite.close()
})

test('calendar HTTP input validation happens before database access', async () => {
  for (const query of ['month=2026-13', 'month=2026-02&day=2026-02-30', 'month=2026-01&day=2026-02-01', 'offset=-1']) {
    assert.equal((await home.request(`/activity?${query}`, {}, {})).status, 400)
  }
})

test('calendar keeps events on the correct day across Cairo midnight DST transitions', async () => {
  const { sqlite, DB } = fixture()
  for (const [id, timestamp] of [
    ['spring-before', '2026-04-23 21:30:00'],
    ['spring-after', '2026-04-23 22:30:00'],
    ['fall-first', '2026-10-29 20:30:00'],
    ['fall-repeated', '2026-10-29 21:30:00'],
    ['fall-next', '2026-10-29 22:30:00'],
  ])
    sqlite
      .prepare('INSERT INTO learning_activity_ledger VALUES(?,?,?,?,?,?)')
      .run(id, 'note_created', timestamp, 'book', 'note-1', null)
  assert.equal((await loadLearningCalendar(DB, '2026-04', '2026-04-23')).total, 1)
  assert.equal((await loadLearningCalendar(DB, '2026-04', '2026-04-24')).events[0].id, 'spring-after')
  const repeated = await loadLearningCalendar(DB, '2026-10', '2026-10-29')
  assert.equal(repeated.total, 2)
  assert.equal(repeated.events.length, 2)
  assert.equal((await loadLearningCalendar(DB, '2026-10', '2026-10-30')).total, 1)
  sqlite.close()
})

test('Obsidian export preserves book extraction and handwriting, exact ownership, ordering and resolvable links', async () => {
  const { sqlite, DB } = fixture()
  const packet = await exportThread(DB, 'thread', 'https://compass.example')
  assert.equal(packet.summary.notes, 3)
  assert.equal(packet.summary.lessons, 2)
  assert.equal(new Set(packet.files.map((file) => file.path)).size, packet.files.length)
  assert(!packet.files.some((file) => file.content.includes('Other Thread secret')))
  const index = packet.files.find((file) => file.path.endsWith('/Start here.md'))!.content
  assert(index.indexOf('First lesson') < index.indexOf('Later lesson'))
  assert(index.includes('/#/learn/t/thread/l/lesson-1'))
  assert(packet.files.some((file) => file.content.includes('كلامي زي ما كتبته [كلمة غير واضحة].')))
  assert(
    packet.files.some(
      (file) => file.content.includes('Exact source claim.') && file.content.includes('شرح الفكرة بالمصري.'),
    ),
  )
  const paths = new Set(packet.files.map((file) => file.path.replace(/\.md$/, '')))
  for (const file of packet.files)
    for (const match of file.content.matchAll(/\[\[([^|\]]+)\|[^\]]+\]\]/g)) assert(paths.has(match[1]), match[1])
  const level = await exportThread(DB, 'thread', 'https://compass.example', 'level-1')
  assert.notEqual(
    level.files[0].path.split('/')[0],
    packet.files[0].path.split('/')[0],
    'Level downloads must not overwrite the whole-Thread index',
  )
  assert.equal(level.summary.notes, 2)
  assert.equal(level.summary.lessons, 1)
  assert(!level.files.some((file) => file.content.includes('Second body')))
  await assert.rejects(exportThread(DB, 'thread', 'https://compass.example', 'foreign-level'), /Level not found/)
  sqlite.close()
})

test('Obsidian export includes only coherent visible chapter pairs and excludes deleted sources', async () => {
  const { sqlite, DB } = fixture()
  for (const role of ['html', 'pdf'])
    sqlite
      .prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?)')
      .run(
        `synthetic-${role}`,
        `book.${role}`,
        role === 'html' ? 'text/html' : 'application/pdf',
        100,
        JSON.stringify({
          recommendation_id: 'book',
          scope: 'book',
          chapter_key: 'book',
          position: 0,
          pair_id: 'synthetic',
          role,
          publication_state: 'ready',
        }),
        '2026-09-01',
      )
  for (const pairId of ['ready', 'staged', 'superseded'])
    for (const role of ['html', 'pdf'])
      sqlite.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?)').run(
        `${pairId}-${role}`,
        `chapter.${role}`,
        role === 'html' ? 'text/html' : 'application/pdf',
        100,
        JSON.stringify({
          recommendation_id: 'book',
          scope: 'book',
          chapter_key: 'chapter-1',
          pair_id: pairId,
          role,
          publication_state: pairId,
        }),
        '2026-09-01',
      )
  const packet = await exportThread(DB, 'thread', 'https://compass.example')
  assert.equal(packet.attachments.length, 2)
  assert(packet.attachments.every((file) => file.url.startsWith('/artifacts/ready-')))
  sqlite.exec("UPDATE recommendations SET deleted_at='2026-09-02' WHERE id='book'")
  const deleted = await exportThread(DB, 'thread', 'https://compass.example')
  assert.equal(deleted.attachments.length, 0)
  assert.equal(deleted.summary.notes, 1)
  sqlite.close()
})

test('ZIP opens in Python zipfile with Unicode names, exact bytes and valid CRCs', async () => {
  const blob = buildZip([
    { path: 'تعلم/ملاحظات.md', bytes: new TextEncoder().encode('النص الأصلي\n\nEnglish.') },
    { path: 'Attachments/file.pdf', bytes: new Uint8Array([0, 255, 123]) },
  ])
  const result = spawnSync(
    'python3',
    [
      '-c',
      'import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({p:list(z.read(p)) for p in z.namelist()}))',
    ],
    { input: Buffer.from(await blob.arrayBuffer()), encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const files = JSON.parse(result.stdout)
  assert.deepEqual(files['Attachments/file.pdf'], [0, 255, 123])
  assert.equal(new TextDecoder().decode(new Uint8Array(files['تعلم/ملاحظات.md'])), 'النص الأصلي\n\nEnglish.')
  assert.throws(() => buildZip([{ path: '../outside.md', bytes: new Uint8Array() }]), /Invalid/)
})
