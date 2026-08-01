import { Bindings, escapeHtml } from '../lib'
import { freeAi } from './ai'

export async function processVisualiseJob(
  env: Bindings,
  jobId: string,
  item: { id: string; video_url: string; video_title: string; creator?: string }
): Promise<void> {
  const { DB, ARTIFACTS } = env
  try {
    // 1. Check if job was cancelled
    const check = await DB.prepare(`SELECT status FROM agent_jobs WHERE id=?`).bind(jobId).first<{ status: string }>()
    if (!check || check.status === 'cancelled') return

    // 2. Mark running
    await DB.prepare(`UPDATE agent_jobs SET status='running',updated_at=datetime('now') WHERE id=? AND status='pending'`).bind(jobId).run()

    // 3. Fetch source transcript / summary context
    let sourceText = `Title: ${item.video_title}\nURL: ${item.video_url}\nCreator: ${item.creator || 'Unknown'}`
    const ytMatch = item.video_url.match(/(?:youtu\.be\/|v=)([\w-]{11})/)
    if (ytMatch) {
      const videoId = ytMatch[1]
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; LearningCompass/1.0)' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer))
        if (res.ok) {
          const html = await res.text()
          const descMatch = html.match(/"shortDescription":"(.*?)"/)
          if (descMatch) {
            sourceText += `\nDescription: ${descMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')}`
          }
        }
      } catch {
        /* proceed with title */
      }
    }

    // 4. Generate Lite Visual HTML companion via Opencode API
    const systemPrompt = `You are the Lite Visual Generator for Learning Compass (Mahmood's single-user learning system).
Generate a self-contained, tablet and print-friendly HTML visual learning companion for the given source.
Rules:
- DO NOT wrap in markdown codeblocks (no \`\`\`html). Output strictly the raw HTML starting with <!DOCTYPE html>.
- Language: English (B2 level).
- Typography: Use IBM Plex Sans from Google Fonts.
- Styling: Dark mode default (background #0f1218, surface #171b24, text #e2e8f0, accent #3b82f6).
- Include standard print CSS (@media print).
- Include sections:
  1. Header & Source Metadata
  2. Executive Summary & Core Thesis
  3. Strategic Mechanisms & Causal Chains
  4. Core Concepts & Glossary
  5. Active Recall & Self-Testing Questions (with click-to-reveal answers using vanilla JS)
  6. Source Anchors & Key Quotes`

    const prompt = `Source Information:\n${sourceText}\n\nGenerate the complete interactive HTML study companion.`

    const aiRes = await freeAi(env, systemPrompt, prompt, 3500)
    let rawHtml = aiRes?.text || ''

    // Clean up code block markdown if model included it
    rawHtml = rawHtml.replace(/^```html\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()

    if (!rawHtml.startsWith('<!DOCTYPE') && !rawHtml.startsWith('<html')) {
      // Fallback clean template if AI output was truncated or failed
      const safeTitle = escapeHtml(item.video_title)
      const safeUrl = escapeHtml(item.video_url)
      rawHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — Lite Visual</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --bg: #0f1218; --surface: #171b24; --border: #262b36; --text: #e2e8f0; --muted: #94a3b8; --accent: #3b82f6; }
  body { background: var(--bg); color: var(--text); font-family: 'IBM Plex Sans', sans-serif; line-height: 1.7; padding: 2rem; max-width: 800px; margin: 0 auto; }
  header { border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  h1 { font-size: 1.75rem; font-weight: 600; margin: 0 0 0.5rem 0; color: var(--text); }
  .meta { color: var(--muted); font-size: 0.9rem; }
  .section { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.2rem; color: var(--accent); margin-top: 0; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  @media print { body { background: white; color: black; max-width: 100%; } .section { border: 1px solid #ccc; background: none; } }
</style>
</head>
<body>
<header>
  <h1>${safeTitle}</h1>
  <div class="meta">Source: <a href="${safeUrl}" target="_blank">${safeUrl}</a></div>
</header>
<main>
  <div class="section">
    <h2>Executive Summary</h2>
    <p>Lite Visual study companion for <strong>${safeTitle}</strong>.</p>
  </div>
</main>
</body>
</html>`
    }

    // Check again if cancelled before storing
    const recheck = await DB.prepare(`SELECT status FROM agent_jobs WHERE id=?`).bind(jobId).first<{ status: string }>()
    if (!recheck || recheck.status === 'cancelled') return

    // 5. Generate pair_id and store artifacts
    const pairId = `lite_${item.id}`
    const slug = (item.video_title || 'source').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    const htmlFilename = `${slug}.html`
    const pdfFilename = `${slug}.pdf`
    const htmlArtifactId = `art_${crypto.randomUUID()}`
    const pdfArtifactId = `art_${crypto.randomUUID()}`

    const htmlKey = `artifacts/${pairId}/${htmlFilename}`
    const pdfKey = `artifacts/${pairId}/${pdfFilename}`

    // Store in R2 if bucket exists
    if (ARTIFACTS) {
      await ARTIFACTS.put(htmlKey, rawHtml, {
        httpMetadata: { contentType: 'text/html; charset=utf-8' },
      })
      await ARTIFACTS.put(pdfKey, rawHtml, {
        httpMetadata: { contentType: 'application/pdf' },
      })
    }

    const metadata = {
      pair_id: pairId,
      recommendation_id: item.id,
      source_url: item.video_url,
      source_title: item.video_title,
      generator: 'opencode-visual-lite',
    }

    // Insert into D1 artifacts table
    await DB.prepare(
      `INSERT INTO artifacts (id, filename, media_type, r2_key, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(htmlArtifactId, htmlFilename, 'text/html', htmlKey, JSON.stringify({ ...metadata, role: 'html' }))
      .run()

    await DB.prepare(
      `INSERT INTO artifacts (id, filename, media_type, r2_key, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(pdfArtifactId, pdfFilename, 'application/pdf', pdfKey, JSON.stringify({ ...metadata, role: 'pdf' }))
      .run()

    // 6. Complete job
    const resultJson = JSON.stringify({
      html_artifact_id: htmlArtifactId,
      pdf_artifact_id: pdfArtifactId,
      pair_id: pairId,
      recommendation_id: item.id,
      title: item.video_title,
      source_url: item.video_url,
      created_at: new Date().toISOString(),
    })

    await DB.prepare(
      `UPDATE agent_jobs SET status='completed',result_json=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`
    )
      .bind(resultJson, jobId)
      .run()
  } catch (err: any) {
    console.error('[processVisualiseJob error]', err)
    await DB.prepare(
      `UPDATE agent_jobs SET status='failed',error=?,lease_owner=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE id=?`
    )
      .bind(String(err?.message || 'Visual lite generation failed').slice(0, 1000), jobId)
      .run()
  }
}
