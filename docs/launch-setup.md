# Owner launch setup

Open `/owner/settings` on the independent deployment. Only a stored `platform_admins` grant permits access; provider metadata and email addresses do not grant this permission. The owner navigation links to this page within the independent owner control panel.

The page checks the current deployment, not a different Site or Cloudflare environment. Refresh checks repeats read-only provider requests. It never changes a provider setting, sends an email, creates a checkout or charges a card. Responses never include credentials or raw provider errors.

## Email

The public Supabase settings check confirms that email authentication is enabled, signup is open and automatic email confirmation is disabled. Sender verification, SMTP credentials, delivery quotas and receipt of customer mail cannot be inferred from this endpoint. Customer delivery remains explicitly unverified.

The current Resend test sender is suitable for the owner's own recipient. General customer delivery needs a verified sender domain configured in Supabase SMTP. Deferring the website's custom domain does not prevent using the existing Workers website address; do not turn off email confirmation to work around a sender restriction.

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
