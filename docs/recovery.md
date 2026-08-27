# Recovery and portability

Learning Compass keeps D1 as the canonical owner of mutable learning state and R2 as the owner of large artifacts. Recovery therefore has two explicit parts: a checksummed D1 export and a separately verified R2 object copy. A database export without its R2 objects is incomplete, so the manifest says that plainly.

## Export D1

Local exports are the default and do not touch production:

```bash
npm run export:recovery
```

For a production export, make the scope explicit:

```bash
node scripts/export-recovery.mjs --remote --output backups/learning-compass-remote.sql
```

Each export produces `*.manifest.json` beside the SQL file. The manifest records the source (`local` or `remote`), export method, SQL byte count and SHA-256, and hashes of the migration files used to interpret the dump. Migration `0067_portable_search_and_lineage_repair.sql` replaces the former FTS5 virtual table with an ordinary derived search projection, so both local and remote Wrangler exports are expected to use the normal D1 exporter. The local SQLite fallback remains a compatibility path for older pre-0067 fixtures only; a production database that still exposes any virtual table is not backup-ready. Verify before storing or restoring it:

```bash
npm run verify:recovery -- backups/learning-compass-remote.sql.manifest.json
```

The script never restores or overwrites a database. Restore is an operator action against a reviewed disposable database first, followed by the normal migration rehearsal and live integrity checks.

## Copy R2 objects

`GET /artifacts` exposes the canonical artifact inventory and each row's `r2_key`. Copy every referenced object to a separately controlled backup bucket using the Cloudflare R2 tooling, preserving the exact key. After copying, compare object size and checksum metadata where available; then verify that every D1 artifact row has a corresponding object before calling the recovery complete.

Do not put API tokens in this repository, browser-extension settings, or MCP configuration. Use an authorized shell/session for remote exports and keep recovery files outside the deployed client directory.
