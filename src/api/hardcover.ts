import { Hono } from 'hono'
import { redactSensitiveText, type Bindings } from '../lib'
import { importHardcoverBooks, loadHardcoverLibrary, syncHardcoverLibrary } from '../services/hardcover'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => c.json(await loadHardcoverLibrary(c.env.DB, Boolean(c.env.HARDCOVER_API_TOKEN))))

app.post('/sync', async (c) => {
  const token = String(c.env.HARDCOVER_API_TOKEN || '').trim()
  if (!token) return c.json({ error: 'hardcover_not_configured' }, 503)
  try {
    return c.json({ ok: true, ...(await syncHardcoverLibrary(c.env.DB, token)) })
  } catch (error) {
    return c.json({ error: 'hardcover_sync_failed', detail: error instanceof Error ? redactSensitiveText(error, 240) : 'Hardcover sync failed' }, 502)
  }
})

app.post('/import', async (c) => {
  const body = await c.req.json<{ branch_id?: string; book_ids?: number[] }>().catch(() => ({} as { branch_id?: string; book_ids?: number[] }))
  const branchId = String(body.branch_id || '').trim()
  if (!branchId) return c.json({ error: 'branch_id required' }, 400)
  if (body.book_ids !== undefined && (!Array.isArray(body.book_ids) || body.book_ids.some((id) => !Number.isInteger(id) || id <= 0))) return c.json({ error: 'book_ids must contain positive integers' }, 400)
  try {
    return c.json({ ok: true, ...(await importHardcoverBooks(c.env.DB, branchId, body.book_ids)) })
  } catch (error) {
    return c.json({ error: 'hardcover_import_failed', detail: error instanceof Error ? redactSensitiveText(error, 240) : 'Hardcover import failed' }, 500)
  }
})

export default app
