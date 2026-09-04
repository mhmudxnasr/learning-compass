import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('every user-facing recall due projection excludes paused and retired cards', () => {
  const directDueSurfaces = [
    'src/api/compass.ts',
    'src/api/dashboard.ts',
    'src/api/home.ts',
    'src/api/learning-core.ts',
    'src/api/notifications.ts',
    'src/services/agent-briefing.ts',
  ]
  for (const path of directDueSurfaces) {
    assert.match(
      source(path),
      /FROM srs_cards WHERE repair_status='active' AND due_at\s*<=\s*date\('now'/,
      `${path} must count only active due cards`,
    )
  }

  const forecast = source('src/api/intelligence.ts')
  assert.match(forecast, /FROM srs_cards WHERE repair_status='active' AND due_at<=date\('now','\+7 days'\)/)
  assert.match(forecast, /FROM srs_cards WHERE repair_status='active' AND due_at<=date\('now','\+30 days'\)/)

  const queue = source('src/services/capture-queue.ts')
  assert.match(queue, /sc\.recommendation_id=r\.id AND sc\.repair_status='active' AND sc\.due_at IS NOT NULL AND sc\.due_at<=date\('now'\)/)

  const recommendations = source('src/services/recommendation-enrichment.ts')
  assert.match(recommendations, /CASE WHEN repair_status='active' AND due_at IS NOT NULL AND due_at<=date\('now'\) THEN 1 ELSE 0 END/)
})

test('source and branch dossiers expose repair state while counting only active due cards', () => {
  const capture = source('src/api/capture.ts')
  assert.match(capture, /scheduler_version,repair_status,paused_at,retired_at FROM srs_cards/)
  assert.match(capture, /card\.repair_status === 'active' && card\.due_at/)

  const branch = source('src/api/brain.ts')
  assert.match(branch, /sc\.scheduler_version,sc\.repair_status,sc\.paused_at,sc\.retired_at/)

  const dossier = source('client/src/workspaces/library/LibraryViews.tsx')
  assert.match(dossier, /function recallScheduleLabel/)
  assert.match(dossier, /Paused · schedule preserved/)
  assert.match(dossier, /Retired · outside due review/)
  assert.match(dossier, /active due/)
})
