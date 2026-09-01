import { readFileSync, readdirSync } from 'node:fs'

const entryUrl = new URL('../../../client/src/studio.css', import.meta.url)
const modulesUrl = new URL('../../../client/src/styles/', import.meta.url)

/** Read the authored CSS cascade exactly as Vite sees it. */
export function readStudioCss() {
  const entry = readFileSync(entryUrl, 'utf8')
  const modules = readdirSync(modulesUrl)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => readFileSync(new URL(name, modulesUrl), 'utf8'))
  return [entry, ...modules].join('\n')
}
