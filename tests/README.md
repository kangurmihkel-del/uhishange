# Pilot verification

Integration uses real PostgreSQL/PostGIS and an actual HTTP server. Browser tests use the built React portal and actual backend. Storage, membership checks, financial processing and geographic queries are never mocked.

Run `npm run test:integration` and `npm run test:e2e`; `npm test` runs both. Root test setup prepares isolated databases. Integration defaults to `uhishange_test` on port 54329 and refuses a name without the `_test` suffix before resetting its public schema. Browser tests use `E2E_DATABASE_URL` (default `uhishange_e2e`) and a separate server at port 3001. They never reuse the user pilot at port 3000. Browser fixtures require the `_e2e` suffix and use unique identifiers and titles.

## Public endpoint coverage

Every public route in `src/server/app.ts` is exercised through HTTP:

| Group                    | Routes                                                                   | Essential assertions                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health and accounts      | GET health/session; POST register/login/logout                           | Readiness, TEST mode, password hashing, cookie rotation, logout and denied credentials                                                                 |
| Organizations            | GET/POST organizations; PUT organization; POST membership                | Approval, viewer limitations, profile update, contact privacy and cross-organization denial                                                            |
| Procurements             | GET list/detail; POST create/publish                                     | Valid snow specification, initiator permissions and persisted state                                                                                    |
| Invitations              | POST procurement invitations; GET invitations; POST respond              | PostGIS 499/501 metre boundary, configurable radius, sorted distance, source and no authority from invitations                                         |
| Mailbox                  | GET mailbox; POST mailbox read                                           | Approved organization visibility, restricted financial messages, per-user persistent reads, invitation/lifecycle deduplication and out-of-scope denial |
| Offers and participation | POST offers/select-offer/commitments/withdraw/test-payments              | Tier/deposit validation, immutable acceptance, duplicate acceptance, payment replay/retry and serialized threshold/withdrawal races                    |
| Contracts                | GET contracts; POST complete                                             | Individual final snapshots, deposit credit, invoice balance, owner ratings and restricted visibility                                                   |
| Administration           | GET admin; POST membership review/import preview/import/cancel/job retry | Whole-file validation, transaction rollback, append-only history, cancellation refunds/reversals and worker recovery                                   |

## Financial and worker fixtures

Deadlines use short real intervals. Tests do not change frozen deadlines or disable production history triggers. The restart scenario starts an actual worker subprocess, verifies its PostgreSQL connection using a unique application name, stops only that subprocess, and restarts after the deadline. Each child is hidden on Windows and stopped in a finally block.

A recovery scenario temporarily installs a trigger in the isolated database that fails contract insertion for one fixture procurement. This induces a genuine transaction failure and proves that no partial contracts or payouts survive. The test removes the fault trigger in a finally block, retries the job through the admin API and verifies one allocation. No production business rule is bypassed.

Financial assertions cover retained deposits including withdrawals, nearest-cent 4% fees (including a 13-cent deposit), idempotent payouts/refunds, immutable snapshots, success history and a non-increasing achieved price. Conflicting duplicate payment event IDs are rejected.

## Browser and time scenarios

Five scenarios run on desktop Chromium and a mobile viewport: buyer/supplier/group participation with lower pricing, registration and admin approval/import/retry, contract completion followed by administrator cancellation, withdrawal from a finalized active contract, and approved viewers reading invitations. They exercise map zoom/selection including colocated organizations, profile editing, invitations, failed payment retry, withdrawal notices, TEST labels and horizontal page overflow.

The main procurement scenario uses the visible process/next-action panel to publish, find neighbors, compare offers, join and pay. The neighbor demo shortcut opens buyer2's account; the buyer receives and accepts an invitation through the Postkast view before separately confirming participation and TEST payment. The contract scenario reads its finalization message, verifies read state survives logout, and follows the procurement's next action to the contract. Viewer coverage reads a mailbox invitation while confirming that response and joining controls are unavailable. These flows run on desktop and mobile and do not require secondary-tab navigation for the next required task.

Mailbox API scenarios verify seeded invitations without resetting data, repeated invitation delivery, organization isolation, pending-membership exclusion, viewer general-message access, restricted TEST payment privacy, independent reads for users of the same organization and administrators, concurrent idempotent reads, append-only message/read history, and read persistence after logout and bootstrap. Lifecycle assertions cover offer selection, financial-event replay, paid success, worker restart/finalization, failure with late refund, cancellation after payout and rollback/retry without premature notifications. Messages are durable database records; no external email adapter is used.

The mailbox returns every visible letter in date order. A real-database fixture inserts 205 historical general messages for one approved organization; public list/read operations verify that the oldest letter remains available, the unread count is exact and cross-organization access stays denied. This fixture exercises message history without changing financial or membership behavior.

Browser fixture preparation uses public API operations and the same real durable processor used by the worker. Fixtures establish contract/job starting states; interactions under test use visible portal controls.

Tallinn conversion tests cover winter/summer offsets, midnight crossing, the nonexistent spring hour and the repeated autumn hour. The repeated autumn hour resolves to its earlier UTC instant. Dates round-trip independently of the host timezone.

Demo passwords are `Demo2026!`; registration tests use `Demo2026!!` to satisfy the ten-character minimum. The HTTP helper applies every Set-Cookie header in order because login clears an old session before creating a new one.

Coverage is written to `coverage/`; browser artifacts and reports go to `test-results/` and `playwright-report/`. Their existence is not a passing result: record command exit status and any remaining verification gaps.
