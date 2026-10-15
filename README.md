# Affimaro

Affimaro is an affiliate management product by Highlink. This private pilot includes a marketing website, an interactive sample dashboard, and database-backed account and program workflows.

## Available now

- ChatGPT sign-in through Sites, with a saved Affimaro profile.
- One business workspace and one editable affiliate program per account.
- Business settings, commission-rate and attribution-window settings, and application pause/resume.
- Affiliate profiles, program application pages, duplicate-safe applications, and owner review.
- Business-scoped activity records and affiliate-scoped application history.
- The original browser-local demo for sample orders, refunds, commissions, payment records and CSV exports.

Real workspaces begin empty. No demonstration accounts, sales or partners are seeded into the hosted database.

## Routes

- `/`: marketing website; `/#/demo/merchant/overview` opens the sample dashboard.
- `/account`: create or edit your Affimaro profile and choose a workspace.
- `/workspace`: business overview, partners, program rules and settings.
- `/partner`: affiliate profile and your own applications.
- `/join/[programId]`: application page for a specific program.
- `/api/account`, `/api/business`, `/api/affiliate`, `/api/program`, `/api/applications`: authenticated JSON write endpoints.

## Authentication and access

Hosted identity comes from the dispatch-owned Sites authentication integration in `app/chatgpt-auth.ts`. It requires a ChatGPT account. Independent email/password login is not implemented. Do not expose this Worker directly outside Sites while trusting client-supplied identity headers; an independent deployment requires a verified identity integration.

The Site remains owner-private. Sharing an application link does not grant access to the private pilot. A user may own a business and maintain an affiliate profile; they cannot apply to their own business program.

Every write derives the acting account from authenticated server headers. Workspace ownership is checked server-side; request data cannot select another owner. Writes require same-origin JSON, request bodies are limited to 16 KiB, SQL values are bound, and related inserts/updates use atomic D1 batches. No secrets are committed.

## Storage

`.openai/hosting.json` preserves the existing Site ID and declares the `DB` D1 binding. The schema is in `db/schema.ts`. Generated SQL and Drizzle metadata live in `drizzle/`; migrations contain schema only. Sites provisions the binding and applies hosted migrations during publication. Applied migrations are immutable.

The browser demo in `public/demo/` remains device-local and uses `affimaro.demo.v1`. Its role switch is a demonstration control and grants no server access.

## Development and verification

Use Node 24 for the test suite. Install and build through the Sites plugin helpers. The locked starter preserves Vinext and Sites deployment integration.

- `npm run check`: sample commission tests, all sample views, and SQLite-backed account, ownership, application, atomicity, validation and request-origin/body-limit tests.
- `npx tsc --noEmit`: TypeScript checks.
- `npm run db:generate`: append migrations after schema changes.

The domain service is tested against the generated SQL using Node SQLite and multiple independent test identities. Browser-based visual QA and a complete hosted sign-in-to-submit walkthrough were unavailable in the authoring environment.

## Remaining product work

Live WooCommerce authorization, verified referral/order/refund tracking, real commission and payout records, subscription billing, and the native mobile app still need to be built. The proposed plan limits remain provisional. Affimaro does not hold or transfer affiliate funds; businesses pay their affiliates directly.

The private GitHub repository contains source snapshots. GitHub Pages and automatic GitHub-to-Sites deployment are not configured.
