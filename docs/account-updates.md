# In-portal account updates

Each customer portal has an **Overview → Updates** entry:

- Brand: `/workspace/updates`
- Affiliate: `/partner/updates`
- Creator: `/creator/updates`
- Agency: `/agency/updates`

The page combines the caller's own partnership applications, sent/received discovery invitations and commission payment requests. Each row represents the record's **latest saved state**, ordered by `updated_at`; it is not an immutable event history or an unread email inbox. Opening a row leads to the existing private application, invitation inbox or selected payment-history request. Existing action permissions and payment checks still apply in those destinations.

Category, literal name/program search and 7/30/90 UTC-day or all-date filters use the same scope for summary counts and displayed rows. The date window follows the last saved change, not original creation. Displayed times use the member's saved time zone and date format. Pages use their saved 25/50/100 row preference, deterministic ordering and last-page recovery. Amounts remain separate with their own currency and precision; there is no combined monetary total.

The server derives the role and user ID from the authenticated principal. It excludes foreign programs, inconsistent invitation senders and inconsistent payout/program/workspace associations. Explicit projections omit credentials, bank details, reviewer notes, contact details and private invitation text. This page does not expose a workspace-wide audit feed to affiliates or creators. Owner, unapproved and closed-account guards remain in place. No schema or provider configuration is changed.

All four account-free previews include a sample Updates page with working local search, category/date filters and reset. Preview links stay inside their own role prefix. These filters send no email, payment or API action and do not change preview partnerships or real data. Customer notification settings link to Updates; existing pending reminders remain separate.

The owner overview now lists **New contact messages** and **Support messages in progress** separately with filtered links into the existing private inbox. Counts refresh on page load and follow explicit inbox status changes. Customer message bodies and email credentials are not selected into the overview.

Validation covers isolated account and financial-record scopes, malformed filters, UTC boundaries, literal search, ties/page recovery, stale invitations, closed counterparties, faithful payment labels, actual protected-page sign-in continuations and access checks, preview filter behavior and owner inbox counts. No production customer, email, SMS, provider, payment or account state is mutated during validation. Full mobile/desktop browser visual QA remains deferred; responsive rules and theme inheritance are preserved.
