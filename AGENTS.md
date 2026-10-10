# Ühishange agent instructions

Owner and lead maintainer: the user. Follow the retained MCAF guide. Preserve the original DOCX/image source files. All repository documentation is English; product UI is Estonian.

## Development flow

Read this file, docs/Home.md and relevant feature/ADR/testing documentation before edits. Describe non-trivial behavior and acceptance scenarios before implementing. Implement tests and code together; run changed tests, related suites, then the full required suite. Human maintainers own review and merge. Propose root instruction changes for owner review. Record stable lessons in relevant documentation; do not rely on chat memory.

## Canonical commands

Run from the repository root: npm run build; npm test; npm run format; npm run analyze. Local runtime: docker compose up --build -d. Tests: npm run test:integration; npm run test:e2e. Never report a command as passing without executing it. Failing tests or analysis block completion.

## Architecture and coding

Node 24, TypeScript, React/Vite, Express, pg, PostgreSQL/PostGIS. Shared typed REST contracts under src/shared. Parameterized SQL only. Money is integer EUR cents, fees integer basis points. Business time is stored UTC and displayed Europe/Tallinn. Membership authority is enforced server-side. No real payment, email, registry or hosting calls in this pilot. No secrets committed.

## Verification

Primary integration/API/E2E suites use real PostgreSQL/PostGIS. Do not mock internal storage/services. The explicitly simulated payment adapter is product behavior and must be labeled TEST in UI. Test race conditions, duplicate events, authorization failures and append-only ledger/audit. Coverage identifies gaps; meaningless assertions and test-only business bypasses are forbidden.

## Completion

Build, analysis, integration/API and browser suites pass; source documents remain intact; runtime, API, feature and operations documentation reflect implemented behavior; report any environment limitation honestly.
