import { Hono } from 'hono'
import { Bindings, safeError, safeErrorMessage, isNonEmptyStr, escapeHtml } from '../lib'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/list', async (c) => {
  const { DB } = c.env
  try {
    const result = await DB.prepare(
      'SELECT id, filename, created_at, length(content) as size, substr(content, 1, 200) as snippet FROM html_files ORDER BY created_at DESC',
    ).all()
    return new Response(JSON.stringify({ files: result.results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err) {
    return c.json(safeError('List failed')(err), 500)
  }
})

app.post('/upload', async (c) => {
  const { DB } = c.env
  try {
    const { filename, content } = await c.req.json<{ filename: string; content: string }>()
    if (!filename || !content) {
      return c.json({ error: 'Filename and content required' }, 400)
    }
    if (!isNonEmptyStr(filename, 255)) {
      return c.json({ error: 'Invalid filename' }, 400)
    }
    if (!isNonEmptyStr(content, 8 * 1024 * 1024)) {
      return c.json({ error: 'Content too large (max 8MB)' }, 413)
    }
    const id = `html_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    await DB.prepare('INSERT INTO html_files (id, filename, content) VALUES (?, ?, ?)')
      .bind(id, filename, content)
      .run()
    return c.json({ ok: true, id })
  } catch (err) {
    return c.json(safeError('Upload failed')(err), 500)
  }
})

app.get('/download/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  try {
    const file = await DB.prepare('SELECT filename, content FROM html_files WHERE id = ?')
      .bind(id)
      .first<{ filename: string; content: string }>()
    if (!file) {
      return c.text('File not found', 404)
    }
    const isPdf = file.filename.endsWith('.pdf')
    const body = isPdf ? Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0)) : file.content
    return new Response(body, {
      headers: {
        'Content-Type': isPdf ? 'application/pdf' : 'text/html; charset=utf-8',
        'Content-Disposition': `${isPdf ? 'inline' : 'inline'}; filename="${encodeURIComponent(file.filename)}"`,
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('[html/download]', safeErrorMessage(err))
    return c.text('Download failed', 500)
  }
})

app.post('/update/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  try {
    const { filename, content } = await c.req.json<{ filename?: string; content?: string }>()
    if (content === undefined && filename === undefined) {
      return c.json({ error: 'filename or content required' }, 400)
    }
    if (content !== undefined) {
      if (content.length === 0) {
        return c.json({ error: 'Content cannot be empty' }, 400)
      }
      if (content.length > 8 * 1024 * 1024) {
        return c.json({ error: 'Content too large (max 8MB)' }, 413)
      }
    }
    if (filename !== undefined && !isNonEmptyStr(filename, 255)) {
      return c.json({ error: 'Invalid filename' }, 400)
    }
    if (filename !== undefined && content !== undefined) {
      await DB.prepare('UPDATE html_files SET filename = ?, content = ? WHERE id = ?').bind(filename, content, id).run()
    } else if (filename !== undefined) {
      await DB.prepare('UPDATE html_files SET filename = ? WHERE id = ?').bind(filename, id).run()
    } else {
      await DB.prepare('UPDATE html_files SET content = ? WHERE id = ?').bind(content, id).run()
    }
    return c.json({ ok: true, id })
  } catch (err) {
    return c.json(safeError('Update failed')(err), 500)
  }
})

app.post('/delete', async (c) => {
  const { DB } = c.env
  try {
    const { id, undo } = await c.req.json<{ id: string; undo?: boolean }>()
    if (!id) return c.json({ error: 'ID required' }, 400)
    if (!isNonEmptyStr(id, 100)) return c.json({ error: 'ID required' }, 400)

    if (undo) {
      const row = await DB.prepare('SELECT * FROM html_files WHERE id = ?').bind(id).first<any>()
      if (!row) return c.json({ error: 'not found' }, 404)
      await DB.batch([
        DB.prepare(
          "INSERT OR REPLACE INTO undo_queue (id, table_name, row_id, snapshot_json, expires_at) VALUES (?, 'html_files', ?, ?, datetime('now', '+30 seconds'))",
        ).bind(id, id, JSON.stringify(row)),
        DB.prepare('DELETE FROM html_files WHERE id = ?').bind(id),
      ])
    } else {
      await DB.prepare('DELETE FROM html_files WHERE id = ?').bind(id).run()
    }
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Delete failed')(err), 500)
  }
})

app.post('/undo', async (c) => {
  const { DB } = c.env
  try {
    const { id } = await c.req.json<{ id: string }>()
    if (!id) return c.json({ error: 'ID required' }, 400)
    const row = await DB.prepare("SELECT * FROM undo_queue WHERE id = ? AND expires_at > datetime('now')")
      .bind(id)
      .first<any>()
    if (!row) return c.json({ error: 'nothing to undo or expired' }, 404)

    if (row.table_name === 'html_files') {
      const snap = JSON.parse(row.snapshot_json)
      await DB.prepare('INSERT OR REPLACE INTO html_files (id, filename, content) VALUES (?, ?, ?)')
        .bind(snap.id, snap.filename, snap.content)
        .run()
    }
    await DB.prepare('DELETE FROM undo_queue WHERE id = ?').bind(id).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json(safeError('Undo failed')(err), 500)
  }
})

// GET /html/print/:id — wraps HTML file in A4 print-friendly view
app.get('/print/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  try {
    const file = await DB.prepare('SELECT filename, content FROM html_files WHERE id = ?')
      .bind(id)
      .first<{ filename: string; content: string }>()
    if (!file) {
      return c.text('File not found', 404)
    }

    const safeFilename = escapeHtml(file.filename)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Print — ${safeFilename}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 15mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Literata', Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.7;
    color: #1a1a1a;
    background: #fff;
    padding: 20px;
    max-width: 720px;
    margin: 0 auto;
    -webkit-font-smoothing: antialiased;
  }
  .print-toolbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: #1a1a1a;
    color: #fff;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: system-ui, sans-serif;
    z-index: 9999;
  }
  .print-toolbar span { font-size: 14px; }
  .print-toolbar button {
    background: #fff;
    color: #1a1a1a;
    border: none;
    padding: 8px 20px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .print-toolbar button:hover { opacity: 0.9; }
  .print-content { margin-top: 60px; }

  @media print {
    .print-toolbar { display: none !important; }
    body { padding: 0; max-width: none; font-size: 11pt; }
    .print-content { margin-top: 0; }
    a { color: #000 !important; text-decoration: underline; word-wrap: break-word; }
    a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; }
    pre, code { background: #f5f5f5 !important; border: 1px solid #ddd; page-break-inside: avoid; font-size: 9pt; }
    h1, h2, h3, h4 { page-break-after: avoid; }
    img { max-width: 100% !important; page-break-inside: avoid; }
    section, .card, .block { break-inside: avoid; border: 1px solid #ccc !important; box-shadow: none !important; }
    p { orphans: 3; widows: 3; }
  }
</style>
</head>
<body>
<div class="print-toolbar no-print">
 <span>🖨️ ${safeFilename}</span>
 <button onclick="window.print()">Print / Save PDF</button>
</div>
<div class="print-content">
${file.content}
</div>
<script>
window.onload = function() {};
</script>
</body>
</html>`

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'ALLOWALL' },
    })
  } catch (err) {
    console.error('[html/print]', safeErrorMessage(err))
    return c.text('Print view failed', 500)
  }
})

/**
 * POST /html/sync-srs
 * Parse uploaded HTML study guide and extract Q&A blocks to create flashcards in srs_cards table.
 */
app.post('/sync-srs', async (c) => {
  return c.json(
    {
      error: 'automated_recall_disabled',
      message: 'HTML flash-card sync is disabled. Create an Arabic card explicitly in Recall.',
    },
    409,
  )
})

export default app
