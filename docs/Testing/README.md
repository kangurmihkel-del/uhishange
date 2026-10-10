# Verification strategy

Owner: project maintainer. Integration and API suites exercise real PostgreSQL/PostGIS; browser tests use the real HTTP server and database.

Required scenarios: registration/login/logout; pending memberships rejected until approved; buyer/supplier/viewer/admin permissions; create/publish procurement; 500 m radius boundary and configurable radius; supplier tier validation; initiator selects/freezes offer; duplicate organization commitments; failed payment retry; two concurrent threshold captures; duplicate event and new-event replay of same transaction; success versus withdrawal ordering; late capture refund; best-price monotonicity; deadline failure and success; worker restart and retry; exact fee rounding; per-buyer contract/final snapshot; supplier cancellation after payout with full refund and reversals; completion/rating; CSV validation/atomic import; private contact protection.

Run changed/new tests first, related suites second and npm test last. npm run analyze includes TypeScript, lint and format checking. Coverage reports identify critical gaps; no arbitrary coverage percentage replaces scenario assertions.

Fixtures use short real deadlines rather than modifying frozen agreement deadlines. Worker failure coverage temporarily installs an isolated-test-database INSERT trigger, verifies transaction rollback, removes the trigger and exercises administrative retry. No production business bypass exists.

A GitHub Actions verification workflow runs the same build, analysis and database/browser commands on push and pull requests. The local build verifies these gates independently; hosted CI results are recorded separately in the verification report after publication.

Workflow action versions were checked against official release pages: [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).

Follow-up acceptance coverage verifies readable frozen agreement history on desktop and mobile, separate final pricing after lower tiers and cancellation, and localized field-specific CSV errors through the real HTTP preview endpoint.

Invitation browser coverage includes an approved viewer: invitations remain readable, response controls are absent, and the API rejects a forged response.
