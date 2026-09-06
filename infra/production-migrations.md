# Production migrations — Codex workstation

Use only for a user-authorized, reviewed migration already merged into `main`.
This workstation uses the configured `loopers-server` SSH alias for Mother of
Learning. It is not a Yellow Price deploy host. Do not replace the alias with
an IP, weaken host verification or fall back to password authentication.
Other contributors must use their configured named alias and approved access.

## Establish the rollback point

1. Record the approved main commit, migration path and intended object changes.
   Inspect the committed SQL and its transaction/idempotency conditions. Check
   target objects read-only before applying; if already applied, verify and stop
   without replaying the write. For Realtime triggers, verify the `realtime`
   schema exists first.
2. Establish a fresh, verified backup pair and recovery procedure using
   [backup-restore-runbook.md](backup-restore-runbook.md), steps 3 and 6. The
   physical backup briefly stops the DB: downtime must be within the authorized
   maintenance scope. Record matching archive timestamps and integrity checks;
   do not substitute a partial logical dump. Do not read or print credentials,
   backup contents, connection strings or private user rows.
3. Choose the migration-specific rollback before the write: transaction rollback
   for an uncommitted failure; reviewed compensating SQL or the verified physical
   backup for post-commit failure. A full restore overwrites newer writes and
   requires its own recovery scope; do not run a production restore drill as a
   routine preflight. Keep the recovery artifacts until verification succeeds.

## Apply the committed file

The database is `postgres` in container `supabase-db`; the migration role is
`postgres`. Use non-interactive SSH. If a documented operation needs elevated
access, use `sudo -n` only within that operation's runbook. On access failure,
collect safe `ssh -G` / `ssh -vv` diagnostics and stop that operation; never ask
for a server password. Do not print environment values in diagnostics.

The following is a PowerShell 7 template, from the repository root, after the
above checks. Replace the two placeholders with the approved values. SQL must
contain `BEGIN` / `COMMIT` when compatible with the migration; document any
nontransactional step and its recovery separately.

```powershell
$migrationCommit = '<approved-main-commit>'
$migrationFile = 'mat-ucheniya/supabase/migrations/<approved-file>.sql'
$migrationSpec = '{0}:{1}' -f $migrationCommit, $migrationFile
$migrationSql = git show $migrationSpec
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the committed migration' }
$previousSqlEncoding = $OutputEncoding
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $migrationSql | ssh loopers-server 'docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres'
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed; inspect transaction state before retrying' }
} finally {
    $OutputEncoding = $previousSqlEncoding
}
```

Do not retry blindly after a disconnect or ambiguous result: establish the
committed database state read-only, then follow the chosen recovery procedure.

## Verify completion

Run narrow queries for the migration's tables, policies, functions, triggers
or indexes. Check DB, Auth and REST readiness, allow reconnect time, then repeat
the relevant application health check and a read-only smoke check. Report the
commit/file, backup identifier, apply result and verification; a single immediate
HTTP response is not enough. Never include connection secrets or personal rows.
