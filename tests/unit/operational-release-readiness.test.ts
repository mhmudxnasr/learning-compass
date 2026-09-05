import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  loadReleaseContractHealth,
  REQUIRED_RELEASE_COLUMNS,
  REQUIRED_RELEASE_SCHEMA,
} from '../../src/services/release-readiness.ts'

const releaseSchema = [...REQUIRED_RELEASE_SCHEMA]
const releaseColumns = Object.entries(REQUIRED_RELEASE_COLUMNS).flatMap(([table, names]) =>
  names.map((name) => ({ table_name: table, name })),
)

const environment = (
  present = releaseSchema,
  overrides: Record<string, unknown> = {},
  presentColumns = releaseColumns,
) =>
  ({
    DB: {
      prepare: (sql: string) =>
        sql.includes('pragma_table_info')
          ? { all: async () => ({ results: presentColumns }) }
          : {
              bind: (...expected: string[]) => ({
                all: async () => ({
                  results: present.filter((name) => expected.includes(name)).map((name) => ({ name })),
                }),
              }),
            },
    },
    ARTIFACTS: {},
    ASSETS: {},
    AI: {},
    COMPASS_VECTORS: {},
    LITE_VISUAL_RECEIPT_SIGNING_KEY: 's'.repeat(32),
    ...overrides,
  }) as any

test('release readiness requires current schema, production bindings, and signing key', async () => {
  const healthy = await loadReleaseContractHealth(environment())
  assert.equal(healthy.ok, true)
  assert.deepEqual(healthy.schema.missing, [])
  assert.deepEqual(healthy.schema.missing_columns, [])
  assert.equal(healthy.signing_secret_configured, true)

  const missing = await loadReleaseContractHealth(
    environment(
      releaseSchema.slice(1),
      { AI: undefined, LITE_VISUAL_RECEIPT_SIGNING_KEY: 'too-short' },
      releaseColumns.filter(
        ({ table_name, name }) => `${table_name}.${name}` !== 'source_annotations.revision_of_annotation_id',
      ),
    ),
  )
  assert.equal(missing.ok, false)
  assert.deepEqual(missing.schema.missing, ['lite_visual_corpora'])
  assert.deepEqual(missing.schema.missing_columns, ['source_annotations.revision_of_annotation_id'])
  assert.equal(missing.bindings.ai, false)
  assert.equal(missing.signing_secret_configured, false)
  const missingFeedDismissals = await loadReleaseContractHealth(
    environment(releaseSchema.filter((name) => name !== 'feed_entry_dismissals')),
  )
  assert.equal(missingFeedDismissals.ok, false)
  assert.deepEqual(missingFeedDismissals.schema.missing, ['feed_entry_dismissals'])
})

test('release migration and recovery scripts fail closed on omitted evidence', () => {
  const migration = readFileSync(
    new URL('../../migrations/0068_lite_visual_corpus_activation.sql', import.meta.url),
    'utf8',
  )
  const backup = readFileSync(new URL('../../scripts/backup-production.mjs', import.meta.url), 'utf8')
  const rehearsal = readFileSync(new URL('../../scripts/rehearse-recovery.mjs', import.meta.url), 'utf8')
  const verification = readFileSync(new URL('../../scripts/verify-recovery.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(migration, /lease_principal/)
  assert.match(migration, /INSERT INTO lite_visual_pairs/)
  assert.doesNotMatch(migration, /INSERT OR IGNORE INTO lite_visual_pairs/)
  assert.match(backup, /Always acquire the remote bytes/)
  assert.doesNotMatch(backup, /!existsSync\(objectPath\)/)
  assert.match(backup, /LEARNING_COMPASS_BACKUP_CONCURRENCY/)
  assert.match(backup, /Promise\.all/)
  assert.match(rehearsal, /PRAGMA foreign_key_check/)
  assert.match(verification, /Recovery manifest migration hash mismatch/)
})
