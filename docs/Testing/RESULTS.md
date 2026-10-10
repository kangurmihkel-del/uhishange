# Verification results

Owner: project maintainer. Verified on 2026-10-10 in Europe/Tallinn.

The functional local pilot is running at http://localhost:3000. All required local build, test and analysis gates passed. Docker-backed verification is complete.

## Recorded commands

| Command                          | Result                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| npm run build                    | Passed: server TypeScript compilation and production Vite assets                          |
| npm test                         | Passed: 20 integration/time tests and 10 browser workflows                                |
| npm run analyze                  | Passed: strict TypeScript, ESLint and Prettier checks                                     |
| npm audit --audit-level=moderate | Passed: zero reported vulnerabilities                                                     |
| docker compose config --quiet    | Passed                                                                                    |
| docker compose up --build -d     | Passed: production images built and services initialized                                  |
| node scripts/verify-preview.mjs  | Passed: eight production screenshots, zero browser errors and no horizontal page overflow |

Environment: Node 24.19.0, PostgreSQL 17.5, PostGIS 3.5.2, Vitest 5.0.3 and Playwright Chromium. The browser suite uses the compiled production application on a separate port and database.

The initial sandbox helper could not execute commands. Approved host execution provided Docker engine access and completed container-backed verification. No Docker verification gap remains.

## Coverage

Final Vitest V8 coverage from the passing suite:

| Scope                                              | Statements | Branches | Functions | Lines  |
| -------------------------------------------------- | ---------- | -------- | --------- | ------ |
| Configured server and client API/time helper files | 92.77%     | 70.11%   | 95.45%    | 94.39% |
| Reported server modules                            | 93.83%     | 77.25%   | 98.33%    | 95.29% |
| Transactional procurement domain                   | 96.00%     | 87.20%   | 100.00%   | 99.37% |

The configured coverage excludes the HTTP/worker entry files; an actual worker subprocess is exercised by the restart scenario. React views are verified by Playwright and are not included in these V8 percentages. Generated reports are in `coverage/` and `playwright-report/`. Coverage is evidence of execution, not a claim that every branch is tested.

All 29 declared HTTP API routes are exercised. The endpoint matrix and scenario details are in [tests/README.md](../../tests/README.md).

## Verified behavior

Integration assertions cover account hashing and persistent sessions; membership approval and representative/viewer restrictions; private contacts and cross-organization denial; snow specification, tier and deposit validation; geographic boundaries, sorted distances and invitation provenance; offer selection and immutable acceptance; duplicate commitments; parallel threshold captures; replay identity; failed-payment retry; withdrawal racing success; late capture refunds; preserved achieved pricing; exact fee rounding; final contracts; full supplier-cancellation refunds and reversal entries; append-only history; completion and rating; atomic CSV validation/import; and genuine worker restart and failed-job recovery.

Five browser scenarios run on both desktop and mobile Chromium: complete buyer/supplier/neighbor participation with a lower tier; registration, organization approval, profile editing, CSV preview/import and job retry; final contract review, rating and administrator cancellation; withdrawal from a finalized active contract; and approved-viewer invitation access without response authority. Map interaction includes organizations sharing the same coordinates.

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

The public commit excludes the original named-participant event poster and generated/private runtime files. [Source inventory](../Sources.md) records the unchanged local input files and public distribution.

## Runtime and handoff

The final Compose state is: database healthy, application healthy, worker running and initializer exited successfully with code 0. The public health endpoint returned `status: ok`, `database: ready` and `paymentMode: TEST`. Database contents persisted across image rebuilds; the main database retained its single seeded procurement with no captured financial transactions. Integration and browser fixtures remain in their isolated test databases.

SHA-256 checks confirmed all four original input files are unchanged. The copied MCAF guide matches its source byte for byte. [Source inventory](../Sources.md) records their hashes.

[README](../../README.md) provides startup instructions, demo credentials, the CSV template and reset instructions. [Operations](../Operations/README.md) documents configuration, worker recovery and backup/restore commands.

All financial transactions are simulated; remaining service balances are invoiced outside the pilot. External email, live payments, registry integration and hosting are intentionally deferred. The GitHub Actions workflow runs the same gates after publication; the local results above do not establish a hosted CI result. Backup/restore instructions are supplied but were not executed against the main pilot database.
