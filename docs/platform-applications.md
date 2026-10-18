# Platform applications

Brand and affiliate identities are verified through the existing independent Supabase integration. Verification alone never activates an account. Role-bound registration creates a draft `platform_applications` record without creating an operating workspace, program, affiliate profile, bank destination or subscription.

## Applicant journey

1. Create the matching brand/affiliate login and verify the email.
2. Complete `/application`: contact name, country/city/phone, public website and channel URLs, category, audience geography/reach, experience, promotional methods, description and strategy. Brands add legal/business identity, team/order ranges, store currency and program goals. Applicants confirm their authority and accuracy.
3. Explicitly submit the complete profile. A strict role-specific schema checks all required fields and declarations. No approval/status/identity/admin fields are accepted from the applicant.
4. Wait on the private status page. The owner can approve, request more information or decline, with a message visible to that applicant. No delivery time or acceptance is guaranteed. No email is sent by the review workflow.
5. Approval atomically opens the matching portal and provisions its primary records. An affiliate must still separately apply to a brand's invited program and receive that brand's acceptance.

There are no identity-document, bank or tax-record uploads in this application. Declared websites/channels are reviewed manually; listing a URL does not automatically verify ownership. The full admission profile is private to the applicant and platform owner. It is not a public marketplace listing and is not exposed to other brands.

Pending applicants can withdraw a submission to edit it, then submit again. Requests for information and declined profiles can also be corrected and resubmitted. Submitted versions are read-only until withdrawn or reviewed. Approved admission snapshots remain read-only; existing operational account/profile controls are separate.

## Owner review

The established owner uses `/owner/applications` or **Application review** from the independent owner navigation. The queue supports status and brand/affiliate filters, counts and the oldest 100 matching requests. Select an applicant to inspect the complete profile and history, then explicitly choose and confirm a decision. Requests for information and rejection require an explanatory message. A reviewer cannot review their own application.

Authorization comes from `platform_admins` in D1, never email matching, editable provider metadata, a client role flag or the first person to register. Both listing/inspection and decision operations check this authority server-side.

## Access and concurrency

The independent entry verifies the provider session, strips spoofed identity headers and checks admission before private application dispatch. Pending, draft, declined and correction-requested users can open their application/status endpoint, but cannot open operational dashboards, read private exports or write account/store/payment/billing APIs. Owner review has its own stricter check. Native page/API helpers enforce the same approval requirement; the old native host remains paused and hands protected browser navigation to the independent host.

Submission and decisions use positive revisions and a unique transition ID. The update, public review history and role-specific provisioning run in one D1 batch. Every later statement is conditional on that exact successful transition. A stale decision, withdrawn request, duplicate action or database failure cannot leave an approved record or partially provisioned portal. Approval never starts a subscription, sends money, configures a provider or automatically joins a brand program.

## Migration and deployment

`0011` is an append-only schema-only migration for three tables. Existing applied migrations are unchanged. `scripts/deploy-self-hosted.mjs` applies migrations, then executes the bounded `self-hosted/admission-bootstrap.sql` before deploying the new Worker. The SQL path is absolute to avoid working-directory ambiguity.

The bootstrap grants the sole initial admin only when the previously established account ID and its verified provider mapping both match. It preserves the current owner's approved access and original workspace/program/profile identifiers. Other existing business/profile accounts receive draft applications. Re-running the bootstrap does not overwrite applications or review decisions. It does not touch any payment credential, encrypted destination, original payment key or existing provider session.

The legacy encrypted transfer format remains a record of the completed original migration. It deliberately excludes platform admin authority and admission records and must not be used as a full export of the new admission system.

## Validation

Isolated SQL tests exercise both portal types, incomplete/tampered submissions, authority boundaries, corrections/resubmission, stale and withdrawn reviews, atomic rollback, exact bootstrap scope and original-record preservation. Real component rendering covers the profile forms, explicit reviewer controls, private navigation and escaping. Provider-boundary tests cover verified email, recovery, CSRF, session isolation and pending dispatch. Browser/device visual and real customer-email delivery checks remain separate from these automated checks.
