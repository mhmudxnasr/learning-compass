import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { Icon } from '../../components/Icon'
import { domId, levelTitle, persistThreadLevelFocus, threadNextLesson } from './threadViewModel'
import type { PathResponse, ThreadProject } from './types'

export function ThreadProjects({
  path,
  focusLevelId,
  onChanged,
}: {
  path: PathResponse
  focusLevelId?: string
  onChanged: () => void
}) {
  const defaultStage =
    path.stages.find((stage) => stage.id === focusLevelId) ||
    threadNextLesson(path)?.stage ||
    path.current_stage ||
    path.stages.find((stage) => ['available', 'in_progress'].includes(stage.status)) ||
    path.stages[0]
  const [expandedStageId, setExpandedStageId] = useState(defaultStage?.id || '')
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setExpandedStageId((current) =>
      path.stages.some((stage) => stage.id === current) ? current : defaultStage?.id || path.stages[0]?.id || '',
    )
  }, [defaultStage?.id, path.stages, path.thread.id])

  const updateProject = async (id: string, status: string) => {
    setSaving(id)
    setMessage('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(path.thread.id)}/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setMessage('Project status saved.')
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project update failed.')
    } finally {
      setSaving('')
    }
  }

  const saveSynthesis = async (event: Event) => {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget as HTMLFormElement).get('synthesis') || '')
    setSaving('synthesis')
    setMessage('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(path.thread.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ final_synthesis: value }),
      })
      setMessage('Final synthesis saved.')
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Synthesis save failed.')
    } finally {
      setSaving('')
    }
  }

  const finalProjects = path.projects.filter((project) => project.type === 'final')

  return (
    <section class="vertical-practice">
      <header class="vertical-view-head">
        <div>
          <h2>Practice journey</h2>
          <p>
            Current Level application leads. Future projects remain previews, and synthesis closes the Thread as a
            terminal workspace.
          </p>
        </div>
        <span>
          {path.stages.reduce((total, stage) => total + stage.projects.length, 0) + finalProjects.length} projects
        </span>
      </header>

      <p class="vertical-thread-advisory">
        Projects are optional practice. They never unlock a lesson, advance a Level, or complete the Thread.
      </p>

      <ol class="vertical-practice-journey">
        {path.stages.map((stage) => {
          const expanded = stage.id === expandedStageId
          const panelId = domId('practice-level-panel', stage.id)
          const isCurrent = stage.id === defaultStage?.id
          const stateLabel =
            stage.status === 'completed' ? 'Completed Level' : isCurrent ? 'Current Level' : 'Future preview'

          return (
            <li class={`${expanded ? 'is-expanded' : ''} ${isCurrent ? 'is-current' : ''}`} key={stage.id}>
              <span class="vertical-journey-marker" aria-hidden="true">
                {stage.position}
              </span>
              <section class="vertical-practice-level" aria-label={`Level ${stage.position}: ${levelTitle(stage)}`}>
                <button
                  class="vertical-practice-level-trigger"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => {
                    setExpandedStageId(stage.id)
                    persistThreadLevelFocus(path.thread.id, 'practice', stage.id)
                  }}
                >
                  <span>
                    <strong>
                      Level {stage.position} — {levelTitle(stage)}
                    </strong>
                    <small>
                      {stage.projects.length || 0} {stage.projects.length === 1 ? 'project' : 'projects'}
                    </small>
                  </span>
                  <span class={`folio-status-tag status-${stage.status}`}>{stateLabel}</span>
                  <Icon name="chevron" size={14} />
                </button>

                {expanded ? (
                  <div class="vertical-practice-level-panel" id={panelId}>
                    {(stage.objective || stage.description) && <p>{stage.objective || stage.description}</p>}
                    {stage.projects.length ? (
                      <div class="vertical-practice-projects">
                        {stage.projects.map((project) => (
                          <VerticalProjectEntry
                            project={project}
                            saving={saving === project.id}
                            onUpdate={updateProject}
                            key={project.id}
                          />
                        ))}
                      </div>
                    ) : (
                      <p class="vertical-thread-empty">No optional project has been defined for this Level.</p>
                    )}
                  </div>
                ) : null}
              </section>
            </li>
          )
        })}
      </ol>

      <section class="vertical-practice-terminal" aria-labelledby="vertical-practice-terminal-title">
        <header>
          <div>
            <h3 id="vertical-practice-terminal-title">Final mastery and synthesis</h3>
            <p>A terminal workspace after the Level journey, never a progression gate.</p>
          </div>
          <span class="folio-status-tag status-deferred">Terminal workspace</span>
        </header>

        {finalProjects.length ? (
          <div class="vertical-practice-projects">
            {finalProjects.map((project) => (
              <VerticalProjectEntry
                project={project}
                saving={saving === project.id}
                onUpdate={updateProject}
                key={project.id}
              />
            ))}
          </div>
        ) : null}

        <form class="vertical-practice-synthesis" onSubmit={saveSynthesis}>
          <label>
            <strong>What can you now explain, decide, build, or do?</strong>
            <span>Save a durable synthesis without changing lesson or Level progress.</span>
            <textarea
              name="synthesis"
              rows={7}
              defaultValue={path.thread.final_synthesis || ''}
              placeholder="Document the models, decisions, and practical conclusions that should remain after this Thread."
            />
          </label>
          <button class="button secondary" disabled={Boolean(saving)}>
            {saving === 'synthesis' ? 'Saving…' : 'Save final synthesis'}
          </button>
        </form>
      </section>

      {message && (
        <p class="folio-status" role="status">
          {message}
        </p>
      )}
    </section>
  )
}

function VerticalProjectEntry({
  project,
  saving,
  onUpdate,
}: {
  project: ThreadProject
  saving: boolean
  onUpdate: (id: string, status: string) => void
}) {
  return (
    <article class={`vertical-practice-project status-${project.status}`}>
      <div>
        <h4>{project.title}</h4>
        {project.objective && (
          <p>
            <strong>Objective:</strong> {project.objective}
          </p>
        )}
        {project.description && <p>{project.description}</p>}
        {project.suggested_context && (
          <p class="vertical-practice-context">
            <strong>Suggested context:</strong> {project.suggested_context}
          </p>
        )}
        {project.instructions && (
          <details>
            <summary>Project instructions</summary>
            <p>{project.instructions}</p>
          </details>
        )}
      </div>
      <label>
        <span>Status</span>
        <select
          value={project.status}
          disabled={saving}
          onChange={(event) => onUpdate(project.id, (event.target as HTMLSelectElement).value)}
          aria-label={`Status for ${project.title}`}
        >
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="deferred">Deferred</option>
        </select>
      </label>
    </article>
  )
}
