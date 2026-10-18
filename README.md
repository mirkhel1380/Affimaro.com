# Affimaro

Affimaro is an affiliate management product by Highlink. The independent pilot includes a marketing website, an interactive sample dashboard, database-backed accounts/programs, an installable WooCommerce tracking adapter, a Shopify dashboard-sync adapter, manual bank/Wise-payment records, verified Stripe/Wise business account-access setup, and owner-confirmed USD Stripe transfers.

## Available now

- ChatGPT sign-in through Sites and saved Affimaro profiles.
- A separate independent Cloudflare build with Supabase verified email/password sign-in, OTP confirmation, password recovery and secure server sessions. The owner-created project and verified-email policy are selected. The original data/key migration and verified legacy mapping are complete, and the independent host is online for the owner's pilot. The owner reported successful sign-in and password recovery on 2026-10-18. Customer sending-domain verification and live store/payment walkthroughs remain pending. Both custom domains and an account-verified `workers.dev` origin are supported.
- An [installable mobile web app](docs/mobile-app.md) with Android/iPhone/desktop instructions, the same account, home-screen icons and a public reconnect screen. Account and payment data require a live connection and are excluded from its offline cache. Native app-store packages remain planned.
- Disabled-by-default owner-only encrypted migration, preserved legacy identities and a manual independent GitHub deployment workflow.
- One business workspace, editable program and one store connection (WooCommerce or Shopify) per owner.
- Affiliate profiles, application pages, duplicate-safe applications and owner review.
- One-time per-store signing keys, rotation, pause/resume and signed connection verification.
- Consent-based store referral capture and approved affiliates’ referral links after verification.
- Signed order snapshots, deduplication, replay protection, monotonic order revisions and immutable attribution/currency.
- Estimated commissions on processing/completed orders, line-item partial refunds, full reversals, and review for unallocated partial refunds.
- Merchant/affiliate scoped order reports with separate currency/precision totals.
- Owner approval of earned commission, encrypted affiliate bank details and destination snapshots.
- Duplicate-safe payment requests, reservations, review, cancellation and recorded bank-transfer references/receipt links.
- Refund adjustments carried into future commission, masked payment history and CSV exports.
- Verified merchant-owned Shopify app connection, encrypted token refresh and resumable manual GraphQL sync.
- Shopify native referral sessions, historical program rules, deferred-data holds and recent-sync gates on financial approvals.
- Owner-managed Stripe/Wise account-access checks, encrypted credentials, test/live environment validation and audited recheck/removal.
- Owner-enabled Stripe Express recipient setup, authenticated one-time onboarding links and verified receiving-account readiness.
- Encrypted Stripe payout destinations, owner-bound transfer review, durable idempotent attempts, explicit sending and manual reconciliation/reversal accounting.
- Manual transfer-method records for completed bank or Wise payments.
- Authenticated business/affiliate reports with UTC date and partnership filters, full-order aggregates, daily counts, separate currencies, current balances and scoped CSV exports.
- Owner-scoped Starter subscription review, durable Stripe Checkout attempts, verified paid/live entitlement, customer portal, usage display and optional paid-action enforcement.
- The original device-local demo for sample payment records and CSV exports.

Real workspaces begin empty. No demonstration accounts, sales or partners are seeded into hosted storage. Building/downloading the adapter does not connect a store.

## Routes

- `/`: marketing website; `/#/demo/merchant/overview` opens the sample dashboard.
- `/account`: create/edit a profile and choose a workspace.
- `/install`: install the independent web app from a supported browser.
- `/workspace`: overview, partners, program, store setup, referred orders and settings.
- `/partner`: affiliate profile, memberships, verified store referral links and own orders.
- `/payments?view=affiliate`: bank details, commission balances, requests and payment history.
- `/payments?view=business`: commission approvals, request review and completed-transfer records.
- `/join/[programId]`: application page for a specific program.
- `/api/account`, `/api/business`, `/api/affiliate`, `/api/program`, `/api/applications`, `/api/store`: authenticated JSON writes.
- `/api/payments`: same-origin authenticated bank/profile, approval, request and receipt actions.
- `/api/payments/export?view=merchant|partner`: authenticated CSV export of the selected role’s latest 100 records.
- `/reports`: dated business/affiliate performance, complete aggregates and explicitly all-time commission balances.
- `/billing`: business package features, usage, subscription status and explicit hosted Checkout/portal controls.
- `/api/billing`: authenticated owner-only `preview`, `checkout`, `refresh` and `portal` actions.
- `/api/reports/export`: private CSV export using the same report scope and date filters.
- `/api/stripe-transfers`: owner-only USD transfer preview, explicit send and status reconciliation.
- `/api/stripe-connect`: owner enablement, affiliate-only hosted onboarding and scoped receiving-account checks.
- `/api/payment-connections`: authenticated owner-only provider connection, access recheck and removal; no money-movement API.
- `/api/shopify`: authenticated store verification, pause/resume and bounded dashboard sync.
- `/api/woocommerce/event`: separately authenticated machine endpoint for store ping, referral and order events.
- `/downloads/affimaro-woocommerce.zip`: generic installable plugin, with no credentials.
- `/downloads/stripe-transfers-setup.md`: USD Stripe commission-transfer and recovery guide.
- `/downloads/stripe-connect-setup.md`: Stripe receiving-account onboarding guide.
- `/downloads/payments-setup.md`: Stripe/Wise account-access setup and manual-payment guide.
- `/downloads/shopify-setup.md`: merchant-owned Shopify app and sync guide.

## Authentication and private access

Sites owns identity for the owner-private native deployment through `app/chatgpt-auth.ts`; its visitors need ChatGPT accounts and that source is paused for cutover. The independent target at `https://affimaro-com.m-mirkhel20.workers.dev` implements verified Supabase email/password sign-in and strips untrusted identity headers at its entry point. Original data/key import and verified legacy mapping are complete; the owner's authenticated walkthrough remains pending. Follow the [independent-hosting guide](docs/independent-hosting.md) for the preserved migration record and remaining checks, or [Cloudflare GitHub setup](docs/cloudflare-github-setup.md) for the direct Git integration fields. Never expose the native Sites Worker outside its own dispatch integration.

The Site remains owner-private. Sharing an application link does not grant private-pilot access. A business owner can maintain an affiliate profile but cannot apply to their own program.

User writes derive identity server-side, check ownership, require same-origin JSON and cap bodies at 16 KiB. The machine endpoint does not use browser identity or Origin as authorization: each request requires a store-scoped HMAC-SHA256 over the exact timestamp, event ID and raw body. Signatures expire after five minutes. Duplicate event IDs replay their original result and cannot change payload. Accounting and receipts commit together in atomic D1 batches.

WooCommerce: the private dispatch gate runs before machine authentication. This pilot therefore also needs supported Sites service access installed only in the merchant server configuration. The plugin supports an optional credential bound to one exact Affimaro origin, follows no redirects and never exposes it to browsers. No platform credential is included in code/downloads. Do not change the Site audience just to make a webhook work. The plugin setup guide describes the remaining connection steps.

Per-store signing keys are confidential server-side D1 values. They are returned once to the authenticated owner on creation/rotation and excluded from all dashboard queries. Rotation preserves recorded referral IDs so later order/refund corrections still work after the store updates its key.

## WooCommerce adapter

Source: `integrations/woocommerce/affimaro/`. Setup and limitations: [plugin README](integrations/woocommerce/affimaro/README.md).

Classic and block checkout use separate WooCommerce hooks. Orders/metadata use WooCommerce CRUD for HPOS. Store-host Action Scheduler jobs deliver fresh snapshots and retry failures; the settings page shows the last delivery and offers manual retry. Standard statuses, 64-bit PHP and HTTPS are required. Verify both checkout types and your host’s scheduled-job execution in staging.

Referral capture uses the last accepted touch. Rate/expiry are locked at referral acceptance; changes affect new referrals. The first order must be created inside that window and received while the partner/program is active to qualify. Existing attributed order corrections remain possible after suspension, program pause or referral expiry. Net product totals after discounts exclude shipping, taxes and fees. Money uses integer minor units with half-up commission rounding. Unallocated partial refunds accrue zero until corrected in WooCommerce and retried.

Primary implementation references:
- [WooCommerce block checkout actions](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/client/blocks/docs/third-party-developers/extensibility/hooks/actions.md)
- [HPOS extension recipe book](https://developer.woocommerce.com/docs/features/orders/high-performance-order-storage/recipe-book/)
- [WordPress PHP-WASM tooling](https://developer.wordpress.org/playground/developers/local-development/php-wasm-node/)

## Shopify dashboard sync

Source/setup: [Shopify adapter guide](integrations/shopify/README.md). The adapter uses the merchant-owned app client-credentials flow and Admin GraphQL API `2026-10`. The app and store must belong to the same Shopify organization. This is not an App Store app or multi-merchant OAuth installation flow.

The Site remains private: each merchant-triggered sync makes outgoing Shopify API requests. No public webhook, app proxy, storefront script or unattended schedule is deployed. Native Shopify conversion sessions carry the affiliate referral/UTM fields. Only sessions attached to imported conversions are counted; full storefront click analytics are not available. Shopify's native 30-day history caps the program window for this connection.

Program rule history preserves the rate/window active at a recorded native session. Current partner/program eligibility is checked on first order ingestion. Missing session data is retried; incomplete monetary pages, source conflicts and unreadable imported orders hold payable commission at zero across reports and financial operations, while retaining the last verified source snapshot. A complete Shopify sync within five minutes is required to approve its commission/payment requests or record its bank payment. Currencies and merchant/affiliate ownership remain isolated.

Each request processes three changed orders and two pending retries, with cursor checkpoints and a short sync lease. Scope limitations, large orders/refund histories, native-attribution availability and cases held for review are documented in the setup guide. Real Shopify credentials and a live installation were not available; API tests use a mocked provider boundary. A real checkout/tax/refund walkthrough is still required.

## Stripe receiving-account setup

The [Stripe Connect guide](integrations/payments/stripe-connect-setup.md) describes an owner-enabled Express onboarding pilot using each business’s own Stripe platform. Approved affiliates consent before creating or continuing an account and enter verification/bank details on Stripe. The pilot supports recipients legally based in the business Stripe account’s country. Account identity, metadata, environment, transfer capability, payouts and outstanding requirements are checked from Stripe. USD commission account transfers use the separate [transfer workflow](integrations/payments/stripe-transfers-setup.md). Bank payouts are handled separately by Stripe. Returning from Stripe does not mark an account ready or a payment paid.

## Manual bank-payment workflow

For bank and Wise payments, the business sends the funds outside Affimaro and records the completed transfer here. Affimaro does not create a bank transfer, verify bank settlement, hold funds or offer an automatic cash-out. Stripe and Wise account access can be checked through the owner-only setup described in the [payment setup guide](integrations/payments/README.md). Owner-confirmed USD Stripe account transfers are implemented separately; Wise API transfers and direct bank payout APIs remain unimplemented. The Shopify adapter uses outgoing dashboard sync; Paddle and custom-site adapters remain pending.

1. The business approves an accrued order’s current revision and amount. A stale or ineligible order cannot be approved.
2. The affiliate saves a bank destination. Details are encrypted and dashboards show only currency and the last four account characters.
3. A request reserves the full approved available amount for one business/currency/precision group. A single active request is allowed per group. Repeated request IDs do not reserve money again. The destination is copied at request creation; later bank edits affect only future requests.
4. The business approves or declines the request. The affiliate can cancel while it is still requested. Declines/cancellations release reservations.
5. After making the transfer, the business selects bank or Wise, records a unique transfer reference, UTC payment date and optional private HTTPS receipt link, and confirms it already sent the displayed amount to that destination. This is labeled a business-recorded payment, not verified settlement. Paid records are immutable in this pilot.

Refunds immediately lower the payable approved cap. Request approval and payment recording atomically recheck coverage against current orders and all committed amounts. If an open request loses coverage, decline it and request the corrected balance. Refunds after recorded payment create a carry-forward adjustment against future commission in the same business/currency group. The system never attempts to debit an affiliate’s bank. Increases above a prior approval cap need a new merchant approval.

Bank destinations and receipt details use AES-256-GCM with random IVs and authenticated owner/request context. The runtime secret is `PAYMENT_DATA_KEY_V1`, configured through Sites as a secret, never in source or client code. Preserve this key: changing/removing it without a versioned re-encryption migration makes existing encrypted records unreadable. Full destination/receipt details are revealed only on an explicit same-origin authenticated request by that affiliate or the business owner, and access is audited. CSV exports exclude full bank details, receipt links and encrypted values, and neutralize spreadsheet formulas.

Partial requests, currency conversion, automated bank validation, Wise API payouts and manual-bank returned-transfer adjustments are not implemented. Stripe account transfers and provider-reported reversals are verified through manual status checks; bank settlement is separate. The merchant must ensure its bank can send the exact requested amount/currency to the provided destination before recording payment.

## Performance reports

The [report guide](docs/reports-guide.md) defines UTC date filters, role/partnership scope and current-state order performance. Reports aggregate every matching order, display currencies and precision separately, and provide daily counts and a bounded partnership table with explicit truncation. Current balances are labeled all time and preserve each partnership's reservations, net Stripe reversals and carry-forward debt before totals are combined. Reports are read-only; they do not sync stores, check Stripe or send funds. CSV exports use exact minor units, neutralize spreadsheet formulas and omit payment destinations, credentials and receipt details. No schema migration or new runtime secret is required.

## Software subscriptions

The [subscription setup guide](docs/subscriptions-setup.md) covers the Starter package, dedicated Affimaro billing configuration, owner-confirmed recurring Checkout, invoice/customer/price verification, optional new-business-action enforcement and Stripe customer portals. Checkout is disabled until its dedicated account/key/Price are configured; no final price or real payment has been supplied. Existing pilot access remains available by default. Growth/Business packages remain unimplemented. Sites authentication is preserved; email/password sign-in is implemented only in the separate independent target. This path does not use merchants' affiliate payout credentials.

## Storage

`.openai/hosting.json` preserves the Site ID and declares D1 binding `DB`. `db/schema.ts` defines twenty-five tables; `drizzle/` holds append-only schema migrations and metadata. Sites provisions D1 and applies migrations on publication. Applied migration `0000` is unchanged; `0001` adds connections, referrals, orders and event receipts; `0002` adds bank profiles, commission approvals and payout requests. `0003`–`0005` add store platform metadata, Shopify connection/retry state and program rule revisions. `0006` adds owner-scoped encrypted payment-provider connections. `0007` adds opt-in Stripe setup settings and recipient state. `0008` preserves existing bank-payment rows while adding payment methods, processing/transferred state, reversal amounts and durable Stripe transfer attempts. `0009` adds separate software billing accounts/checkouts. `0010` adds external identity mappings, encrypted server sessions, shared authentication throttles and frozen Checkout return origins. Earlier applied migrations are unchanged. SQL values are bound and related writes use D1 batches.

The sample dashboard remains device-local (`affimaro.demo.v1`). Its role switch grants no server access, and its sample payments do not create real records.

## Development and verification

Use Node 24 for tests and the Sites helpers for install/build. Preserve the locked Vinext/Sites integration.

- `npm run check`: automated Node tests covering demo behavior, SQL migrations, identity/tenant isolation, applications, atomicity, input validation, request limits, machine authentication, deduplication, accounting, refunds, encrypted payment data, authorization, reservation/payment races CSV safety, Shopify identity/scope checks, attribution, historical rules, sync checkpointing, retry holds and source-freshness approval gates, provider credential isolation, environment validation, connection check races and manual Wise records, Stripe setup ownership/consent, account creation idempotency, environment separation, recipient readiness, Stripe financial reservations/attempts, source and refund races, unknown-result recovery, verified reversals, audit rollback and legacy payout migration, dated reporting scope, full aggregates, balances, export privacy, truncation and exact monetary formatting, subscription pricing/consent, idempotent Checkout attempts, customer/invoice identity, test/live entitlements, portal boundaries, renewal changes and stale checks, external auth/CSRF/verification/recovery/session isolation, provider policy checks, migration encryption/constraints/key preservation, maintenance gates and deployment preflight.
- `npx tsc --noEmit`: TypeScript checks.
- `npm run build:self-hosted`: isolated independent build in `dist-self-hosted/`.
- `npm run build:cloudflare`: automated checks, TypeScript and independent build for Cloudflare Workers Builds.
- `npm run deploy:self-hosted -- --check`: read-only independent deployment/provider validation (requires configured account settings).
- `npm run db:generate`: generate a new migration after schema changes; inspect SQL/metadata.
- `npm run plugin:package`: deterministically rebuild the generic ZIP and setup download after plugin changes.
- `node scripts/check-woocommerce.mjs`: executable isolated plugin checks with native PHP.
- Without native PHP, install `@php-wasm/node` and `@php-wasm/universal` in a separate QA directory, then pass that directory and optional PHP version to `scripts/check-woocommerce.mjs`. Do not add QA runtimes to the production bundle.

35 adapter assertions run on both PHP 7.4 and 8.3 with stubbed WordPress/WooCommerce boundaries. The complete hosted browser sign-in/forms, a real WooCommerce checkout, actual payment/refund gateway behavior, manual bank-payment form walkthroughs, and merchant cron execution remain unverified. The environment provides no supported browser-preview surface, so browser visual QA could not run. This is a staging pilot.

## Remaining product work

Install/configure a real staging store and supported private service access, verify checkout end to end, then add Paddle/custom-site adapters, broader currency support and remaining payout integrations, configured independent hosting/email delivery and live authentication walkthrough, live subscription configuration, broader subscription tiers and the native mobile app. Starter currently follows the existing one-store/program/owner limits; future package limits remain provisional. Affimaro holds no affiliate funds. Each business pays directly from its own bank, Wise or Stripe account; the Stripe path requires explicit per-request confirmation.

The private GitHub repository stores source snapshots. GitHub Pages and automatic GitHub-to-Sites deployment are not configured. The custom domain is not connected.
