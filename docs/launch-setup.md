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
