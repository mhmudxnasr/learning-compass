import type { PathArtifact, PathSource } from './types'

export type SourceMaterialKind = 'original' | 'html' | 'pdf' | 'notebooklm'

export interface SourceMaterialOption {
  kind: SourceMaterialKind
  format: string
  href: string
  label: string
  purpose: string
  availability: 'Linked' | 'Indexing' | 'Ready to ask' | 'Building' | 'Ready' | 'Needs attention' | 'Saved'
  details: string[]
}

export interface SourceMaterialLauncher {
  primary: SourceMaterialOption
  alternatives: SourceMaterialOption[]
  explicitlyRecommended: boolean
}

const recommendedKinds = new Set<SourceMaterialKind>(['original', 'html', 'pdf', 'notebooklm'])
const artifactHref = (id: string) => `/artifacts/${encodeURIComponent(id)}`

function artifactMetadata(artifact?: PathArtifact): Record<string, unknown> {
  if (!artifact) return {}
  if (artifact.metadata && typeof artifact.metadata === 'object') return artifact.metadata
  if (!artifact.metadata_json) return {}
  try {
    const parsed = JSON.parse(artifact.metadata_json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function formatBytes(value?: number | null): string {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function artifactDetails(artifact: PathArtifact, kind: 'html' | 'pdf'): string[] {
  const metadata = artifactMetadata(artifact)
  const details: string[] = []
  const size = formatBytes(artifact.size_bytes)
  const pages = Number(metadata.page_count)
  const revision = String(metadata.revision || '').trim()
  const language = String(metadata.language || metadata.lang || '')
    .trim()
    .toLowerCase()

  if (kind === 'pdf' && Number.isFinite(pages) && pages > 0) details.push(`${pages} ${pages === 1 ? 'page' : 'pages'}`)
  if (size) details.push(size)
  if (language === 'ar' || language.startsWith('ar-')) details.push('Arabic')
  else if (language === 'en' || language.startsWith('en-')) details.push('English')
  if (revision) details.push(`Revision ${revision}`)
  if (metadata.workflow_contract === 'lite-visual-linear/v4' && metadata.validation_status === 'passed')
    details.push('Verified pair')
  return details
}

function originalPurpose(contentType?: string | null): string {
  const type = String(contentType || '').toLowerCase()
  if (/video|youtube|lecture|course/.test(type)) return 'Watch at the original source.'
  if (/audio|podcast/.test(type)) return 'Listen at the original source.'
  if (/article|book|paper|text|pdf|newsletter/.test(type)) return 'Read at the original source.'
  return 'Use the material in its original form.'
}

const notebookFormatLabel = (format?: string | null) => {
  const normalized = String(format || '')
    .trim()
    .replaceAll('-', ' ')
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'learning output'
}

function notebookMaterialState(source: PathSource) {
  const learning = source.notebook_learning
  if (!learning)
    return {
      availability: 'Linked' as const,
      purpose: 'Ask questions inside the linked source notebook.',
      details: [] as string[],
    }
  const format = notebookFormatLabel(learning.primary_format)
  if (learning.output_status === 'ready')
    return {
      availability: 'Ready' as const,
      purpose: `Open the ${format} made from this source.`,
      details: learning.primary_format ? [format] : [],
    }
  if (learning.output_status === 'pending')
    return {
      availability: 'Building' as const,
      purpose: `The ${format} from this source is being built.`,
      details: learning.primary_format ? [format] : [],
    }
  if (learning.output_status === 'failed' || learning.index_status === 'failed')
    return {
      availability: 'Needs attention' as const,
      purpose: 'Open the notebook; its latest learning build needs attention.',
      details: learning.primary_format ? [format] : [],
    }
  if (learning.indexed)
    return {
      availability: 'Ready to ask' as const,
      purpose: 'The source is indexed for grounded questions.',
      details: [] as string[],
    }
  return {
    availability: learning.index_status === 'pending' ? ('Indexing' as const) : ('Linked' as const),
    purpose:
      learning.index_status === 'pending'
        ? 'The source is still being indexed in NotebookLM.'
        : 'Notebook linked; source indexing is not verified yet.',
    details: [] as string[],
  }
}

function sourceMaterialOptions(source: PathSource): SourceMaterialOption[] {
  const options: SourceMaterialOption[] = []
  if (source.video_url)
    options.push({
      kind: 'original',
      format: 'Original',
      href: source.video_url,
      label: 'Open the original source · online only',
      purpose: originalPurpose(source.content_type),
      availability: 'Linked',
      details: source.content_type ? [source.content_type] : [],
    })
  if (source.artifacts?.html)
    options.push({
      kind: 'html',
      format: 'HTML',
      href: artifactHref(source.artifacts.html.id),
      label: 'Read the HTML companion',
      purpose: 'Read the complete Arabic companion in your browser.',
      availability: 'Saved',
      details: artifactDetails(source.artifacts.html, 'html'),
    })
  if (source.artifacts?.pdf)
    options.push({
      kind: 'pdf',
      format: 'PDF',
      href: artifactHref(source.artifacts.pdf.id),
      label: 'Open the PDF companion',
      purpose: 'Read or annotate the exact A4 print edition on a tablet.',
      availability: 'Saved',
      details: artifactDetails(source.artifacts.pdf, 'pdf'),
    })
  if (source.notebook_url) {
    const notebookState = notebookMaterialState(source)
    options.push({
      kind: 'notebooklm',
      format: 'NotebookLM',
      href: source.notebook_url,
      label: 'Open NotebookLM · online only',
      ...notebookState,
    })
  }
  return options
}

function declaredRecommendation(source: PathSource): SourceMaterialKind | null {
  for (const artifact of [source.artifacts?.html, source.artifacts?.pdf]) {
    const value = String(artifactMetadata(artifact).recommended_start || '').toLowerCase() as SourceMaterialKind
    if (recommendedKinds.has(value)) return value
  }
  return null
}

export function buildSourceMaterialLauncher(source: PathSource): SourceMaterialLauncher | null {
  const options = sourceMaterialOptions(source)
  if (!options.length) return null

  const declared = declaredRecommendation(source)
  const canLead = (option: SourceMaterialOption) =>
    option.kind !== 'notebooklm' || option.availability === 'Ready' || option.availability === 'Ready to ask'
  const primary =
    (declared && options.find((option) => option.kind === declared && canLead(option))) ||
    options.find((option) => option.kind === 'html') ||
    options.find((option) => option.kind === 'original') ||
    options.find((option) => option.kind === 'pdf') ||
    options[0]

  return {
    primary,
    alternatives: options.filter((option) => option !== primary),
    explicitlyRecommended: declared === primary.kind,
  }
}
