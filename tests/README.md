# Pilot verification

Integration uses real PostgreSQL/PostGIS and an actual HTTP server. Browser tests use the built React portal and actual backend. Storage, membership checks, financial processing and geographic queries are never mocked.

Run `npm run test:integration` and `npm run test:e2e`; `npm test` runs both. Root test setup prepares isolated databases. Integration defaults to `uhishange_test` on port 54329 and refuses a name without the `_test` suffix before resetting its public schema. Browser tests use `E2E_DATABASE_URL` (default `uhishange_e2e`) and a separate server at port 3001. They never reuse the user pilot at port 3000. Browser fixtures require the `_e2e` suffix and use unique identifiers and titles.

## Public endpoint coverage

Every public route in `src/server/app.ts` is exercised through HTTP:

| Group                    | Routes                                                                   | Essential assertions                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Health and accounts      | GET health/session; POST register/login/logout                           | Readiness, TEST mode, password hashing, cookie rotation, logout and denied credentials                                              |
| Organizations            | GET/POST organizations; PUT organization; POST membership                | Approval, viewer limitations, profile update, contact privacy and cross-organization denial                                         |
| Procurements             | GET list/detail; POST create/publish                                     | Valid snow specification, initiator permissions and persisted state                                                                 |
| Invitations              | POST procurement invitations; GET invitations; POST respond              | PostGIS 499/501 metre boundary, configurable radius, sorted distance, source and no authority from invitations                      |
| Offers and participation | POST offers/select-offer/commitments/withdraw/test-payments              | Tier/deposit validation, immutable acceptance, duplicate acceptance, payment replay/retry and serialized threshold/withdrawal races |
| Contracts                | GET contracts; POST complete                                             | Individual final snapshots, deposit credit, invoice balance, owner ratings and restricted visibility                                |
| Administration           | GET admin; POST membership review/import preview/import/cancel/job retry | Whole-file validation, transaction rollback, append-only history, cancellation refunds/reversals and worker recovery                |

## Financial and worker fixtures

Deadlines use short real intervals. Tests do not change frozen deadlines or disable production history triggers. The restart scenario starts an actual worker subprocess, verifies its PostgreSQL connection using a unique application name, stops only that subprocess, and restarts after the deadline. Each child is hidden on Windows and stopped in a finally block.

A recovery scenario temporarily installs a trigger in the isolated database that fails contract insertion for one fixture procurement. This induces a genuine transaction failure and proves that no partial contracts or payouts survive. The test removes the fault trigger in a finally block, retries the job through the admin API and verifies one allocation. No production business rule is bypassed.

Financial assertions cover retained deposits including withdrawals, nearest-cent 4% fees (including a 13-cent deposit), idempotent payouts/refunds, immutable snapshots, success history and a non-increasing achieved price. Conflicting duplicate payment event IDs are rejected.

## Browser and time scenarios

Four scenarios run on desktop Chromium and a mobile viewport: buyer/supplier/group participation with lower pricing, registration and admin approval/import/retry, contract completion followed by administrator cancellation, and withdrawal from a finalized active contract. They exercise map zoom/selection including colocated organizations, profile editing, invitations, failed payment retry, withdrawal notices, TEST labels and horizontal page overflow.

Browser fixture preparation uses public API operations and the same real durable processor used by the worker. Fixtures establish contract/job starting states; interactions under test use visible portal controls.

Tallinn conversion tests cover winter/summer offsets, midnight crossing, the nonexistent spring hour and the repeated autumn hour. The repeated autumn hour resolves to its earlier UTC instant. Dates round-trip independently of the host timezone.

Demo passwords are `Demo2026!`; registration tests use `Demo2026!!` to satisfy the ten-character minimum. The HTTP helper applies every Set-Cookie header in order because login clears an old session before creating a new one.

Coverage is written to `coverage/`; browser artifacts and reports go to `test-results/` and `playwright-report/`. Their existence is not a passing result: record command exit status and any remaining verification gaps.
