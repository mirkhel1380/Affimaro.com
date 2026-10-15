# Affimaro product preview

A private, buildless website and interactive business/affiliate demo for Affimaro, a product of Highlink.

The static entry point is `dist/index.html`. All assets are local. No package install or build is needed. The hosting manifest is `.openai/hosting.json`.

## Available in the demo

- Marketing website, planned packages and an honest integration roadmap.
- Business and affiliate dashboards with a shared browser-local sample workspace.
- Sample applications, approvals and suspensions; searchable/filterable tables.
- Sample sales with unique order IDs, commission rate snapshots and referral-window validation.
- Partial/full refunds for unpaid orders; commission approval and payment records.
- Affiliate-specific earnings and payment views, sample link copying and CSV exports.
- Demo reset. Browser storage is scoped to `affimaro.demo.v1`.

## Development scope

This is a UI and workflow prototype, not a production affiliate service. Role switching is for demonstration, not access control. Data is saved only in the current browser. All people, stores, clicks, orders and payment records shown are illustrative. Referral links use the reserved placeholder `store.example`.

No live authentication, database, WooCommerce tracking, subscriptions, emails, money transfers or native mobile app are implemented. Coupon attribution, multiple programs, APIs and team permissions on the proposed plan cards are future product scope. Paid-order refunds require a separate adjustment/recovery workflow and are intentionally blocked in this demo.

Run `npm run check` to check JavaScript syntax and verify commission arithmetic, duplicates, refund behavior, payment recording, rate snapshots and affiliate-scoped summaries. A browser-free smoke test also exercises all ten workspace views and the sale-to-payment flow. Responsive and accessibility behavior is implemented in the source; no browser-based visual QA was available in this execution environment.
