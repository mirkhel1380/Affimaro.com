# Affimaro subscriptions and package setup

Open **Plans & billing** in your account navigation. This is billing for Affimaro software, separate from each business's affiliate commission payments. Only the business owner can review a subscription, check its saved status or open its Stripe customer portal. Affiliate profiles and their existing commission/payment history do not require a business subscription.

## Available packages

**Starter** covers the capabilities implemented in this release: one website, one program and one business owner, WooCommerce or Shopify tracking, commission approvals, payment records, owner-confirmed USD Stripe transfers and performance reports. The database's existing one-store/program/owner constraints remain in force. No order or affiliate-volume quota is advertised or introduced in this pilot.

Growth and Business remain future packages. Multiple programs/stores, extra business seats, coupon attribution, team permissions and a customer API are not offered for purchase.

There is no hardcoded sale price. The business owner sees the verified configured Stripe price in a fresh review before continuing to hosted recurring Checkout. In the unconfigured private pilot, checkout is disabled and existing pilot access is preserved. No paid plan, trial deadline or charge is invented automatically.

## Configure the Affimaro billing account

Use an account belonging to the Affimaro software business. Do not use a customer's merchant payout credential from **Payments → Payment connections**. The billing adapter never reads that credential store.

Set these server runtime values through the hosting environment settings. Keep credentials out of chat, GitHub, browser storage, URLs and source files.

| Runtime name | Purpose |
| --- | --- |
| `AFFIMARO_BILLING_STRIPE_KEY` | Secret/restricted Stripe key for the selected Affimaro account and mode; mark this value secret |
| `AFFIMARO_BILLING_ACCOUNT_ID` | Expected Affimaro `acct_…` account ID; checked with Stripe before provider operations |
| `AFFIMARO_STARTER_PRICE_ID` | Your chosen `price_…` for Starter |
| `AFFIMARO_BILLING_MODE` | `test` or `live`; default is `test` |
| `AFFIMARO_BILLING_LIVE_ENABLED` | Must explicitly be `true` before a live checkout is offered |
| `AFFIMARO_BILLING_REQUIRED` | Default is false; enable only after live billing is configured and validated |

The key needs permissions for current-account and balance reads, Price reads, Checkout Session creation/retrieval, Subscription and expanded Invoice reads, and customer-portal session creation. Configure the Stripe customer portal for payment methods, invoices and cancellation. Disable plan or quantity changes to unsupported products; Affimaro only recognizes its saved single-quantity Starter price.

Create an **active, fixed-price USD monthly recurring Price**: per-unit billing, licensed usage, interval count one, positive integer minor-unit amount no greater than 99,999,999, no custom amount or quantity transformation. Test and live objects are separate. Account identity, key mode, balance mode and Price mode must agree.

Existing `PAYMENT_DATA_KEY_V1` encrypts checkout review tokens and saved hosted URLs with workspace/owner/attempt-specific context. Preserve that key; do not rotate or replace it without a data migration.

This pilot explicitly disables adaptive pricing, promotion codes and automatic tax, and restricts new checkouts to card payments. It does not calculate tax or configure tax registration, invoice defaults or the business's Stripe settings. Complete the required business configuration and real-provider tests before offering live purchases to customers.

## Review and buy Starter

1. Create an Affimaro profile and business workspace.
2. Open **Plans & billing → Review Starter subscription**.
3. Review the mode, verified USD monthly amount and available package features. The owner/workspace/account/price/mode-bound review expires after five minutes.
4. Explicitly confirm continuing to Stripe's recurring subscription checkout.
5. Complete the hosted Stripe checkout. Affimaro does not receive card numbers.
6. Return to Plans & billing and select **Check subscription status**.

The return page is read-only. A query parameter, page visit or browser-reported payment does not activate a package. A live entitlement requires a matching provider subscription with one matching Starter item, a paid latest invoice, an active current billing period and a recent successful verification. The item-level billing period fields are used for the pinned Stripe API version, `2026-09-30.endive`.

An active test subscription is displayed as test data and never grants live paid access. Past-due, unpaid, paused, trialing, incomplete, canceled, expired-period or unverified records do not grant the live entitlement.

## Duplicate prevention and recovery

A checkout attempt is saved before its provider POST, with a frozen price, amount, customer snapshot, workspace correlation and stable idempotency key. A workspace/account/mode operation lease prevents concurrent checkout operations. Only one creating/open/review attempt exists for that billing account.

Opening another review resumes a known open session after a fresh provider check. An expired, unpaid session with no subscription can be closed and replaced only after its exact identity and remote state have been verified. Returning via the cancellation URL does not itself expire a session.

If a response is lost before a session ID is saved, a fresh confirmed review retries the same attempt and payload with its original idempotency key. Unknown attempts older than 23 hours are held, rather than risking a new subscription after Stripe's idempotency cache window. No self-service reset/attachment flow is provided; review the metadata in Stripe before support-assisted recovery. Resolve pending checkouts before changing the pinned return origin or deploying changes to the checkout payload.

A known nonterminal subscription blocks another purchase, including past-due or unpaid subscriptions. Use the customer portal and status checks instead. A verified canceled or incomplete-expired subscription can be followed by another explicit checkout. Existing completed attempts remain recorded.

## Verification and access enforcement

Subscription status is checked through the owner-authenticated dashboard. No webhook, background billing schedule, automatic refund, direct subscription modification or direct invoice-payment endpoint is installed. Stripe manages the recurring subscription after the customer confirms it there.

When `AFFIMARO_BILLING_REQUIRED=true`, paid access is checked before:

- Approving an affiliate application.
- Saving an active program configuration.
- Creating a new WooCommerce or Shopify connection.

Successful live subscription verification is cached for up to fifteen minutes, never past the recorded billing-period end. A protected action refreshes stale verification on the server. Failure after cache expiry blocks that new paid action; test mode or missing live configuration also fails closed. The cache means a provider change may take up to fifteen minutes to affect an action unless the owner explicitly checks it sooner.

Accounts, existing tracking, corrections/refunds, payment requests, commission approvals/transfers, reports and history remain accessible. Program pause, affiliate suspension/decline, store security-key rotation, connection maintenance and manual Shopify sync remain available for safe operation of existing records. This enforcement policy does not discard store orders or commissions because a software subscription is overdue, and is not a full traffic shutoff for existing programs.

New-workspace creation remains available so a business can reach setup and billing. Database constraints limit it to one workspace, program and store. No extra paid seats or hidden volume overage is enabled.

## Invoices and cancellation

After a verified customer/subscription is saved, **Manage subscription & invoices** creates an ephemeral portal session for that saved customer, after checking the original billing account and mode. Customers review and confirm payment-method changes and cancellation on Stripe. Only HTTPS links on the exact `billing.stripe.com` host are accepted. Portal tokens are not persisted or logged.

Check subscription status after returning. Scheduled cancellation remains visible with its period end; paid access continues only while the active paid period and verification are current. Renewal updates use the provider's current item period and latest invoice. Changing the configured Stripe account or mode does not inherit a different account's live entitlement.

## Privacy and implementation

`/api/billing` accepts authenticated same-origin JSON actions `preview`, `checkout`, `refresh` and `portal`. Amounts, Price IDs, customer IDs, subscription IDs, return origins and provider endpoints cannot be chosen by a browser request. Provider HTTP calls use fixed HTTPS endpoints, refused redirects, a ten-second timeout and bounded response bodies. Errors are sanitized.

The new `0009` migration adds `billing_accounts` and `billing_checkouts`; earlier migrations and financial data are unchanged. Hosted checkout URLs are encrypted, review tokens are short-lived and owner-bound, related status/audit writes are atomic, and existing bank destinations/Stripe commission flows remain separate.

Hosted return links are currently pinned to `https://affimaro-preview.kindsky66.chatgpt.site/billing`. Keep the Site owner-private during the pilot. Do not make it public to receive webhooks. Custom-domain configuration and any future webhook endpoint require a separate deployment/access design.

## Authentication and verification limits

This release preserves the supported Sites authentication integration. Sites owns hosted sign-in; independent email/password registration is not implemented here. A supported independent hosting/authentication deployment remains a separate task.

Automated SQLite/provider-boundary tests exercise tenant isolation, quote/consent validation, price/account/mode mismatches, encrypted URLs, idempotent retries, duplicate purchase prevention, unknown-result holds, exact subscription/customer/invoice verification, live/test entitlement separation, period and renewal changes, expired-session handling, customer portals, leases, audit rollback and stale-provider failures. They use controlled responses. No Affimaro billing credential or final Price was supplied, no real Stripe checkout or card charge was executed, and authenticated browser/mobile QA remains pending because a supported browser QA surface is unavailable.

Official references: [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create), [Checkout retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve), [Price object](https://docs.stripe.com/api/prices/object), [Subscription object](https://docs.stripe.com/api/subscriptions/object), [Item-level billing periods](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end), [Customer portal sessions](https://docs.stripe.com/api/customer_portal/sessions/create), [Idempotent requests](https://docs.stripe.com/api/idempotent_requests).
