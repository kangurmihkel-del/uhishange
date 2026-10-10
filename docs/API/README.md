# REST API

Owner: project maintainer. Base path: /api/v1. JSON requests and responses use camelCase. All money values are integer EUR cents; timestamps are UTC ISO strings. Organization types are BUYER and SUPPLIER. Errors return {error:{code,message}} with an HTTP status. Every mutating operation checks session authority and same-origin request metadata. The HttpOnly session cookie is uhishange_session. Platform administrators have an audited operational override for organization-authorized operations; organization type and lifecycle constraints still apply. Regular users require the documented approved membership.

## Accounts and organizations

| Method and path                    | Input or result                                                                  | Authority                                |
| ---------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| GET /health                        | Database readiness                                                               | Public                                   |
| GET /session                       | user or null, memberships with organizations                                     | Current session                          |
| POST /register                     | name, email, password                                                            | Public                                   |
| POST /login                        | email, password                                                                  | Public                                   |
| POST /logout                       | Ends current session                                                             | Current session                          |
| GET /organizations                 | Safe profile list; admin receives contacts                                       | Signed in                                |
| POST /organizations                | registryCode, name, orgType, address, latitude, longitude, optional email        | Signed in; creates pending membership    |
| PUT /organizations/:id             | name, address, latitude, longitude, optional email; legal code/type remain fixed | Approved representative or administrator |
| POST /organizations/:id/membership | Requests organization authority                                                  | Signed in; admin approval required       |

## Procurement and money

| Method and path                     | Input or result                                                                          | Authority                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| GET /procurements                   | Procurement list                                                                         | Signed in                             |
| POST /procurements                  | organizationId, title, description, radiusM, joinDeadlineAt, spec                        | Approved buyer representative         |
| GET /procurements/:id               | procurement, offers, own commitments, accessible contracts, nearby profiles, invitations | Signed in; private records filtered   |
| POST /procurements/:id/publish      | Publishes draft                                                                          | Initiator representative              |
| POST /procurements/:id/invitations  | Optional organizationIds; creates in-app invitations                                     | Initiator representative              |
| POST /procurements/:id/offers       | organizationId, basePriceCents, depositCents, terms, validUntil, tiers                   | Approved supplier representative      |
| POST /procurements/:id/select-offer | offerId                                                                                  | Initiator before first commitment     |
| POST /procurements/:id/commitments  | organizationId, authorityConfirmed, scopeConfirmed                                       | Approved buyer representative         |
| POST /commitments/:id/withdraw      | Withdraws and applies refund/retention rule                                              | Owner representative                  |
| POST /test-payments/:commitmentId   | outcome captured or failed; optional eventId                                             | Owner representative or administrator |
| GET /invitations                    | Organization invitations; administrators inspect all                                     | Approved membership                   |
| POST /invitations/:id/respond       | status ACCEPTED or DECLINED                                                              | Target organization representative    |
| GET /contracts                      | Own buyer/supplier contracts                                                             | Approved membership or administrator  |
| POST /contracts/:id/complete        | rating 1–5, comment                                                                      | Owning buyer representative           |

Snow specification: seasonStart, seasonEnd, areaM2, parkingM2, walkwayM, triggerCm, responseHours, gritting, snowHauling. Price tiers use minParticipants and priceCents; first tier is the success threshold. Dates and validity must cover the joining period. Deposits must not exceed the cheapest possible price. Accepting terms cannot bypass the server-side authority check.

## Administration

| Method and path                     | Input or result                                               |
| ----------------------------------- | ------------------------------------------------------------- |
| GET /admin                          | memberships, organizations, ledger, audit, jobs, procurements |
| POST /admin/memberships/:id         | status approved or rejected                                   |
| POST /admin/import/preview          | csv text; returns validated rows and errors                   |
| POST /admin/import                  | csv text; revalidates and applies atomically                  |
| POST /admin/procurements/:id/cancel | reason; full refunds and payout/fee reversals                 |
| POST /admin/jobs/:id/retry          | Retries a failed durable job                                  |

All administration routes require platform-administrator authority. Contacts, account emails, full ledger and snapshots are not publicly exposed. CSV canonical headers: registry_code,name,org_type,address,latitude,longitude,email. Accepted type aliases are described by the validation response and template.

## Payment identity and historical data

This pilot exposes a simulated provider operation, not a production PSP webhook. Captures are unique per commitment payment; event replays cannot double-charge or double-count. Failed attempts can be retried. Late captures produce an equal refund. Ledger entries record deposits, refunds, platform fees, supplier payouts and compensating reversals without editing previous entries. Contracts preserve finalSnapshot separately from acceptanceSnapshot.

Acceptance and final agreement snapshots have explicit shared TypeScript contracts. Their JSON shape is unchanged: acceptance retains acceptedAt and confirmations; final contracts retain finalizedAt, finalPriceCents, depositCreditCents and remainingInvoiceCents. Product history formats stored values in Estonian and Europe/Tallinn without changing or reloading parties from current profiles.
