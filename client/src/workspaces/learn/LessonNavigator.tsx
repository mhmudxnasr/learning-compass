import { useEffect, useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { lessonHref, lessonReadiness } from './helpers'
import { levelTitle, threadTabHref } from './threadViewModel'
import type { PathResponse } from './types'

export function LessonNavigator({ path, lessonId }: { path: PathResponse; lessonId: string }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(40)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => setExpanded(false), [lessonId])
  const all = path.stages.flatMap((stage) => stage.lessons.map((lesson) => ({ stage, lesson })))
  const normalized = query.trim().toLowerCase()
  const matches = all.filter(({ stage, lesson }) => `${stage.title} ${lesson.title}`.toLowerCase().includes(normalized))
  return (
    <div class={`lesson-curriculum${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        class="button secondary lesson-curriculum-toggle"
        aria-expanded={expanded}
        aria-controls="course-navigator"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon name="menu" size={16} />
        Lesson {all.findIndex(({ lesson }) => lesson.id === lessonId) + 1} of {all.length} · All lessons
      </button>
      <nav id="course-navigator" class="lesson-navigator" aria-label="Course navigator">
        <a class="lesson-navigator-back" href={threadTabHref(path.thread.id, 'curriculum')}>
          <Icon name="back" size={15} />
          All lessons
        </a>
        <h2 dir="auto">{path.thread.title}</h2>
        <p>
          {all.filter(({ lesson }) => lesson.status === 'completed').length} of {all.length} lessons complete
        </p>
        <label class="visually-hidden" for="lesson-navigator-search">
          Find a lesson
        </label>
        <input
          id="lesson-navigator-search"
          type="search"
          value={query}
          placeholder="Find a lesson"
          onInput={(event) => {
            setQuery(event.currentTarget.value)
            setLimit(40)
          }}
        />
        {normalized ? (
          <>
            <ul>
              {matches.slice(0, limit).map(({ stage, lesson }) => (
                <li key={lesson.id}>
                  <a
                    href={lessonHref(path.thread.id, lesson.id)}
                    aria-current={lesson.id === lessonId ? 'page' : undefined}
                  >
                    <span>{levelTitle(stage)}</span>
                    <strong dir="auto">{lesson.title}</strong>
                  </a>
                </li>
              ))}
            </ul>
            {!matches.length && <p>No matching lessons.</p>}
            {matches.length > limit && (
              <button class="button secondary" onClick={() => setLimit((value) => value + 40)}>
                Show more results
              </button>
            )}
          </>
        ) : (
          path.stages.map((stage) => (
            <details key={stage.id} open={stage.lessons.some((lesson) => lesson.id === lessonId)}>
              <summary>
                <span dir="auto">{levelTitle(stage)}</span>
                <small>
                  {stage.lessons.filter((lesson) => lesson.status === 'completed').length}/{stage.lessons.length}
                </small>
              </summary>
              <ul>
                {stage.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <a
                      href={lessonHref(path.thread.id, lesson.id)}
                      aria-current={lesson.id === lessonId ? 'page' : undefined}
                    >
                      <Icon
                        name={
                          lesson.status === 'completed'
                            ? 'check'
                            : stage.status === 'locked'
                              ? 'lock'
                              : lessonReadiness(lesson) === 'needs_material'
                                ? 'warning'
                                : 'book'
                        }
                        size={14}
                      />
                      <strong dir="auto">{lesson.title}</strong>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </nav>
    </div>
  )
}
