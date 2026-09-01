import { offlineDataResource, offlinePairResources, type OfflinePackResource } from '../../offlinePacks'
import type { PathArtifact, PathResponse, PathSource, PathStage } from './types'

export function sourceOfflineResources(source: PathSource): OfflinePackResource[] {
  return offlinePairResources(source.artifacts?.html, source.artifacts?.pdf, `source:${source.recommendation_id}`)
}

export function verifiedCompanionHref(source: PathSource) {
  return sourceOfflineResources(source).find((resource) => resource.role === 'html')?.url || null
}

function levelSources(stage: PathStage) {
  return [...stage.sources, ...stage.lessons.flatMap((lesson) => lesson.sources || [])]
}

function offlinePathArtifactSnapshot(artifact?: PathArtifact) {
  if (!artifact?.id) return undefined
  const metadata =
    artifact.metadata ||
    (() => {
      try {
        return JSON.parse(String(artifact.metadata_json || '{}')) as Record<string, unknown>
      } catch {
        return {}
      }
    })()
  return {
    id: artifact.id,
    filename: artifact.filename,
    media_type: artifact.media_type,
    size_bytes: artifact.size_bytes,
    created_at: artifact.created_at,
    metadata: {
      pair_id: metadata.pair_id,
      role: metadata.role,
      publication_state: metadata.publication_state,
      validation_status: metadata.validation_status,
      revision: metadata.revision,
      receipt_sha256: metadata.receipt_sha256,
      validation_receipt_sha256: metadata.validation_receipt_sha256,
      source_title: metadata.source_title,
    },
  }
}

function offlinePathSourceSnapshot(source: PathSource): PathSource {
  const verifiedPair = offlinePairResources(
    source.artifacts?.html,
    source.artifacts?.pdf,
    `source:${source.recommendation_id}`,
  )
  return {
    recommendation_id: source.recommendation_id,
    stage_id: source.stage_id,
    lesson_id: source.lesson_id,
    role: source.role,
    storage_role: source.storage_role,
    required: source.required,
    expected_contribution: source.expected_contribution,
    position: source.position,
    video_title: source.video_title,
    creator: source.creator,
    content_type: source.content_type,
    video_url: source.video_url,
    notebook_url: source.notebook_url,
    learning_state: source.learning_state,
    branch_id: source.branch_id,
    branch_label: source.branch_label,
    branch_status: source.branch_status,
    branch_domain_id: source.branch_domain_id,
    branch_domain_label: source.branch_domain_label,
    source_health_status: source.source_health_status,
    source_health_checked_at: source.source_health_checked_at,
    source_health_http_status: source.source_health_http_status,
    source_health_final_url: source.source_health_final_url,
    source_health_error_code: source.source_health_error_code,
    artifacts:
      verifiedPair.length === 2
        ? {
            html: offlinePathArtifactSnapshot(source.artifacts?.html),
            pdf: offlinePathArtifactSnapshot(source.artifacts?.pdf),
          }
        : {},
  }
}

function offlineThreadPathSnapshot(path: PathResponse): PathResponse & { offline_snapshot: true } {
  const stages = path.stages.map((stage) => ({
    id: stage.id,
    thread_id: stage.thread_id,
    position: stage.position,
    title: stage.title,
    objective: stage.objective,
    description: stage.description,
    status: stage.status,
    items: stage.items.map((item) => ({
      id: item.id,
      stage_id: item.stage_id,
      item_type: item.item_type,
      title: item.title,
      description: item.description,
      required: item.required,
      status: item.status,
      position: item.position,
    })),
    lessons: stage.lessons.map((lesson) => ({
      id: lesson.id,
      stage_id: lesson.stage_id,
      position: lesson.position,
      title: lesson.title,
      description: lesson.description,
      objective: lesson.objective,
      estimated_minutes: lesson.estimated_minutes,
      status: lesson.status,
      why_learn: lesson.why_learn,
      why_now: lesson.why_now,
      takeaway: lesson.takeaway,
      sources: (lesson.sources || []).map(offlinePathSourceSnapshot),
      notes: [],
      files: [],
      cards: [],
      recall_drafts: [],
    })),
    projects: stage.projects.map((project) => ({
      id: project.id,
      thread_id: project.thread_id,
      stage_id: project.stage_id,
      lesson_id: project.lesson_id,
      type: project.type,
      title: project.title,
      description: project.description,
      objective: project.objective,
      status: project.status,
    })),
    sources: stage.sources.map(offlinePathSourceSnapshot),
    notes: [],
    files: [],
    cards: [],
    recall_drafts: [],
    progress: stage.progress,
    next_action: stage.next_action,
  }))
  return {
    offline_snapshot: true,
    thread: {
      id: path.thread.id,
      title: path.thread.title,
      thread_type: path.thread.thread_type,
      guiding_question: path.thread.guiding_question,
      why_now: path.thread.why_now,
      definition_of_done: path.thread.definition_of_done,
      status: path.thread.status,
      superseded_by_type: path.thread.superseded_by_type,
      superseded_by_id: path.thread.superseded_by_id,
      superseded_at: path.thread.superseded_at,
      updated_at: path.thread.updated_at,
    },
    sources: path.sources.map(offlinePathSourceSnapshot),
    stages,
    current_stage: stages.find((stage) => stage.id === path.current_stage?.id) || null,
    projects: path.projects.map((project) => ({
      id: project.id,
      thread_id: project.thread_id,
      stage_id: project.stage_id,
      lesson_id: project.lesson_id,
      type: project.type,
      title: project.title,
      description: project.description,
      objective: project.objective,
      status: project.status,
    })),
    notes: [],
    files: [],
    cards: [],
    recall_drafts: [],
  }
}

export function threadOfflinePackResources(path: PathResponse): OfflinePackResource[] {
  const pairResources = [...path.sources, ...path.stages.flatMap(levelSources)].flatMap(sourceOfflineResources)
  return [
    ...pairResources,
    offlineDataResource(
      `/learning/core/threads/${encodeURIComponent(path.thread.id)}/path`,
      `thread:${path.thread.id}`,
      offlineThreadPathSnapshot(path),
    ),
  ]
}

export function levelOfflinePackResources(path: PathResponse, stage: PathStage): OfflinePackResource[] {
  return [
    ...levelSources(stage).flatMap(sourceOfflineResources),
    offlineDataResource(
      `/learning/core/threads/${encodeURIComponent(path.thread.id)}/path`,
      `level:${stage.id}`,
      offlineThreadPathSnapshot(path),
    ),
  ]
}
