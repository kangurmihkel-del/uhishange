# Ühishange

[![Verify](https://github.com/viljarpuusepp/uhishange/actions/workflows/verify.yml/badge.svg)](https://github.com/viljarpuusepp/uhishange/actions/workflows/verify.yml)

[Public source repository](https://github.com/viljarpuusepp/uhishange)

A functional local pilot for housing associations procuring shared services in Mustamäe. The Estonian portal includes buyer, supplier and administrator workflows backed by PostgreSQL/PostGIS. All payments and payouts are simulated; invitations stay inside the portal.

## Start

Install Git and Docker Desktop with Compose, then clone and start:

```powershell
git clone https://github.com/viljarpuusepp/uhishange.git
cd uhishange
docker compose up --build -d
```

Open http://localhost:3000. Initialization creates the schema and fictional demo data once. Database storage survives container restarts. Only localhost ports are exposed.

## Demo accounts

Every demo account uses password **Demo2026!**.

| Account                                   | Role                             |
| ----------------------------------------- | -------------------------------- |
| buyer1@demo.test                          | Initiating housing association   |
| buyer2@demo.test through buyer8@demo.test | Neighboring housing associations |
| supplier@demo.test                        | Demo service supplier            |
| admin@demo.test                           | Platform administrator           |

Demo organizations, service requests, coordinates, contracts and money are test material. Local registration creates a user; organization authority requires approval in the administrator screen. Invites never grant permissions.

## Procurement types

The demo supports the five types from [Uhishange_vorm.html](Uhishange_vorm.html): snow removal, pest control, energy certificates, branch cleanup and a free-form service. Each type has its own questions and shared location/access/date/pricing fields. Conditional questions appear when relevant. Four new fictional requests demonstrate the added categories; an ordinary startup upgrades existing demo databases idempotently. Existing snow requests and historical agreements remain supported. Supplier prices always cover the complete described service per association.

## Try the complete workflow

1. Use **Ostja** (buyer1) to select a procurement type and create a request. Follow the visible **next action**: publish, open the neighbor map and send in-app invitations.
2. Use **Naaberühistu** (buyer2), open **Postkast**, read the invitation and accept it. Follow **Vaata hanget** to see the shared process. Invitation acceptance is separate from paid participation.
3. Sign in as the supplier and publish an offer with participant/price tiers and a fixed deposit.
4. As the initiator, select one offer. Each buyer confirms authority and scope, then captures their test deposit.
5. Reach the first tier to confirm success. Additional paid buyers can improve everyone's price until the joining deadline.
6. At the deadline, the worker finalizes individual contracts and distributes deposits: 4% platform fee and 96% supplier share. Buyers confirm completion and leave ratings.
7. Inspect immutable events, ledger entries, imports and approvals as administrator.

The procurement page shows the five stages and a role-specific next action above its details. Buttons open the actual offer, neighbor or joining form. The mailbox stores invitations and offer/payment/deadline notifications; each user's read status survives logout and restart. All financial letters explicitly identify TEST transactions.

Acceptance details and final contracts show the saved agreement in Estonian, including historical organization profiles, service scope, tiers, prices and Tallinn dates. Profile changes and cancellation preserve this history. Approved viewers can read invitations; only representatives or administrators can respond. CSV preview gives field-specific corrections in Estonian before any import is applied.

Before success, withdrawal refunds the deposit. After success, withdrawal retains it. Failed groups and supplier cancellation refund all deposits. Cancellation after payout creates reversing entries without deleting history. Remaining service balances are billed directly outside this pilot.

## Develop and verify

Install Node 24, start the database, then install dependencies:

```powershell
docker compose up -d db
npm ci
npm run bootstrap
npm run build
npm run dev
```

Use a separate terminal for `npm run worker`. For UI hot reload, use `npm run dev:ui` with the API running. Configuration is documented in .env.example; pass environment variables through your shell or Compose. The default local database uses port 54329.

Canonical checks:

```powershell
npx playwright install chromium
npm run build
npm test
npm run analyze
```

Tests create isolated uhishange_test and uhishange_e2e databases. They reset only those test schemas and run the browser test server on port 3001. Integration/API tests use a real database; Playwright uses the actual frontend/backend. `npm run format` formats maintained source and documentation.

## Import organizations

Use the administrator CSV preview before confirming an atomic import. [CSV template](examples/organizations.csv) contains fictional examples. Coordinates are WGS84. Registry codes identify existing profiles; preview validation rejects malformed and duplicate rows. Import does not create user authority or send emails.

## Stop and reset

`docker compose down` stops services and preserves data. To deliberately discard this project's database and restore a fresh demo, run `docker compose down --volumes`, then start again. This deletes all imported organizations and workflow history in this project's database.

## Documentation

[Documentation index](docs/Home.md) links to behavior, architecture, API, verification and operations. Root AGENTS.md applies MCAF and names the user as maintainer. The four original input files and attributed MCAF guide are preserved under docs/. [Source inventory](docs/Sources.md) records their hashes and the supplied HTML catalog.

[Verification results](docs/Testing/RESULTS.md) include coverage and desktop/mobile screenshots from the running Docker portal.
