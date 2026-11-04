# Operator report deletion

This procedure removes one report and its private photo after an approved privacy request, an approved retention decision, or cleanup of synthetic demonstration data. It requires an administrator account and access to a trusted operator terminal. It is not a resident-facing action. Do not delete reports merely because they are marked as duplicates: the duplicate review workflow preserves the originals.

The project has no automatic deletion schedule or approved default retention period. The barangay or project owner must decide the retention period and approve individual requests. Confirm the requester and the exact report before running this irreversible operation. Use synthetic records when rehearsing it.

## Inspect first

From `apps/api`, load the same database and storage settings used by the application. For local storage, use the same `PRIVATE_MEDIA_DIR`; for Supabase, use the same project, bucket, and server-only secret. Keep passwords and keys out of command arguments and shell history.

```sh
python -m barangai.delete_report REPORT_UUID --email administrator@example.test
```

Replace the example email with the administrator's actual email. The command privately prompts for the administrator password and defaults to a dry-run. It prints only the report ID and counts of dependent rows and images; it changes nothing. Read these counts before proceeding. Both staff and resident accounts are rejected.

## Confirm the same report

Run the command again with the exact report UUID repeated in `--confirm`, one approved reason, and an operator-controlled receipt path outside the repository and public folders:

```sh
python -m barangai.delete_report REPORT_UUID --email administrator@example.test --confirm REPORT_UUID --reason resident-request --receipt /PRIVATE/OPERATOR/PATH/deletion-receipts.jsonl
```

On Windows, use a real private absolute path such as `C:\PRIVATE\OPERATOR\deletion-receipts.jsonl`. Its parent directory must already exist. The allowed reason codes are `resident-request`, `retention-expired`, and `synthetic-demo-cleanup`. The command requests the password again and refuses a mismatched confirmation or missing reason/receipt path.

Deletion removes the photo, any added photos and details, the report, notifications for the report, its status history, staff actions and photo-view log, and duplicate suggestions referencing the report in either direction. A case left with no reports is removed, and a case sitting on the deleted report's pin moves to its earliest remaining report, so the shared map keeps no trace of that location. User accounts and other reports remain.

Residents can also ask for deletion on a report's page, which staff of that barangay or an administrator approve or decline in the staff desk, or delete their own account and all its reports in account settings. Both remove the same data as this command. Forgotten passwords are reset with `python -m barangai.bootstrap_staff EMAIL --reset-password`. Historical links to the removed report will stop working.

## Receipt and failures

The tool opens the receipt in append mode before changing data, so an inaccessible receipt path stops the operation early. It writes a JSON line only after private photo deletion and database commit succeed. The receipt contains action, report ID, administrator ID, UTC time, and a reason code. It contains no email, password, photo path, coordinates, descriptions, or free-text notes. These minimal identifiers are still restricted audit information; protect the file with the operator directory's access controls, retain it according to the approved audit policy, and never publish it with the demo.

Appending preserves earlier receipts, but a local receipt is not tamper-proof. A trusted operator must retain it separately from the deleted records. The tool creates new files with private permissions where the operating system supports them; on Windows, configure the parent folder's access permissions. Do not run concurrent deletion commands against the same receipt file.

Private object storage and PostgreSQL do not share a transaction. The tool deletes database dependents within an uncommitted transaction, removes the photo, then commits the database. If storage fails, the database transaction rolls back and no success receipt is written. If the database commit fails after photo removal, the report may remain with its image missing. Inspect with the dry-run and retry the same confirmed deletion: deleting an already missing photo is idempotent. Never manually restore a photo just to perform this retry.

If a database commit's outcome is uncertain, inspect the report first. A missing report means the database removal may already have completed; do not invent a success receipt. Preserve operator logs, verify the private object is absent, and have the administrator record the outcome under the audit procedure.

If deletion succeeded but the receipt could not be saved or synced, the command exits with code `2` and prints a minimal recovery receipt. Preserve that output in the private audit file, checking the report ID to avoid adding it twice. An ordinary successful deletion exits with code `0`; other failures exit with code `1`. A repeated request for an already removed report returns “Report not found” and creates no new success receipt.

This command removes active application records and their stored photo. It does not erase copies in independently retained backups, exports, screenshots, or operator receipts. Apply the approved retention policy to those copies too. Every erased report and account id is kept in the `erasures` table, with no other detail about it. `backup.restore_backup` erases them again after a restore, going by the ledger of the database it replaces and the backup's own, and reports how many in `reerased`. On a new laptop only the backup's ledger exists, so anything erased after that backup was made has to be erased again by hand. The backup folder itself keeps its copy until it is removed.

## Evidence and limits

Synthetic tests cover default dry-run behavior, administrator authentication and role checks, exact confirmation, dependent rows in both duplicate directions, preservation of users and unrelated reports, append-only receipts, storage failure rollback, retry after database commit failure, inaccessible receipt paths, and recovery after receipt syncing fails. No current project report was deleted to test this procedure. Live Supabase deletion and PostgreSQL concurrency remain separate deployment checks.
