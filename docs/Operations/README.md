# Local pilot operations

Owner: project maintainer. Runtime is local-only. No real funds or outgoing email. The database volume survives restarts; migrations and demo initialization finish before the application and worker start.

## Services and configuration

| Service | Responsibility                                                          |
| ------- | ----------------------------------------------------------------------- |
| db      | PostgreSQL 17 with PostGIS, persistent Compose volume, local port 54329 |
| init    | One-time migration and idempotent fictional demo seed                   |
| app     | Production React assets and Express API at localhost:3000               |
| worker  | Durable deadline processing, polling once per second                    |

The database, application and worker use `restart: unless-stopped`. Startup waits for database health and successful initialization. The HTTP health endpoint checks database access; a healthy web server alone does not prove that the worker is running.

Compose supplies configuration directly. For host development, pass the values described in `.env.example` through the shell; no automatic dotenv loading is used. Host defaults bind to 127.0.0.1. The container binds internally to 0.0.0.0, with only localhost ports published.

`TEST_PAYMENTS=true` is mandatory; this pilot refuses a live payment configuration. Opaque HttpOnly session cookies expire after seven days and sessions live in the database. Use secure cookies only when a future HTTPS deployment is designed and reviewed.

## Inspect and recover

```powershell
docker compose ps -a
docker compose logs --tail 100 app worker init db
```

The administrator can approve organization authority, validate and import CSV files, inspect invitations, audit events and TEST ledger entries, cancel a supplier's procurement and retry failed jobs. A failed deadline transaction rolls back financial changes and contracts. Fix its underlying cause, then use **Taustatööd → Proovi uuesti**. Repeated finalization, capture, refund and payout processing remains idempotent.

Jobs recover after a process restart because state is stored in PostgreSQL. Procurement locks serialize payments, withdrawals and finalization. Do not edit frozen agreements, delete financial history or manually raise the achieved price to repair a transaction.

Supplier cancellation fully refunds captured test deposits and appends reversing fee/payout entries. Success history, acceptance evidence, contract evidence and completed ratings remain inspectable. Buyer withdrawal after success retains the deposit; a cancelled individual contract displays its previous balance as history.

## Backup and restore

Create a backup before importing operational data or upgrading. The following creates a PostgreSQL custom-format archive without routing binary data through PowerShell output:

```powershell
New-Item -ItemType Directory -Force -Path .\backups
docker compose exec -T db pg_dump -U uhishange -d uhishange -Fc -f /tmp/uhishange.dump
docker compose cp db:/tmp/uhishange.dump .\backups\uhishange.dump
```

Restoring replaces the project's current database contents with the selected backup. Stop writers first and deliberately choose the backup:

```powershell
docker compose stop app worker
docker compose cp .\backups\uhishange.dump db:/tmp/uhishange.dump
docker compose exec -T db pg_restore -U uhishange -d uhishange --clean --if-exists --no-owner /tmp/uhishange.dump
docker compose up -d
```

Keep backups private: they contain account records, sessions, restricted contacts and procurement history. Do not commit them to source control.

## Stop, reset and verify

`docker compose down` stops services and preserves data. The explicit reset in the root README removes only this project's Compose volume and restores demo data on next startup. Never reset a database containing imported pilot data without first retaining the data you need.

After a code change, run the canonical build, test and analysis commands in the root README. Dedicated test databases end in `_test` or `_e2e`; tests never reset the main pilot database.

`node scripts/verify-preview.mjs` performs read-only desktop/mobile production smoke checks through fictional demo logins and writes screenshots to `docs/Testing/screenshots`. It checks page overflow and browser errors. It expects the seeded demo procurement in the main database and does not create commitments or financial transactions.

Live payments, external email, registry integration and hosting remain deferred. Remaining service balances are invoiced directly by the supplier outside the pilot.

## Mailbox upgrades

Run the normal Compose rebuild to apply versioned migrations and keep the database volume. Migration 002 creates durable mailbox messages/read receipts and backfills existing invitations. Startup also backfills invitations idempotently for fresh demo data. No reset is required. Mailbox notifications are written transactionally with domain events; failed deadline processing publishes no finalization letter until a successful retry. The UI polls every five seconds and read state survives restart. External email is not sent.
