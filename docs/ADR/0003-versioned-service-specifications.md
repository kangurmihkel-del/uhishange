# Versioned service specifications

Date: 2026-10-10. Owner: project maintainer. Status: accepted by the user's request to add the supplied form types to the demo.

Keep the existing PostgreSQL JSONB spec and procurement locking/financial model. Add a typed versioned service specification {formId,version,answers}, alongside the legacy SnowSpec union, using a shared catalog derived from Uhishange_vorm.html. Both React and server validation use these definitions. Conditional/unknown answers are rejected on the server; the UI sanitizes hidden values. Frozen acceptance and final snapshots retain the full versioned payload. Existing snow records require no rewrite.

Catalog version 1 remains available for historical display; future incompatible questions require a new version. Prices stay one gross total service price per association, even when unit prices are requested as supporting detail. Demo examples use stable identities and an idempotent startup seed extension. The supplied standalone HTML and original inputs are preserved unchanged.
