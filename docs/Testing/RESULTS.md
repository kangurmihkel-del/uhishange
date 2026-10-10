# Verification results

Owner: project maintainer. Verified on 2026-10-10 in Europe/Tallinn.

The functional local pilot is running at http://localhost:3000. All required local build, test and analysis gates passed. Docker-backed verification is complete.

## Recorded commands

| Command                          | Result                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| npm run build                    | Passed: server TypeScript compilation and production Vite assets                             |
| npm test                         | Passed: 26 integration/API/time tests and 12 browser workflows                               |
| npm run analyze                  | Passed: strict TypeScript, ESLint and Prettier checks                                        |
| npm audit --audit-level=moderate | Passed: zero reported vulnerabilities                                                        |
| docker compose config --quiet    | Passed                                                                                       |
| docker compose up --build -d     | Passed: production images built and services initialized                                     |
| node scripts/verify-preview.mjs  | Passed: eighteen production screenshots, zero browser errors and no horizontal page overflow |

Environment: Node 24.19.0, PostgreSQL 17.5, PostGIS 3.5.2, Vitest 5.0.3 and Playwright Chromium. The browser suite uses the compiled production application on a separate port and database.

The initial sandbox helper could not execute commands. Approved host execution provided Docker engine access and completed container-backed verification. No Docker verification gap remains.

## Coverage

Final Vitest V8 coverage from the passing suite:

| Scope                                                    | Statements | Branches | Functions | Lines  |
| -------------------------------------------------------- | ---------- | -------- | --------- | ------ |
| Configured server, client API/time and shared form files | 91.23%     | 71.16%   | 89.88%    | 92.92% |
| Reported server modules                                  | 94.24%     | 81.40%   | 98.49%    | 95.76% |
| Transactional procurement domain                         | 96.02%     | 87.20%   | 100.00%   | 99.37% |

The configured coverage now includes the shared service form catalog and validation helpers. Vitest records server/API execution of these helpers; their React rendering and browser defaults are additionally exercised by Playwright. The configured coverage excludes the HTTP/worker entry files; an actual worker subprocess is exercised by the restart scenario. React views are verified by Playwright and are not included in these V8 percentages. Generated reports are in `coverage/` and `playwright-report/`. Coverage is evidence of execution, not a claim that every branch is tested.

All 31 declared HTTP API routes are exercised. The endpoint matrix and scenario details are in [tests/README.md](../../tests/README.md).

## Verified behavior

Integration assertions cover account hashing and persistent sessions; membership approval and representative/viewer restrictions; private contacts and cross-organization denial; snow specification, tier and deposit validation; geographic boundaries, sorted distances and invitation provenance; offer selection and immutable acceptance; duplicate commitments; parallel threshold captures; replay identity; failed-payment retry; withdrawal racing success; late capture refunds; preserved achieved pricing; exact fee rounding; final contracts; full supplier-cancellation refunds and reversal entries; append-only history; completion and rating; atomic CSV validation/import; and genuine worker restart and failed-job recovery.

Six browser scenarios run on both desktop and mobile Chromium: complete buyer/supplier/neighbor participation with a lower tier; registration, organization approval, profile editing, CSV preview/import and job retry; final contract review, rating and administrator cancellation; withdrawal from a finalized active contract; approved-viewer invitation access without response authority; and multi-service creation with supplier/neighbor participation. Map interaction includes organizations sharing the same coordinates.

Production smoke checks cover demo login, buyer dashboard, procurement details, geographic discovery and administration. Screenshots were visually inspected and the mobile headline and map label overlap were corrected:

- [Desktop login](screenshots/login-desktop.png)
- [Desktop dashboard](screenshots/buyer-desktop.png)
- [Desktop procurement](screenshots/procurement-desktop.png)
- [Desktop discovery](screenshots/neighbors-desktop.png)
- [Administrator](screenshots/admin-desktop.png)
- [Mobile login](screenshots/login-mobile.png)
- [Mobile dashboard](screenshots/buyer-mobile.png)
- [Mobile procurement](screenshots/procurement-mobile.png)

Follow-up acceptance checks verify readable Estonian acceptance and final agreements from preserved snapshots, Tallinn timestamps, historical names/addresses after profile changes, continued history after withdrawal/cancellation, localized CSV corrections, and viewer controls matching server permissions. Forged viewer invitation responses are rejected without changing the invitation. The shared REST snapshot types preserve the existing JSON shape.

The following history screenshots come from the isolated browser acceptance database on port 3001. They were visually inspected; the contract header icon was corrected to keep its intended compact width. These tests do not create financial records in the main pilot database.

- [Desktop agreement history](screenshots/agreement-history-desktop.png)
- [Mobile agreement history](screenshots/agreement-history-mobile.png)

Dependency updates followed the [CSV parser advisory](https://github.com/advisories/GHSA-8cw4-87c7-c6xx) and [Vitest migration guide](https://vitest.dev/guide/migration/). The final lockfile installs csv-parse 7.0.3 and Vitest/coverage 5.0.3; both host and container installation audits reported zero vulnerabilities.

## Public repository and hosted CI

Published on 2026-10-10 to [viljarpuusepp/uhishange](https://github.com/viljarpuusepp/uhishange), with public visibility and default branch `main`. The initial source commit is `ab22e608cccdc57881fb4d902f351fc723435dc6`.

[GitHub Actions verification run 38030577295](https://github.com/viljarpuusepp/uhishange/actions/runs/38030577295) passed on Ubuntu: dependency installation, PostgreSQL/PostGIS readiness, Chromium installation, production build, static analysis, all 20 integration/time tests and all 10 desktop/mobile browser workflows. The run uploaded the `verification-results` artifact and completed cleanup. These hosted results supplement the local checks above.

The initial public commit excluded the original event poster and generated/private runtime files. The maintainer subsequently added the poster while reorganizing source documents. [Source inventory](../Sources.md) records the unchanged input files and current source distribution. Generated/private runtime files remain excluded.

## Runtime and handoff

The final Compose state is: database healthy, application healthy, worker running and initializer exited successfully with code 0. The public health endpoint returned `status: ok`, `database: ready` and `paymentMode: TEST`. Database contents persisted across image rebuilds; the mailbox upgrade preserved the existing procurement and financial history. Smoke checks create only login sessions and read receipts; they do not make test payments in the main database. Integration and browser fixtures remain in their isolated test databases.

SHA-256 checks confirmed all four original input files are unchanged. The copied MCAF guide matches its source byte for byte. [Source inventory](../Sources.md) records their hashes.

[README](../../README.md) provides startup instructions, demo credentials, the CSV template and reset instructions. [Operations](../Operations/README.md) documents configuration, worker recovery and backup/restore commands.

All financial transactions are simulated; remaining service balances are invoiced outside the pilot. External email, live payments, registry integration and hosting are intentionally deferred. The GitHub Actions workflow runs the same gates after publication; the local results above do not establish a hosted CI result. Backup/restore instructions are supplied but were not executed against the main pilot database.

## Mailbox and guided procurement acceptance

The updated real-database suite passes 23 integration/API/time cases, and all five browser scenarios pass on desktop and mobile (10 cases). Mailbox assertions verify organization isolation, representative-only financial letters, pending/viewer restrictions, independent per-user read state, concurrent idempotent reads, immutable letters/receipts, seeded-invitation backfill, replay deduplication and transaction rollback before job retry. A 205-letter fixture proves older unread messages remain accessible. Mailbox module coverage: 96.87% statements, 93.18% branches, 100% functions and lines.

The complete buyer scenario uses visible next actions for publication, the neighbor map/invitations, supplier offers, offer comparison/selection, joining and TEST payment. The named neighbor demo account opens its invitation in Postkast and accepts it separately from participation. Contract and viewer scenarios verify durable read status, contract navigation and authorization. Production smoke checks cover the same mailbox/process layouts with zero browser errors or horizontal overflow. The four original source hashes still match.

- [Desktop mailbox](screenshots/mailbox-desktop.png)
- [Desktop opened letter](screenshots/mailbox-letter-desktop.png)
- [Mobile opened letter](screenshots/mailbox-letter-mobile.png)

## Multi-service procurement acceptance

The final canonical build and static analysis pass. `npm test` exits successfully with 26 real PostgreSQL/PostGIS integration/API/time cases and 12 desktop/mobile browser cases (38 total). The source catalog matches all five form definitions and 50 fields exactly. Server assertions cover 30 invalid version/choice/date/range/conditional-answer variants, complete specifications in separate frozen acceptance and final contracts, and a non-snow group reaching a lower tier with withdrawal and exact 13-cent TEST deposit allocation. Concurrent startup preserves existing paid snow procurements, ledger/audit history and the four insert-only service examples without duplicate jobs, offers, invitations or letters.

Shared service form module coverage is 71.25% statements, 60.68% branches, 52.17% functions and 72.60% lines; demo seed coverage is 94.44%, 83.33%, 100% and 100% respectively. React view code is exercised by the browser suite rather than the reported V8 server coverage.

Browser tests create all four additional categories, validate conditional questions, clear stale answers on type/condition changes, display stored scopes and filter categories. The fresh pest-control workflow invites the neighbor, submits/selects a supplier offer, accepts the mailbox invitation and confirms two TEST payments. Contract tests preserve non-snow scope through profile changes, lower-price finalization, rating and administrator cancellation. Existing snow, permissions, worker recovery and financial race scenarios continue to pass.

The Docker production rebuild and fourteen screenshot smoke checks pass with zero browser errors and no horizontal overflow. New service-list, pest-details and mobile branch-form screenshots were visually inspected; the procurement-center note is stacked clearly on mobile. The original four source hashes, copied MCAF guide and supplied HTML hash match their recorded values. Existing pilot data survived the rebuild.

- [All demo service types](screenshots/service-types-desktop.png)
- [Pest-control procurement](screenshots/pest-procurement-desktop.png)
- [Mobile branch-cleanup form](screenshots/branch-form-mobile.png)

## CVI design acceptance

The portal now follows the unchanged supplied CVI across public entry, buyer and supplier views, forms, geographic discovery, mailbox, agreement history and administration. The final production build and static analysis passed. The complete `npm test` run exited successfully with 26 real PostgreSQL/PostGIS integration/API/time tests and 12 desktop/mobile browser cases (38 total). Configured V8 coverage remains 91.23% statements, 71.16% branches, 89.88% functions and 92.92% lines; the scope and exclusions above still apply.

Browser assertions verify that all three public navigation links focus and reveal actual content without changing the application route, the main CTA opens registration and focuses the name field, and Lora/Work Sans load from the portal origin with Estonian characters. Participation checks follow zero, one, threshold and above-threshold confirmed payments, then withdrawals down to one of two required buyers. The current count falls to 1/2 while historical success and the achieved €700 price remain unchanged. A 1,000-participant offer displays the exact goal with at most 20 decorative dots and no page overflow.

The Docker production rebuild preserves the database volume. All eighteen production smoke captures passed with zero browser errors or horizontal page overflow. Visual review covered public entry, buyer dashboard, service list/details, mobile creation, neighbor map, mailbox, administrator approvals and saved contracts. Mobile service questions use full width, creation cards have clear spacing, and map markers distinguish neighbors, selection and the procurement center. Darker accent text and input boundaries support readable contrast; focus states remain visible. This is scenario and visual verification, not a full accessibility audit.

The four original inputs, retained MCAF guide, supplied HTML catalog and CVI document match their recorded SHA-256 hashes. No server, shared contract or migration files changed in this design update. Production health reports `status: ok`, `database: ready` and `paymentMode: TEST`; the database/application are healthy, the worker is running and initialization exited with code 0. Production smoke checks only add demo sessions/read receipts and do not create financial transactions.

Updated screenshots above show the CVI. Additional public and mobile discovery views:

- [Public services](screenshots/public-services-desktop.png)
- [Public process explanation](screenshots/public-process-desktop.png)
- [Public supplier information](screenshots/public-provider-desktop.png)
- [Mobile neighbor discovery](screenshots/neighbors-mobile.png)

Locally bundled fonts and original licenses are documented in [public/fonts/README.md](../../public/fonts/README.md). The design decision and preserved business-rule precedence are recorded in [ADR 0004](../ADR/0004-cvi-design.md).
