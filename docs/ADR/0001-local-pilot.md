# Local persistent pilot architecture

Date: 2026-10-10. Owner: project maintainer. Status: accepted by user implementation request.

Use Node 24, React/Vite TypeScript, Express REST API and pg with versioned SQL migrations. PostgreSQL/PostGIS provides persistence, radius search, transactional row locking and unique indexes. Compose runs database, migration/seed initialization, app and durable job worker. The built UI is served by Express at localhost:3000.

Money uses integer euro cents and the platform fee is 400 basis points. API exposes explicit domain operations, not arbitrary status changes. Transactions use a single checked-out pg client. Immutable financial/audit rows and separate acceptance/final snapshots preserve history. Background work is claimed with database locks and idempotency keys.

The selected single-supplier model avoids competing paid offer groups. The first tier is the success threshold. Only registered approved housing associations can commit; suppliers and observers cannot perform buyer operations. Seed data is fictional and marked demo.

Simulated payment create/capture/refund/payout behavior is a product adapter, not a substitute for a real storage integration test. Live PSP, e-ID, external mail, map tiles, registry synchronization, invoices, signatures and hosting are deferred. Coordinate map needs no external map service.
