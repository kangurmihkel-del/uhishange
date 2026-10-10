# Durable mailbox and visible procurement actions

Date: 2026-10-10. Owner: project maintainer. Status: implemented following the user's request.

Store organization-addressed letters and per-user read receipts in PostgreSQL. Both are append-only. Approved viewers can read invitations and general procurement messages; financial outcomes require representative authority. Administrators can inspect all letters but have independent read receipts. Invitations never grant organization authority.

Create letters from supported audit events on the same transaction client as the procurement operation. A failed payment/deadline transaction cannot leave a premature notification. Unique event keys and the existing serialized procurement operations prevent duplicate delivery on replay. The versioned mailbox migration and idempotent startup backfill expose existing invitations without resetting pilot data. Listing includes all authorized letters so older unread records remain accessible.

The React procurement view derives its five-stage process and next action from the real procurement, organization role, commitment and contract state. Actions open and focus the existing business forms or map; they do not change permissions or business rules. Mailbox letter opening records a persistent read receipt. Responsive detail ordering and focus/scroll behavior make the opened letter visible on phones. External email delivery remains deferred.
