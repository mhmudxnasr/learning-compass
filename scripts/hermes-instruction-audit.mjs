import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

// Static checks for executable instructions, not a claim to understand arbitrary prose.
// Historical state belongs in CURRENT_STATE.md; examples/output paths are not inputs.
export function auditInstructions({ documents, repoRoot, skillsRoot, packageScripts, exists = existsSync }) {
  const issues = []
  const repoAlias = '/home/mahmud/recommendations-worker'
  const canonicalSkills = '/home/mahmud/.hermes/skills'
  const remap = (path) => {
    path = path.replace(/^~\//, '/home/mahmud/')
    for (const [from, to] of [
      [repoAlias, repoRoot],
      [canonicalSkills, skillsRoot],
    ]) {
      if (path === from || path.startsWith(`${from}/`)) return to + path.slice(from.length)
    }
    return path
  }
  const placeholder = (path) => /[<>${}*]|\.\.\.|^\/(?:abs|path|example|tmp)\//.test(path)
  for (const document of documents) {
    const add = (line, code, detail) => issues.push({ path: document.path, line, code, detail })
    const checked = new Set()
    const checkPath = (raw, line, linked = false) => {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(raw) || placeholder(raw)) return
      let path = raw.split('#')[0]
      if (!path) return
      try {
        path = decodeURIComponent(path)
      } catch {
        add(line, 'invalid-local-link', raw)
        return
      }
      let target
      if (isAbsolute(path) || path.startsWith('~/')) target = remap(path)
      else if (linked) target = resolve(dirname(document.path), path)
      else if (/^(?:references|scripts|assets)\//.test(path))
        target = resolve(
          document.text.includes('<!-- command-root: repository -->') ? repoRoot : document.skillRoot || repoRoot,
          path,
        )
      else return
      if (checked.has(target)) return
      checked.add(target)
      if (!exists(target)) add(line, 'missing-local-path', raw)
    }
    let fence = false
    for (const [index, line] of document.text.split('\n').entries()) {
      const number = index + 1
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence
        continue
      }
      for (const match of line.matchAll(/\bnpm\s+run(?:-script)?\s+([a-zA-Z][\w:.-]*)/g)) {
        const name = match[1]
        if (!Object.hasOwn(packageScripts, name)) add(number, 'missing-npm-script', name)
      }
      if (
        /\bhermes\s+(?:(?:-p|--profile)(?:\s+|=)["']?compass\b|profile\s+(?:create|use)\s+["']?compass\b)/.test(line)
      ) {
        add(number, 'retired-hermes-profile', 'Use native Hermes (default); the separate Compass profile is retired.')
      }
      if (!fence) {
        for (const match of line.matchAll(/\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
          checkPath(match[1] || match[2], number, true)
        }
        for (const match of line.matchAll(/`([^`\n]+)`/g)) {
          const path = match[1]
          // Only concrete file references. API routes and generated example filenames are excluded.
          if (
            !/\s/.test(path) &&
            /^(?:~\/|\/home\/|references\/|scripts\/|assets\/)/.test(path) &&
            /\.(?:md|py|mjs|js|sh|json|ya?ml|toml)$/.test(path)
          ) {
            checkPath(path, number)
          }
        }
      }
      for (const match of line.matchAll(/(?:^|[\s`])(?:python3?|node|bash)\s+(?:"([^"]+)"|'([^']+)'|([^\s`"']+))/g)) {
        const operand = match[1] || match[2] || match[3]
        if (/\.(?:py|mjs|js|sh)$/.test(operand)) checkPath(operand, number)
      }
      if (
        line
          .split(/(?<=[.!?])\s+(?=[A-Z])/u)
          .some(
            (statement) =>
              /\b0\d{3}\b|\b0\d{3}_/i.test(statement) &&
              !/\b(?:check|verify|determine|read|compare|inspect)\b.{0,80}\b(?:whether|if|which)\b/i.test(statement) &&
              /\balready (?:applied|deployed)\b|\b(?:is|are|remains?) (?:still )?(?:undeployed|deployed|pending|applied)\b|\bas pending\b|\b(?:exact|only) (?:ordered )?pending set\b/i.test(
                statement,
              ),
          )
      ) {
        add(
          number,
          'frozen-migration-state',
          'Determine the pending set from the live ledger; keep dated deployment facts in CURRENT_STATE.md.',
        )
      }
      if (
        /\b(?:say exactly|quote .{0,50}label.{0,12}exactly|final (?:line|response|receipt).{0,80}(?:must print|prints)|Recommendation results print the literal|Return (?:the canonical|the compact|one compact) receipt|Return the receipt:|Report: `intent|Return `intent)/i.test(
          line,
        )
      ) {
        add(
          number,
          'forced-response-template',
          'Keep exact evidence in the operation receipt; allow natural user-facing wording.',
        )
      }
      if (/Worker adapter may expose only `list_capabilities` and `site_request`/.test(line)) {
        add(number, 'retired-adapter-surface', 'Use the installed native Compass tools and shared site client.')
      }
      if (!document.skillRoot && /`source-scope\.json` must partition|The deterministic v6 gate checks/.test(line)) {
        add(
          number,
          'retired-lite-visual-workflow',
          'Project guidance must use direct authoring and integrity-only receipts; historical v6 checks belong to their compatibility procedure.',
        )
      }
      if (/\bThe current deployment is\s+`?[a-f\d]{8}-[a-f\d-]+/i.test(line)) {
        add(
          number,
          'frozen-deployment-state',
          'Keep dated deployment observations in CURRENT_STATE.md and release-snapshot.json.',
        )
      }
    }
  }
  return issues
}

export function instructionDocuments(repoRoot, skillsRoot, activeSkills) {
  const documents = []
  const visit = (directory, skillRoot, inReferences = false) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory() && (inReferences || entry.name === 'references')) visit(path, skillRoot, true)
      else if (entry.isFile() && entry.name.endsWith('.md'))
        documents.push({ path, skillRoot, text: readFileSync(path, 'utf8') })
    }
  }
  for (const skill of activeSkills) {
    const skillRoot = join(skillsRoot, skill.path)
    visit(skillRoot, skillRoot)
  }
  for (const file of ['.hermes.md', 'docs/hermes-production.md']) {
    const path = join(repoRoot, file)
    documents.push({ path, text: readFileSync(path, 'utf8') })
  }
  return documents
}

export function formatInstructionIssues(issues, repoRoot) {
  return issues
    .map(({ path, line, code, detail }) => `${relative(repoRoot, path)}:${line}: ${code}: ${detail}`)
    .join('\n')
}
