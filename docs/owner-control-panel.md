# Independent owner control panel

The established Affimaro owner signs in at `/auth/owner/login` and manages the service at `/owner`. This uses the existing verified provider identity, original account ID, `platform_admins` grant and central D1 database. No replacement owner, database, workspace, payment key or migration import is created.

The public footer and customer navigation have no owner sign-in link. The owner opens `/auth/owner/login` directly or saves that address as a private bookmark. The current working address is `https://affimaro-com.m-mirkhel20.workers.dev/auth/owner/login`; after the domain cutover, use `https://admin.affimaro.com/auth/owner/login`.

## Separate owner hostname

The independent build supports `OWNER_ORIGIN=https://admin.affimaro.com` alongside `APP_ORIGIN=https://affimaro.com`. These are optional cutover settings, not active defaults. The working Workers origin remains selected until DNS, TLS and the saved subscription origin have been reconciled. See [the domain cutover procedure](domain-cutover.md).

With `OWNER_ORIGIN` enabled, existing owner sign-in, `/owner` and `/admin` bookmarks forward to the separate owner hostname. No owner link is added to the public footer. Owner authentication and owner APIs run only on the owner hostname; public-host mutations are rejected instead of forwarding passwords or action bodies. The owner hostname serves its dedicated control panel and required assets, not customer signup, pricing or any of the four customer portals. Its root opens `/owner` and its public-website link returns to the configured public domain.

Owner login and recovery flow cookies are sealed for the owner origin. Session cookies remain `__Host-` cookies without a parent-domain attribute. Every private owner-host request checks the stored owner grant, including when a customer session token is replayed manually. There is no public owner registration. The existing account, grant, database and payment settings remain in place.

The owner entry does not offer public registration. Its sealed login/recovery flows are distinct from the four customer flows. A verified provider identity must already map to an account with a stored owner grant before an owner session is issued. Email, display name, user metadata, a submitted role and URL parameters never grant owner access. Every owner page and data operation checks the stored grant again. Removing the grant removes access even from an existing session.

The control panel contains:

- Overview and separate brand, affiliate, creator and agency account counts. The platform owner is excluded from customer counts.
- A searchable account directory, role filters, complete application profiles and account detail pages.
- Existing manual admission and package review, now within owner navigation at `/owner/applications`.
- Paginated operational views for programs, partnerships, referred sales/refunds/commissions, partner payout statuses, subscriptions, store connection summaries, agency clients, creator content and recorded activity.
- Email, payment-package and launch-readiness checks at `/owner/settings`. Existing `/admin/applications` and `/admin/setup` bookmarks render the owner shell with canonical owner links.

Authenticated owner visits to customer portals go to `/owner`; customer navigation has no administration links. Customer accounts remain in their original four permission scopes. Anonymous owner pages open the owner sign-in form. Approved customers and pending applicants cannot open owner pages, even when they know the URL.

Operational queries use explicit allowlisted projections. They do not select authentication credentials, sessions, encrypted provider credentials, raw signed-event payloads, bank destinations or payment receipts. Search values and offsets are bound parameters; dataset names are a fixed allowlist. Records are paginated in groups of 50. Financial totals are grouped by both currency and precision.

The owner panel monitors existing financial state. Opening it does not send payments, charge cards, impersonate customers or modify their financial records. Program commission approval and actual payments retain their existing explicit business-owner review and authorization workflows.

Platform setup guidance is kept in owner administration and private source documentation. Public subscription guidance contains customer package/payment steps only. Merchant-owned store/payment connection instructions still belong in the merchant portal.

Validation uses migrated SQLite fixtures, real server-rendered page components and independent authentication/provider-boundary tests. Browser layout verification remains dependent on a supported browser environment.

Profile applications remain in the owner review queue. Package review has been removed: an approved business account can purchase directly, and verified paid subscription evidence activates its capacity automatically. The retired package-review mutation returns 410 and cannot grant paid access.


## Application and ownership review

The application detail shows an ownership checklist for every URL on the saved profile, including a creator portfolio and an agency website. It identifies addresses that have not been added, properties still awaiting verification and evidence older than 180 days. The same criteria are enforced by the server when saving approval.

Use **Review this applicant’s property evidence** to open only that applicant’s properties. The default scoped view includes all statuses; switching status or saving a decision retains the selected applicant. **Return to this application** goes back to the same profile. Verifying ownership does not approve the account. Profile approval remains a separate explicit owner decision, and requesting changes or declining stays available while ownership is incomplete.

The owner overview includes pending ownership evidence under Needs your attention. Customer applications show the same ownership requirements so applicants can see what is missing. The owner's launch settings open customer registration on the public website domain, not the separate administration hostname.

### Search the complete application queue

At `https://admin.affimaro.com/owner/applications`, search by applicant display name, contact name, email or declared brand/agency name. Search is a literal case-insensitive substring; it does not search telephone numbers, private descriptions or reviewer notes. A malformed legacy profile does not prevent the remaining queue from loading.

Status, exact account type and search combine. Brand, affiliate, creator and agency types come from the saved account assignment, including applications stored under their earlier brand/affiliate family. Closed accounts and granted platform owners do not appear in the customer application queue or its pending counts. The four pending cards show all open customer applications, independent of search; each card opens that complete pending account-type queue.

The queue displays 50 applications per page, oldest submissions first, with an account-ID tie breaker. Every matching application remains reachable beyond the old 100-record ceiling. The total, page rows and global status/type counts share one read-only database batch. If another review or a narrower search removes the last page, the page resolves to the last available result page rather than becoming a misleading empty list. Page input is bounded to 1,000,000.

Opening a profile preserves the current queue's status, account type, search and page. Pagination retains the filters and clears the selected profile. Changing status or type retains search and starts at page one; submitting a new search also clears the page and selection. Invalid or repeated known filters show a recoverable reset link. After saving a decision, the same URL shows the selected profile's latest state; a stale last page is corrected and a reviewed profile no longer shows the decision form.

This work adds no automatic decisions, emails, portal provisioning or payments. The existing explicit review form, profile/channel verification, revision checks and atomic approval remain unchanged. Every queue read and selected-profile inspection still requires the stored owner grant. No source credentials, full profile JSON or reviewer transition tokens appear in list projections. The owner panel remains separate from the four customer portals and public navigation.

Isolated database and actual owner/legacy server-page fixtures cover more than 100 applications, all four account types, search and pagination links, closed/owner exclusions, old page recovery, manual review continuation, revoked grants and read-only behavior. A real authenticated owner walkthrough and dedicated mobile visual QA remain unexercised.
