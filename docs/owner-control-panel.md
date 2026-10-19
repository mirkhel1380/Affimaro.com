# Independent owner control panel

The established Affimaro owner signs in at `/auth/owner/login` and manages the service at `/owner`. This uses the existing verified provider identity, original account ID, `platform_admins` grant and central D1 database. No replacement owner, database, workspace, payment key or migration import is created.

The public footer includes **Owner sign in**, a direct link to `/auth/owner/login` that works from another browser or device. The native preview forwards this link to the independent host; the independent website keeps it on its own domain. This is only a sign-in entry, not access to owner tools.

## Separate owner hostname

The independent build supports `OWNER_ORIGIN=https://admin.affimaro.com` alongside `APP_ORIGIN=https://affimaro.com`. These are optional cutover settings, not active defaults. The working Workers origin remains selected until DNS, TLS and the saved subscription origin have been reconciled. See [the domain cutover procedure](domain-cutover.md).

With `OWNER_ORIGIN` enabled, the public footer's **Owner sign in** link forwards to the separate owner hostname. Existing `/owner` and `/admin` bookmarks do the same. Owner authentication and owner APIs run only on the owner hostname; public-host mutations are rejected instead of forwarding passwords or action bodies. The owner hostname serves its dedicated control panel and required assets, not customer signup, pricing or any of the four customer portals. Its root opens `/owner` and its public-website link returns to the configured public domain.

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
