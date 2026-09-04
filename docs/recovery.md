# Recovery and portability

Learning Compass keeps D1 as the canonical owner of mutable learning state and R2 as the owner of large artifacts. A recoverable production snapshot therefore contains both a checksummed D1 export and every D1-referenced R2 object, with one checksummed manifest and a passing disposable restore rehearsal. A database-only export is diagnostic evidence, not a complete production backup.

## Full production snapshot

Run the repository-owned backup from the project root only after release authority permits the remote read and backup receipt:

```bash
npm run backup:production
```

The command creates `learning-compass-full-recovery-v2` under `${LEARNING_COMPASS_BACKUP_DIR:-/home/mahmud/backups/learning-compass}`. It:

1. exports remote D1 and records the SQL checksum plus the exact migration inventory;
2. reads the canonical artifact inventory from D1;
3. downloads every referenced R2 object under its exact key, verifies the D1 size, and records a SHA-256;
4. writes and checksums `snapshot.json`;
5. invokes the disposable restore rehearsal; and
6. only after successful rehearsal records the verified backup receipt in `recovery_backups`.

Each R2 object read has four bounded attempts with exponential backoff for transient Cloudflare control-plane failures. Exhausting those attempts still fails the entire snapshot; cached bytes or a partial download never satisfy recovery evidence.

Use `--no-record` only for a non-authoritative rehearsal that must not mutate production:

```bash
node scripts/backup-production.mjs --no-record
```

Never call a D1-only export or an unverified object copy a complete backup. Keep snapshots outside the deployed client directory and in separately controlled storage.

## Verify and rehearse restore

A full backup automatically runs:

```bash
node scripts/rehearse-recovery.mjs --manifest /absolute/path/to/snapshot.json
```

The rehearsal verifies the snapshot checksum, D1 export checksum and migration hashes, restores into a disposable SQLite database, requires `PRAGMA integrity_check` and `PRAGMA foreign_key_check` to pass, records canonical counts, requires the restored artifact count to match the snapshot, and verifies every R2 object size, SHA-256, count, and byte total. It writes `restore-rehearsal.json`; the snapshot is not release-ready without `status: "verified"`.

For a D1-only diagnostic export:

```bash
node scripts/export-recovery.mjs --remote --output backups/learning-compass-remote.sql
npm run verify:recovery -- backups/learning-compass-remote.sql.manifest.json
```

This verifies the SQL bytes and migration inventory but intentionally reports that R2 is not included. It must not satisfy the production backup gate.

## Migration and deployment recovery point

Before any production migration:

1. inspect the remote migration ledger;
2. require the remote ledger to end at applied `0073_source_annotation_revisions.sql` and `0074_lite_visual_corpus_scope_lineage.sql` to be the only pending migration; migrations through `0073` must not be replayed;
3. capture the current Worker version;
4. complete and retain the full D1-plus-R2 snapshot and verified restore receipt; and
5. record a D1 Time Travel bookmark immediately before applying `0074`, then verify the ledger and readiness after migration.

The signed-v6 semantic-completeness and aggregate corpus-audit hold blocks corpus registration, staging, upload, activation, and rollback. It does not block an application-only deployment that performs no corpus mutation and passes the full code release, backup/restore, migration-parity, and readiness gates. Do not configure `ALLOW_UNAUTHENTICATED_LOCAL_WRITES` remotely.

## Rollback order

Use the narrowest reversible layer first:

1. **Corpus regression:** guarded corpus rollback re-verifies and restores the immediately prior visible pair set while preserving completed job history.
2. **Worker regression:** restore the captured Worker version after ensuring corpus visibility is compatible with it.
3. **Schema/data regression:** use the D1 Time Travel bookmark or restore the verified D1 snapshot, then restore every R2 object under its exact key and re-run readiness, integrity, artifact parity, and canonical source readbacks.

Never blindly reverse an additive migration or restore D1 without its matching R2 inventory. A failed or partial restore stays disposable until every integrity and object-parity check passes.

## Credential boundary

Learning Compass ordinary reads and writes are public and recovery tooling contains no Learning Compass credential-header or browser-session path. Cloudflare operator authentication and provider/Telegram secrets remain independent. Never put credentials in this repository, browser-extension settings, URLs, command arguments, backup manifests, or receipts.
