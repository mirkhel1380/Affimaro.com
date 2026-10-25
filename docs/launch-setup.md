# Owner launch setup

Open `/owner/settings` on the independent deployment. Only a stored `platform_admins` grant permits access; provider metadata and email addresses do not grant this permission. The owner navigation links to this page within the independent owner control panel.

The page checks the current deployment, not a different Site or Cloudflare environment. Refresh checks repeats read-only provider requests. It never changes a provider setting, sends an email, creates a checkout or charges a card. Responses never include credentials or raw provider errors.

## Email

The public Supabase settings check confirms that email authentication is enabled, signup is open and automatic email confirmation is disabled. Sender verification, SMTP credentials, delivery quotas and receipt of customer mail cannot be inferred from this endpoint. Customer delivery remains explicitly unverified.

On 2026-10-24 the owner explicitly confirmed the Supabase SMTP sender is `noreply@affimaro.com`. Read-only checks found the domain's published SPF, DMARC, Resend DKIM and sending-subdomain SPF records, and the selected Supabase project was healthy with email enabled, signup open and confirmation required. Published DNS and policy checks do not prove delivery: confirmation and password recovery still need an actual recipient walkthrough. Email confirmation remains required.

Provider settings: https://supabase.com/dashboard/project/bhxzkrypfxdheyjtxwqp/auth/smtp

References: https://supabase.com/docs/guides/auth/auth-smtp and https://resend.com/docs/api-reference/errors

## Subscription billing

Connect the intended Stripe account before setting up prices. The existing independent runtime expects server-side settings:

- `AFFIMARO_BILLING_STRIPE_KEY`, `AFFIMARO_BILLING_ACCOUNT_ID`
- `AFFIMARO_STARTER_PRICE_ID`: $19 USD per month
- `AFFIMARO_GROWTH_PRICE_ID`: $49 USD per month
- `AFFIMARO_BUSINESS_PRICE_ID`: $99 USD per month
- `AFFIMARO_BILLING_MODE`: `test` or `live`
- `AFFIMARO_BILLING_LIVE_ENABLED`: explicit `true` before live checkout
- `AFFIMARO_BILLING_REQUIRED`: explicit `true` to enforce paid business actions

Keep credentials out of source, chat, forms intended for customers and client bundles. Preserve the original payment encryption key. Configure these in the independent Worker's protected deployment environment; the native Site environment is separate.

The owner check reads the Stripe account, balance environment and each price through the same verification used by checkout. Every price must be active, fixed, monthly, licensed, in USD and exactly match its package. Test readiness is distinct from live readiness, and neither proves a successful payment. Payment encryption and subscription enforcement are shown separately.

Checkout retries retain their original return URL payload and idempotency key. The shared `/billing` return route forwards an agency into `/agency/billing`, preserving only supported package and checkout-status parameters. New customer-portal sessions return directly to the verified account's brand or agency billing page.

## Release verification

Automated checks cover owner-only status access, all six brand and agency prices, provider failures and oversized responses, secret redaction, all four role-specific recovery flows, session revocation after a reset, actual owner-page server rendering, and agency billing returns. They use isolated databases and mocked providers. These checks do not create real customers, send real mail or make purchases.

Before customer launch, separately verify confirmation and recovery delivery to an authorized customer recipient, then complete Stripe test checkout and status verification in the connected account before enabling live payments. A native mobile-store release is separate from the installable web app.

## Owner-confirmed on-site payment setup and application continuation

On 2026-10-24 the owner supplied the exact **Payments inside Affimaro — Enabled** message from the independent owner settings. Preserve that configured key and sender; do not repeat setup or request credentials. The read-only provider audit separately verified all six live brand/agency monthly prices, the existing enabled webhook with all nine signed subscription events, invoice history, payment-method updates and period-end cancellation. That confirms configuration, not a completed customer charge. Existing legacy callback URLs and payloads remain frozen.

A customer may select a package on pricing and then change it while completing the professional profile. After a successful final profile submission, a fresh brand/agency billing continuation now carries the submitted package. It stays in the account's own billing route while the profile waits for owner review. Submission failures keep the current location and draft. The existing review stores the selected plan, without granting paid capacity; the billing API quotes the role's current schedule after approval.

This adjustment applies only to fresh billing destinations with an optional single `plan` query. It does not rewrite saved checkout returns/cancellation URLs or invitation/program destinations. Free affiliate and creator accounts retain their existing continuation and remain excluded from subscription billing. Fictional previews retain their browser-local submission behavior.

The isolated journey tests connect actual signup and email-code handlers, the real application form's final submission callback, the real profile API, explicit owner review, the approved application page and role-correct billing quotes. Provider responses and ownership evidence are controlled fixtures; no real customer account, email, checkout or charge is created. Production inbox/payment and dedicated mobile/browser walkthroughs remain pending.

## Website ownership transport

Website TXT checks use the fixed Cloudflare DNS-over-HTTPS resolver with manual redirects. The pinned Workers runtime rejects `redirect: 'error'` before making a request; manual mode lets the request reach DNS while the existing non-success check rejects redirects without following them. The exact TXT name, record type and current challenge must still match. Ownership verification does not approve a professional profile.

The regression runs the production ownership service in the installed Workers runtime against isolated D1 tables from the actual ownership migration. It checks successful TXT verification, redirect rejection, wrong or missing records, malformed and oversized responses, in-flight code rotation and archiving, account boundaries, expiry, throttling and revision checks. Resolver responses are controlled fixtures; no production property is verified and no DNS record is changed. A real owner's website verification walkthrough remains pending.

## Current evidence and code renewal

The application overview, all four professional forms and the Channels & ownership manager now count the same current evidence used by profile review. The existing ownership policy remains 180 days from successful verification. A property's saved `verified` status alone is insufficient after that period or when its verification timestamp is missing or invalid.

The manager labels old evidence **Verification out of date**, explains what is needed and offers **Generate a fresh code**. An expired unverified code or a revoked property also requires a fresh code before the view offers DNS or public-proof controls. Current ownership remains verified when its original 14-day publication code expires; the view does not suggest resetting still-current evidence merely because that old code expired. Generating a new code uses the existing revision-checked renewal action and requires new evidence. It never approves a professional profile.

Regression checks render the actual manager and every role's actual application form. Isolated service journeys exercise stale evidence, renewal, DNS or manual proof review, stale-revision/code rejection and separate explicit owner profile approval without financial writes. Existing 180-day boundary checks remain in place. These are server-render and controlled-service checks; production website/email/payment walkthroughs and dedicated mobile/browser visual QA remain pending.

## Private workspace lists and owner account navigation

The agency client directory and creator content planner now search their own full saved records, filter by the appropriate status and use the account's saved page-size preference. Creator content also filters by platform. Totals, rows and the effective page use the same filtered scope; an edit moving the last matching row to another status returns to the remaining page. Agency capacity and active-client statistics stay global, and creator overview statistics retain their existing full-record scope. These read-only queries never create another program or store, change paid capacity or override the existing original-version edit checks.

Private list entry routes retain their known filters through sign-in; ambiguous authenticated filters show a reset option. A content entry whose saved partnership is no longer among approved choices keeps an explicit previous-partnership option. Saving it requires choosing an approved partnership or explicitly selecting no partnership. An ordinary edit no longer silently clears that association because a select option disappeared.

Owner directory links carry search, account type and the effective page into account details and back. Operational-record links carry a finite dataset key, search, page and applicable order-review filter; Back to records returns to that fixed dataset route. No caller-provided return URL or dataset source grants access. Repeated or invalid selected-account inputs show recoverable filter guidance instead of reaching a raw database binding. Direct server-rendered owner entry points also build bounded known-field sign-in destinations consistently. The independent admin-host bridge already carries its anonymous request path and query into sign-in; that earlier redirect and all authentication handlers remain unchanged.

Regression checks use actual protected views and isolated scoped records, including preference-sized pages, all statuses, literal search, empty and changed last pages, cross-account guards, account-detail round trips and existing owner password-login handlers with controlled provider replies. Reading these views never submits, approves or pays a request. No production account, email, provider configuration, DNS record, schema, financial record or frozen authentication/payment payload is changed by this follow-up. Production delivery, website/store/payment and dedicated mobile/browser walkthroughs remain pending.

## Partnership selections through sign-in

The four My partners / My brands entries retain their tab, invitation status, account-type filter, search and page when sign-in is required. Discovery retains its shortlist and directory filters; existing discovery invitation URLs pass their page and filters into the matching role's invitation inbox. Affiliate and creator partnership URLs retain their selected coupon or referral-link tab.

Only the known view fields are carried on each view's own fixed route. Repeated/array values, control-character fields and unrelated query parameters are omitted. Short status/page selections have priority; optional fields that exceed the existing 500-character authentication destination limit are omitted. Existing saved-role, profile-review, closed-account and owner guards still decide access after sign-in. A destination never submits, accepts or approves an invitation or application.

Regression checks invoke the actual protected views and existing password-login/session handlers, using isolated D1 data and controlled provider responses. They cover all four roles, generic discovery, the invitation inbox handoff, coupon/link tabs, destination tampering and existing access guards. These checks do not create production accounts, send mail or make payments. Supabase changelog and password-auth documentation were checked on 2026-10-25; provider configuration, authentication handlers, billing callbacks and payment payloads are unchanged.

## Resource history, private edits and DNS completion

Brand and agency resource libraries search and page through the full history of assets and coupon codes. Their publication-status filter distinguishes published and archived records; coupon availability still separately reports scheduled, expired or available. Twelve-row pages use the filtered total and recover the last remaining page after archiving. Search treats percent, underscore and backslash literally. Each query stays within the account's represented program. Editor, Cancel, archive-success and sign-in destinations keep the relevant tab and listing context. The existing 200-active-item caps, approved-partner assignment rules, revisions and audit writes are unchanged; archived history does not grant edit access.

Agency client and creator content edits carry the loaded record's exact `updated_at` value. An atomic comparison rejects an old tab's edit when the record has changed, or current account approval, role, closure or assigned-partnership checks no longer permit the edit. A successful edit always advances the timestamp, including two saves in the same millisecond. A conflict keeps the form's unsaved values and offers an explicit reload of the latest record. Creation limits and the existing paid-business API gate remain in place. No schema migration or new program/store authority is introduced.

DNS ownership must still have a current publication code and an open account when the verified result is written. A code expiring during the resolver request or account closure during that request cannot produce verified ownership or a successful review entry. Exact TXT, resolver limits, revisions, code rotation, archiving and separate manual profile approval retain their existing checks. Automated expiry checks use a controlled clock and isolated databases; no production property, DNS record or account is modified. Production email, store and payment walkthroughs and dedicated mobile/browser visual QA remain pending.

## Combined customer-workflow follow-up

Three independent areas were corrected together. My partners / My brands and invitation inboxes now select the last available 12-row page when a decision removes the old last page. Saved-profile discovery does the same when a member hides a listing. Filtered totals, search, role scope, sort and invitation/application state stay intact; an empty result uses page 1 with zero pages. The actual directory pager displays the page returned by the filtered query. Opening these views remains read-only.

Order, click, payment-history, commission-review and performance-report entries now keep their known filters and selected record through the existing sign-in and profile-review gates. Shared reports and agency/creator report wrappers retain their partnership and custom dates. Existing role checks, record ownership, query validators, subscription checks and signed financial actions still control access. The existing bounded destination helper prioritizes selected records and short filters; unrelated parameters never become action authority.

Settings retain a validated section through generic and four role entry routes. The existing password-recovery link returns to Security after recovery, reset and sign-in. Discarding preferences clears obsolete errors, and a successful profile save shows the normalized saved name. Account closure, session revocation, preference revisions and private data exports keep their existing checks.

Isolated regressions cover every role's pending applications and invitations after explicit declines, saved-directory pages after listing opt-out, actual server-rendered pagers, report/history login destinations and access guards, and settings UI/save/recovery journeys. Provider responses in password/recovery journeys are controlled fixtures. Production inbox, website/store/payment and dedicated mobile/browser walkthroughs remain pending; no production member, provider configuration, DNS record, financial record or frozen authentication/payment payload is changed by this follow-up.
