import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanProfileLabel, profileTasteLabel } from '../../src/services/profile-labels.ts'

test('profile taste labels strip historical bracket metadata and prefer readable names', () => {
  assert.equal(cleanProfileLabel('Readable branch  [LOVE · R1]'), 'Readable branch')
  assert.equal(
    profileTasteLabel({ topic: 'fixture-branch-id', branch_label: 'Readable branch  [LOVE · R1]' }),
    'Readable branch',
  )
  assert.equal(profileTasteLabel({ topic: 'fixture-branch-id' }), 'fixture-branch-id')
})
