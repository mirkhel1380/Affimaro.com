# Affimaro

Affimaro is an affiliate management product by Highlink. This owner-private pilot includes a marketing website, an interactive sample dashboard, database-backed accounts/programs, and an installable WooCommerce tracking adapter.

## Available now

- ChatGPT sign-in through Sites and saved Affimaro profiles.
- One business workspace, editable program and WooCommerce connection per owner.
- Affiliate profiles, application pages, duplicate-safe applications and owner review.
- One-time per-store signing keys, rotation, pause/resume and signed connection verification.
- Consent-based store referral capture and approved affiliates’ referral links after verification.
- Signed order snapshots, deduplication, replay protection, monotonic order revisions and immutable attribution/currency.
- Estimated commissions on processing/completed orders, line-item partial refunds, full reversals, and review for unallocated partial refunds.
- Merchant/affiliate scoped order reports with separate currency/precision totals.
- The original device-local demo for sample payment records and CSV exports.

Real workspaces begin empty. No demonstration accounts, sales or partners are seeded into hosted storage. Building/downloading the adapter does not connect a store.

## Routes

- `/`: marketing website; `/#/demo/merchant/overview` opens the sample dashboard.
- `/account`: create/edit a profile and choose a workspace.
- `/workspace`: overview, partners, program, store setup, referred orders and settings.
- `/partner`: affiliate profile, memberships, verified store referral links and own orders.
- `/join/[programId]`: application page for a specific program.
- `/api/account`, `/api/business`, `/api/affiliate`, `/api/program`, `/api/applications`, `/api/store`: authenticated JSON writes.
- `/api/woocommerce/event`: separately authenticated machine endpoint for store ping, referral and order events.
- `/downloads/affimaro-woocommerce.zip`: generic installable plugin, with no credentials.

## Authentication and private access

Sites owns hosted identity through `app/chatgpt-auth.ts`; visitors need ChatGPT accounts. Independent email/password login is not implemented. Do not expose this Worker outside Sites while trusting caller-supplied identity headers; an independent deployment needs verified identity integration.

The Site remains owner-private. Sharing an application link does not grant private-pilot access. A business owner can maintain an affiliate profile but cannot apply to their own program.

User writes derive identity server-side, check ownership, require same-origin JSON and cap bodies at 16 KiB. The machine endpoint does not use browser identity or Origin as authorization: each request requires a store-scoped HMAC-SHA256 over the exact timestamp, event ID and raw body. Signatures expire after five minutes. Duplicate event IDs replay their original result and cannot change payload. Accounting and receipts commit together in atomic D1 batches.

The private dispatch gate runs before machine authentication. This pilot therefore also needs supported Sites service access installed only in the merchant server configuration. The plugin supports an optional credential bound to one exact Affimaro origin, follows no redirects and never exposes it to browsers. No platform credential is included in code/downloads. Do not change the Site audience just to make a webhook work. The plugin setup guide describes the remaining connection steps.

Per-store signing keys are confidential server-side D1 values. They are returned once to the authenticated owner on creation/rotation and excluded from all dashboard queries. Rotation preserves recorded referral IDs so later order/refund corrections still work after the store updates its key.

## WooCommerce adapter

Source: `integrations/woocommerce/affimaro/`. Setup and limitations: [plugin README](integrations/woocommerce/affimaro/README.md).

Classic and block checkout use separate WooCommerce hooks. Orders/metadata use WooCommerce CRUD for HPOS. Store-host Action Scheduler jobs deliver fresh snapshots and retry failures; the settings page shows the last delivery and offers manual retry. Standard statuses, 64-bit PHP and HTTPS are required. Verify both checkout types and your host’s scheduled-job execution in staging.

Referral capture uses the last accepted touch. Rate/expiry are locked at referral acceptance; changes affect new referrals. The first order must be created inside that window and received while the partner/program is active to qualify. Existing attributed order corrections remain possible after suspension, program pause or referral expiry. Net product totals after discounts exclude shipping, taxes and fees. Money uses integer minor units with half-up commission rounding. Unallocated partial refunds accrue zero until corrected in WooCommerce and retried.

Primary implementation references:
- [WooCommerce block checkout actions](https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/client/blocks/docs/third-party-developers/extensibility/hooks/actions.md)
- [HPOS extension recipe book](https://developer.woocommerce.com/docs/features/orders/high-performance-order-storage/recipe-book/)
- [WordPress PHP-WASM tooling](https://developer.wordpress.org/playground/developers/local-development/php-wasm-node/)

## Storage

`.openai/hosting.json` preserves the Site ID and declares D1 binding `DB`. `db/schema.ts` defines ten tables; `drizzle/` holds append-only schema migrations and metadata. Sites provisions D1 and applies migrations on publication. Applied migration `0000` is unchanged; `0001` adds connections, referrals, orders and event receipts. SQL values are bound and related writes use D1 batches.

The sample dashboard remains device-local (`affimaro.demo.v1`). Its role switch grants no server access, and its sample payments do not create real records.

## Development and verification

Use Node 24 for tests and the Sites helpers for install/build. Preserve the locked Vinext/Sites integration.

- `npm run check`: 30 Node tests covering demo behavior, SQL migrations, identity/tenant isolation, applications, atomicity, input validation, request limits, machine authentication, deduplication, accounting and refunds.
- `npx tsc --noEmit`: TypeScript checks.
- `npm run db:generate`: generate a new migration after schema changes; inspect SQL/metadata.
- `npm run plugin:package`: deterministically rebuild the generic ZIP and setup download after plugin changes.
- `node scripts/check-woocommerce.mjs`: executable isolated plugin checks with native PHP.
- Without native PHP, install `@php-wasm/node` and `@php-wasm/universal` in a separate QA directory, then pass that directory and optional PHP version to `scripts/check-woocommerce.mjs`. Do not add QA runtimes to the production bundle.

35 adapter assertions run on both PHP 7.4 and 8.3 with stubbed WordPress/WooCommerce boundaries. The complete hosted browser sign-in/forms, a real WooCommerce checkout, actual payment/refund gateway behavior, and merchant cron execution remain unverified. The environment provides no supported browser-preview surface, so browser visual QA could not run. This is a staging pilot.

## Remaining product work

Install/configure a real staging store and supported private service access, verify checkout end to end, then build commission approval/payment records, subscription billing and the native mobile app. Proposed subscription limits remain provisional. Affimaro holds/transfers no affiliate funds; each business pays its affiliates directly.

The private GitHub repository stores source snapshots. GitHub Pages and automatic GitHub-to-Sites deployment are not configured. The custom domain is not connected.
