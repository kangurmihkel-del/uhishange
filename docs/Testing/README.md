# Verification strategy

Owner: project maintainer. Integration and API suites exercise real PostgreSQL/PostGIS; browser tests use the real HTTP server and database.

Required scenarios: registration/login/logout; pending memberships rejected until approved; buyer/supplier/viewer/admin permissions; create/publish procurement; 500 m radius boundary and configurable radius; supplier tier validation; initiator selects/freezes offer; duplicate organization commitments; failed payment retry; two concurrent threshold captures; duplicate event and new-event replay of same transaction; success versus withdrawal ordering; late capture refund; best-price monotonicity; deadline failure and success; worker restart and retry; exact fee rounding; per-buyer contract/final snapshot; supplier cancellation after payout with full refund and reversals; completion/rating; CSV validation/atomic import; private contact protection.

Service fee scenarios ([ADR 0006](../ADR/0006-deposit-service-fee.md)): frozen 10% deposit percentage with no minimum; final-price and achieved-tier independence; full buyer deposit credit; positive deposits no greater than the cheapest tier price; retained-withdrawal allocation; legacy missing-policy/custom-rate and frozen ADR 0005 contract/minimum preservation; exact cent rounding and duplicate/cancellation allocations; malformed empty/negative/fractional/unsafe offer tiers returning 400 without persistence; supplier live fee/payout previews and final saved history in desktop/mobile layouts. Historical ADR 0005 coverage remains documented in prior verification results. For this maintainer-requested quick change, rerun focused fee/compatibility checks rather than asserting a new complete suite run.

Run changed/new tests first, related suites second and npm test last. npm run analyze includes TypeScript, lint and format checking. Coverage reports identify critical gaps; no arbitrary coverage percentage replaces scenario assertions.

Fixtures use short real deadlines rather than modifying frozen agreement deadlines. Worker failure coverage temporarily installs an isolated-test-database INSERT trigger, verifies transaction rollback, removes the trigger and exercises administrative retry. No production business bypass exists.

A GitHub Actions verification workflow runs the same build, analysis and database/browser commands on push and pull requests. The local build verifies these gates independently; hosted CI results are recorded separately in the verification report after publication.

Workflow action versions were checked against official release pages: [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).

Follow-up acceptance coverage verifies readable frozen agreement history on desktop and mobile, separate final pricing after lower tiers and cancellation, and localized field-specific CSV errors through the real HTTP preview endpoint.

Invitation browser coverage includes an approved viewer: invitations remain readable, response controls are absent, and the API rejects a forged response.

Mailbox coverage uses real PostgreSQL/HTTP to verify seed and newly sent invitation messages, organization isolation, viewer restrictions, per-user read persistence and idempotence, offer/lifecycle notifications, and no duplicates from repeated sends or payment replay. Browser scenarios follow the visible next-action controls, open the neighbor demo mailbox, respond to an invitation, join/pay, and reach contract review without hunting for tabs on desktop/mobile.

Multi-service coverage follows the supplied HTML catalog: all five server-validated forms, optional/conditional field visibility, type switching, numeric and date validation, legacy compatibility, frozen non-snow acceptance/final scopes, idempotent seed upgrades and desktop/mobile category discovery and service procurement. Run the new/changed cases first, then the related suites and full canonical gates.

CVI acceptance follows [Visual identity](../Features/VisualIdentity.md): public explanatory navigation and account CTA, locally loaded Lora/Work Sans fonts, exact paid participation dots and retained success history, clear map selection, accessible focus/contrast and responsive layouts. Existing database/API and all role workflows remain required. Inspect production screenshots for public entry, buyer dashboard, service list/details, neighbor map, creation, mailbox, saved contracts and administration after the build.

[Regional format acceptance](../Features/RegionalFormats.md) adds pure parsing/display tests and real browser input assertions. Desktop uses en-US/America/Los_Angeles; mobile uses en-GB/Asia/Tokyo. Estonian dates, comma/grouped quantities, exact cents and Tallinn UTC conversion must remain consistent under both settings. Native calendar picker language may follow the browser, while the visible text fields use explicit Estonian formats.

The [full-process recording](../Demo.md) uses a third, uniquely named database and ordinary UI actions. Its assertions inspect the resulting contracts, ratings, TEST ledger totals and unchanged main business records. Recording is supplementary demo evidence; it does not replace the canonical integration/API/browser suites.
